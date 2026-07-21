import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAccount, role } from "@/db/schema";

// Fixed dummy bcrypt hash (not a real credential) used to compare against when
// no user is found, so authorize() takes the same amount of time whether or
// not the email exists. This prevents a timing-based user-enumeration attack.
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8FoJHF9M5H0Y0GaTMd/lyOgP8gsC1O";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const [user] = await db
          .select({
            id: userAccount.id,
            name: userAccount.name,
            email: userAccount.email,
            passwordHash: userAccount.passwordHash,
            roleName: role.name,
          })
          .from(userAccount)
          .innerJoin(role, eq(userAccount.roleId, role.id))
          .where(eq(userAccount.email, email))
          .limit(1);

        const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !passwordMatches) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.roleName };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) token.role = user.role;
      return token;
    },
    session: async ({ session, token }) => {
      session.user.id = token.sub!;
      session.user.role = token.role;
      return session;
    },
  },
});
