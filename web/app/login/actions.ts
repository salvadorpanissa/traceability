"use server";

import { z } from "zod";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginState = { error: string | null };

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Email o contraseña incorrectos" };
  }

  const returnTo = formData.get("returnTo");
  // Only accept a same-origin relative path: a single leading "/" not followed by
  // another "/". Rejects protocol-relative URLs like "//evil.com", which browsers
  // resolve to "https://evil.com" and would otherwise enable an open redirect
  // (CWE-601) since returnTo is fully attacker-controlled via the query string.
  const isSafeRelativePath = typeof returnTo === "string" && /^\/(?!\/)/.test(returnTo);
  const redirectTo = isSafeRelativePath ? returnTo : "/dashboard";

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo,
    });
    return { error: null };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email o contraseña incorrectos" };
    }
    throw error;
  }
}
