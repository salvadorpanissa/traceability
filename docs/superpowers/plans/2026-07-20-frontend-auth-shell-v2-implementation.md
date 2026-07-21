# Frontend Auth Shell v2 (Postgres local + Auth.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the frontend from scratch on Postgres local + Auth.js — login, farm selection, app shell, and a dashboard placeholder — replacing the removed Supabase-based `web/` app (commit `e509810`).

**Architecture:** Next.js App Router app in `web/`, talking to a local Postgres via Drizzle ORM (`node-postgres` driver). Auth.js (Credentials provider, JWT session) replaces Supabase Auth. Row Level Security is replaced by a Data Access Layer (`lib/dal/`) — plain TypeScript functions that every Server Action must call before touching the database. `middleware.ts` gates all routes except `/login`. The active farm is tracked in an `active_farm_id` cookie, never in the URL.

**Tech Stack:** Next.js (App Router) · TypeScript · Tailwind CSS + shadcn/ui · Auth.js v5 (Credentials provider, JWT sessions) · Drizzle ORM + `drizzle-kit` (Postgres) · `pg` driver · `bcryptjs` for password hashing · `zod` for input validation · Vitest + Testing Library (unit/integration) · Playwright (E2E) · Postgres 16 via Docker Compose for local dev/test.

## Global Constraints

- Immutability: never mutate objects in place; DAL/Server Action helpers return new values (from `coding-style.md`).
- Files: 200–400 lines typical, 800 max — split by responsibility, not by technical layer (from `coding-style.md`).
- Validate all input at system boundaries (form submissions) with `zod`; fail fast with clear messages (from `coding-style.md`).
- No hardcoded secrets or environment-specific values — everything through env vars (from `coding-style.md`, `security.md`).
- Every Server Action must verify session + farm access via the DAL before querying the database — this is the RLS replacement (from the spec, `2026-07-20-frontend-auth-shell-design-v2.md`).
- Login errors must be generic ("email o contraseña incorrectos"), never revealing whether the email exists (from the spec).
- The active farm lives in the `active_farm_id` cookie, not in the URL or route params (from the spec).
- Desktop-first UI — no mobile-specific layout work in this plan (from the spec).
- Scope: only `role`, `farm`, `user_account`, `user_farm` are rebuilt in this plan. `category`, `product`, `animal`, `paddock`, and the event system are out of scope — they belong to the activity-loading/dashboard-reports rebuild plans, once this auth shell lands.

---

### Task 1: Scaffold the Next.js app and local Postgres

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/postcss.config.mjs`, `web/eslint.config.mjs`
- Create: `web/app/layout.tsx`, `web/app/globals.css`, `web/app/page.tsx`
- Create: `web/.env.local.example`, `web/.gitignore`
- Create: `docker-compose.yml` (repo root), `docker/init-test-db.sql`

**Interfaces:**
- Produces: a running `npm run dev` Next.js app on `localhost:3000`, and a running Postgres reachable at `localhost:5432` with two databases: `traceability` (dev) and `traceability_test` (integration tests).

- [ ] **Step 1: Scaffold Next.js**

Run:
```bash
cd /Users/salvadorpanissa/Documents/traceability
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --no-turbopack --yes
```
Expected: `web/` created with the standard Next.js App Router layout.

- [ ] **Step 2: Add root docker-compose for local Postgres**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: traceability
      POSTGRES_PASSWORD: traceability_dev_password
      POSTGRES_DB: traceability
    ports:
      - "5432:5432"
    volumes:
      - traceability_pgdata:/var/lib/postgresql/data
      - ./docker/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql

volumes:
  traceability_pgdata:
```

`docker/init-test-db.sql`:
```sql
CREATE DATABASE traceability_test;
```

- [ ] **Step 3: Start Postgres and verify both databases exist**

Run:
```bash
docker compose up -d postgres
sleep 3
docker compose exec postgres psql -U traceability -d traceability -c "\l" | grep traceability
```
Expected: both `traceability` and `traceability_test` listed.

- [ ] **Step 4: Add env file template**

`web/.env.local.example`:
```
DATABASE_URL=postgres://traceability:traceability_dev_password@localhost:5432/traceability
DATABASE_URL_TEST=postgres://traceability:traceability_dev_password@localhost:5432/traceability_test
AUTH_SECRET=replace-with-a-32-byte-random-string
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=changeme123
```

Copy it locally (not committed):
```bash
cd web && cp .env.local.example .env.local
```

- [ ] **Step 5: Verify the dev server boots**

Run: `cd web && npm run dev &` then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`. Stop the dev server (`kill %1`) before continuing.

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/package-lock.json web/tsconfig.json web/next.config.ts web/postcss.config.mjs web/eslint.config.mjs web/app web/.env.local.example web/.gitignore docker-compose.yml docker/init-test-db.sql
git commit -m "feat: scaffold Next.js app and local Postgres via Docker Compose"
```

---

### Task 2: Add shadcn/ui base components

**Files:**
- Create: `web/components.json`
- Create: `web/components/ui/button.tsx`, `web/components/ui/input.tsx`, `web/components/ui/label.tsx`, `web/components/ui/card.tsx`

**Interfaces:**
- Produces: `Button`, `Input`, `Label`, `Card`/`CardHeader`/`CardTitle`/`CardContent` components under `@/components/ui/*`, used by every page task below.

- [ ] **Step 1: Init shadcn/ui**

Run:
```bash
cd web
npx shadcn@latest init -d
npx shadcn@latest add button input label card
```
Expected: `web/components.json` and `web/components/ui/{button,input,label,card}.tsx` created.

- [ ] **Step 2: Verify it builds**

Run: `cd web && npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add web/components.json web/components/ui web/app/globals.css
git commit -m "feat: add shadcn/ui base components"
```

---

### Task 3: `role` and `farm` tables (Drizzle schema + migration)

**Files:**
- Create: `web/drizzle.config.ts`
- Create: `web/db/schema/role.ts`, `web/db/schema/farm.ts`, `web/db/schema/index.ts`
- Create: `web/db/client.ts`, `web/db/index.ts`
- Create: `web/test/db.ts`, `web/test/reset-db.ts`
- Create: `web/__tests__/schema/role-farm.test.ts`
- Modify: `web/package.json` (add `drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`, `tsx`, `vitest`, test scripts)

**Interfaces:**
- Produces: `role` table (`id`, `name` unique), `farm` table (`id`, `name`, `dicoseCode`, `ruc`); `db` (default client, `DATABASE_URL`), `createDbClient(connectionString)` factory, `testDb` (test client, `DATABASE_URL_TEST`), `resetTestDb()`.

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd web
npm install drizzle-orm pg bcryptjs zod next-auth@beta
npm install -D drizzle-kit @types/pg @types/bcryptjs tsx vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

- [ ] **Step 2: Write the failing schema test**

`web/test/db.ts`:
```ts
import { createDbClient } from "@/db/client";

if (!process.env.DATABASE_URL_TEST) {
  throw new Error("DATABASE_URL_TEST is not set — copy .env.local.example to .env.local");
}

export const testDb = createDbClient(process.env.DATABASE_URL_TEST);
```

`web/test/reset-db.ts`:
```ts
import { sql } from "drizzle-orm";
import { testDb } from "./db";

export async function resetTestDb() {
  await testDb.execute(
    sql`TRUNCATE TABLE user_farm, user_account, farm, role RESTART IDENTITY CASCADE`
  );
}
```

`web/__tests__/schema/role-farm.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("role table", () => {
  it("stores a role and enforces unique names", async () => {
    await testDb.insert(role).values({ name: "admin" });
    const rows = await testDb.select().from(role);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("admin");

    await expect(testDb.insert(role).values({ name: "admin" })).rejects.toThrow();
  });
});

describe("farm table", () => {
  it("stores a farm with optional DICOSE/RUC", async () => {
    await testDb.insert(farm).values({ name: "Campo Norte" });
    const rows = await testDb.select().from(farm);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Campo Norte");
    expect(rows[0].dicoseCode).toBeNull();
    expect(rows[0].ruc).toBeNull();
  });
});
```

`web/vitest.config.mts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./") },
  },
});
```

`web/vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

Add to `web/package.json` `scripts`:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "tsx db/migrate.ts",
"db:migrate:test": "tsx db/migrate.ts \"$DATABASE_URL_TEST\"",
"db:seed": "tsx db/seed.ts",
"test": "vitest run",
"test:e2e": "playwright test"
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `cd web && npm test -- role-farm`
Expected: FAIL — `Cannot find module '@/db/schema'` (schema doesn't exist yet).

- [ ] **Step 3: Write the schema and client**

`web/db/schema/role.ts`:
```ts
import { pgTable, uuid, text } from "drizzle-orm/pg-core";

export const role = pgTable("role", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
});
```

`web/db/schema/farm.ts`:
```ts
import { pgTable, uuid, text } from "drizzle-orm/pg-core";

export const farm = pgTable("farm", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  dicoseCode: text("dicose_code"),
  ruc: text("ruc"),
});
```

`web/db/schema/index.ts`:
```ts
export * from "./role";
export * from "./farm";
```

`web/db/client.ts`:
```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export function createDbClient(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}
```

`web/db/index.ts`:
```ts
import { createDbClient } from "./client";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const db = createDbClient(process.env.DATABASE_URL);
```

`web/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
```

`web/db/migrate.ts`:
```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDbClient } from "./client";

async function run() {
  const connectionString = process.argv[2] ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Provide a connection string argument or set DATABASE_URL");
  }
  const db = createDbClient(connectionString);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied to", connectionString.replace(/:[^:@]+@/, ":***@"));
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 4: Generate and apply migrations to both databases**

Run:
```bash
cd web
npm run db:generate
npm run db:migrate
npm run db:migrate:test
```
Expected: a new file under `web/drizzle/0000_*.sql` creating `role` and `farm`; both commands print "Migrations applied".

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npm test -- role-farm`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/package-lock.json web/drizzle.config.ts web/db web/test web/__tests__/schema web/vitest.config.mts web/vitest.setup.ts
git commit -m "feat: add role and farm tables via Drizzle"
```

---

### Task 4: `user_account` and `user_farm` tables

**Files:**
- Create: `web/db/schema/user.ts`
- Modify: `web/db/schema/index.ts`
- Create: `web/__tests__/schema/user.test.ts`

**Interfaces:**
- Consumes: `role` (Task 3), `farm` (Task 3).
- Produces: `userAccount` table (`id`, `name`, `email` unique, `passwordHash`, `roleId` fk), `userFarm` table (composite pk `(userId, farmId)`). `passwordHash` is a deviation from the original `2026-07-18-database-schema-design.md` spec (which assumed Supabase Auth managed credentials) — required for Auth.js's Credentials provider.

- [ ] **Step 1: Write the failing test**

`web/__tests__/schema/user.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, userFarm } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("user_account and user_farm", () => {
  it("links a manager to their farms and enforces unique email", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [farmSur] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();

    const [user] = await testDb
      .insert(userAccount)
      .values({
        name: "Encargado Norte",
        email: "encargado@example.com",
        passwordHash: "hashed",
        roleId: managerRole.id,
      })
      .returning();

    await testDb.insert(userFarm).values([
      { userId: user.id, farmId: farmNorte.id },
      { userId: user.id, farmId: farmSur.id },
    ]);

    const links = await testDb.select().from(userFarm);
    expect(links).toHaveLength(2);

    await expect(
      testDb.insert(userAccount).values({
        name: "Duplicado",
        email: "encargado@example.com",
        passwordHash: "hashed",
        roleId: managerRole.id,
      })
    ).rejects.toThrow();

    await expect(
      testDb.insert(userFarm).values({ userId: user.id, farmId: farmNorte.id })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- schema/user`
Expected: FAIL — `userAccount` is not exported from `@/db/schema`.

- [ ] **Step 3: Write the schema**

`web/db/schema/user.ts`:
```ts
import { pgTable, uuid, text, primaryKey } from "drizzle-orm/pg-core";
import { role } from "./role";
import { farm } from "./farm";

export const userAccount = pgTable("user_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => role.id),
});

export const userFarm = pgTable(
  "user_farm",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.farmId] }),
  })
);
```

`web/db/schema/index.ts`:
```ts
export * from "./role";
export * from "./farm";
export * from "./user";
```

Update `web/test/reset-db.ts` — table list already includes `user_account`/`user_farm`, no change needed.

- [ ] **Step 4: Generate and apply migration**

Run:
```bash
cd web
npm run db:generate
npm run db:migrate
npm run db:migrate:test
```
Expected: new migration file adding `user_account` and `user_farm`; both apply cleanly.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npm test -- schema/user`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/db/schema web/__tests__/schema/user.test.ts web/drizzle
git commit -m "feat: add user_account and user_farm tables"
```

---

### Task 5: Seed script

**Files:**
- Create: `web/db/seed.ts`

**Interfaces:**
- Consumes: `db` (Task 3), `role`/`farm`/`userAccount`/`userFarm` (Tasks 3–4).
- Produces: idempotent seed inserting `admin`/`manager` roles, one dev farm, and one dev admin user, driven by `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` env vars.

- [ ] **Step 1: Write the seed script**

`web/db/seed.ts`:
```ts
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { role, farm, userAccount } from "./schema";

async function upsertRole(name: string) {
  const [existing] = await db.select().from(role).where(eq(role.name, name));
  if (existing) return existing;
  const [created] = await db.insert(role).values({ name }).returning();
  return created;
}

async function run() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set");
  }

  const adminRole = await upsertRole("admin");
  await upsertRole("manager");

  const [existingFarm] = await db.select().from(farm).where(eq(farm.name, "Campo Norte"));
  const devFarm = existingFarm ?? (await db.insert(farm).values({ name: "Campo Norte" }).returning())[0];

  const [existingAdmin] = await db.select().from(userAccount).where(eq(userAccount.email, adminEmail));
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await db.insert(userAccount).values({
      name: "Admin",
      email: adminEmail,
      passwordHash,
      roleId: adminRole.id,
    });
  }

  console.log(`Seeded: admin (${adminEmail}), farm "${devFarm.name}"`);
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against the dev database**

Run: `cd web && npm run db:seed`
Expected: `Seeded: admin (admin@example.com), farm "Campo Norte"`. Running it a second time prints the same line without erroring (idempotent).

- [ ] **Step 3: Commit**

```bash
git add web/db/seed.ts
git commit -m "feat: add idempotent seed script for roles, dev farm, and admin user"
```

---

### Task 6: Auth.js configuration + session DAL

**Files:**
- Create: `web/auth.ts`, `web/app/api/auth/[...nextauth]/route.ts`, `web/types/next-auth.d.ts`
- Create: `web/lib/dal/session.ts`
- Create: `web/__tests__/dal/session.test.ts`

**Interfaces:**
- Consumes: `db`, `userAccount`, `role` (Tasks 3–4), `bcryptjs`.
- Produces: `auth()`, `signIn()`, `signOut()`, `handlers` from `@/auth`; `requireSession()` from `@/lib/dal/session`, which throws `"No autenticado"` when there is no session and otherwise returns the Auth.js session (with `session.user.id` and `session.user.role` populated).

- [ ] **Step 1: Write the failing test**

`web/__tests__/dal/session.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { requireSession } from "@/lib/dal/session";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

const { auth } = await import("@/auth");

describe("requireSession", () => {
  it("returns the session when authenticated", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", email: "a@example.com", role: "admin" },
    } as never);

    const session = await requireSession();
    expect(session.user.id).toBe("user-1");
  });

  it("throws when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("No autenticado");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- dal/session`
Expected: FAIL — `Cannot find module '@/lib/dal/session'`.

- [ ] **Step 3: Write Auth.js config and the session DAL**

`web/types/next-auth.d.ts`:
```ts
import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
  interface User {
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
  }
}
```

`web/auth.ts`:
```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAccount, role } from "@/db/schema";

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

        if (!user) return null;

        const passwordMatches = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatches) return null;

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
```

`web/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

`web/lib/dal/session.ts`:
```ts
import { auth } from "@/auth";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("No autenticado");
  }
  return session;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- dal/session`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/auth.ts web/app/api/auth web/types/next-auth.d.ts web/lib/dal/session.ts web/__tests__/dal/session.test.ts
git commit -m "feat: configure Auth.js Credentials provider and session DAL"
```

---

### Task 7: Farm-access DAL (RLS replacement)

**Files:**
- Create: `web/lib/dal/farm-access.ts`
- Create: `web/__tests__/dal/farm-access.test.ts`

**Interfaces:**
- Consumes: `db`, `userFarm` (Task 4).
- Produces: `isAdmin(role?: string): boolean`, `userFarmIds(userId: string): Promise<string[]>`, `requireFarmAccess(userId: string, role: string | undefined, farmId: string): Promise<void>` (throws `"No tenés acceso a este campo"` when a non-admin lacks access).

- [ ] **Step 1: Write the failing test**

`web/__tests__/dal/farm-access.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, userFarm } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { isAdmin, userFarmIds, requireFarmAccess } = await import("@/lib/dal/farm-access");

beforeEach(async () => {
  await resetTestDb();
});

describe("isAdmin", () => {
  it("is true only for the admin role", () => {
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("manager")).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});

describe("userFarmIds + requireFarmAccess", () => {
  it("lists a manager's assigned farms and blocks access to others", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [farmSur] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "m@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: user.id, farmId: farmNorte.id });

    const ids = await userFarmIds(user.id);
    expect(ids).toEqual([farmNorte.id]);

    await expect(requireFarmAccess(user.id, "manager", farmNorte.id)).resolves.toBeUndefined();
    await expect(requireFarmAccess(user.id, "manager", farmSur.id)).rejects.toThrow(
      "No tenés acceso a este campo"
    );
  });

  it("lets admins access any farm without a user_farm row", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "a@example.com", passwordHash: "x", roleId: adminRole.id })
      .returning();

    await expect(requireFarmAccess(admin.id, "admin", farmNorte.id)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- dal/farm-access`
Expected: FAIL — `Cannot find module '@/lib/dal/farm-access'`.

- [ ] **Step 3: Write the DAL**

`web/lib/dal/farm-access.ts`:
```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userFarm } from "@/db/schema";

export function isAdmin(role: string | undefined): boolean {
  return role === "admin";
}

export async function userFarmIds(userId: string): Promise<string[]> {
  const rows = await db.select({ farmId: userFarm.farmId }).from(userFarm).where(eq(userFarm.userId, userId));
  return rows.map((row) => row.farmId);
}

export async function requireFarmAccess(
  userId: string,
  role: string | undefined,
  farmId: string
): Promise<void> {
  if (isAdmin(role)) return;
  const farmIds = await userFarmIds(userId);
  if (!farmIds.includes(farmId)) {
    throw new Error("No tenés acceso a este campo");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- dal/farm-access`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/dal/farm-access.ts web/__tests__/dal/farm-access.test.ts
git commit -m "feat: add farm-access DAL to replace RLS checks"
```

---

### Task 8: Route protection middleware

**Files:**
- Create: `web/middleware.ts`
- Create: `web/e2e/middleware.spec.ts`

**Interfaces:**
- Consumes: `auth` from `@/auth` (Task 6).
- Produces: unauthenticated requests to any path other than `/login` redirect to `/login?returnTo=<original path>`.

- [ ] **Step 1: Write the middleware**

`web/middleware.ts`:
```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = ["/login"];

export default auth((req) => {
  const isPublic = PUBLIC_PATHS.some((path) => req.nextUrl.pathname.startsWith(path));
  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("returnTo", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Write the E2E check (will pass once Task 12's login page exists — placeholder route is fine for now)**

`web/e2e/middleware.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("redirects unauthenticated requests to /login with returnTo", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL(/\/login\?returnTo=%2Fdashboard/);
  expect(page.url()).toContain("returnTo=%2Fdashboard");
});
```

Note: this test only runs meaningfully once `/login` exists (Task 12) and `/dashboard` is a real route (Task 15) — leave it written now, run it as part of Task 15's verification.

- [ ] **Step 3: Commit**

```bash
git add web/middleware.ts web/e2e/middleware.spec.ts
git commit -m "feat: add middleware protecting all routes except /login"
```

---

### Task 9: `/login` page

**Files:**
- Create: `web/app/login/actions.ts`, `web/app/login/page.tsx`
- Create: `web/components/login-form.tsx`
- Create: `web/__tests__/login-form.test.tsx`

**Interfaces:**
- Consumes: `signIn` (Task 6), shadcn `Button`/`Input`/`Label`/`Card` (Task 2).
- Produces: `loginAction(prevState, formData)` Server Action returning `{ error: string | null }`; `<LoginForm />` client component.

- [ ] **Step 1: Write the failing component test**

`web/__tests__/login-form.test.tsx`:
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/login-form";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/login/actions", () => ({
  loginAction: vi.fn(async () => ({ error: "Email o contraseña incorrectos" })),
}));

describe("LoginForm", () => {
  it("shows the server error after a failed submit", async () => {
    render(<LoginForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "bad@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "wrong");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(await screen.findByText("Email o contraseña incorrectos")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- login-form`
Expected: FAIL — `Cannot find module '@/components/login-form'`.

- [ ] **Step 3: Write the Server Action and component**

`web/app/login/actions.ts`:
```ts
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
  const redirectTo = typeof returnTo === "string" && returnTo.startsWith("/") ? returnTo : "/dashboard";

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
```

`web/components/login-form.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/dashboard";
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}
```

`web/app/login/page.tsx`:
```tsx
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Trazabilidad de ganado</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- login-form`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/login web/components/login-form.tsx web/__tests__/login-form.test.tsx
git commit -m "feat: add /login page with Auth.js Credentials sign-in"
```

---

### Task 10: `/select-farm` page

**Files:**
- Create: `web/app/select-farm/actions.ts`, `web/app/select-farm/page.tsx`
- Create: `web/components/farm-picker.tsx`
- Create: `web/__tests__/select-farm-actions.test.ts`

**Interfaces:**
- Consumes: `requireSession` (Task 6), `isAdmin`/`userFarmIds` (Task 7), `db`/`farm` (Task 3).
- Produces: `getSelectableFarms(): Promise<{id: string; name: string}[]>`, `selectFarmAction(farmId: string): Promise<never>` (sets the `active_farm_id` cookie and redirects to `/dashboard`).

- [ ] **Step 1: Write the failing test**

`web/__tests__/select-farm-actions.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../test/db";
import { resetTestDb } from "../test/reset-db";
import { role, farm, userAccount, userFarm } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/lib/dal/session", () => ({ requireSession: vi.fn() }));

const { requireSession } = await import("@/lib/dal/session");
const { getSelectableFarms } = await import("@/app/select-farm/actions");

beforeEach(async () => {
  await resetTestDb();
});

describe("getSelectableFarms", () => {
  it("returns only the manager's assigned farms", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    await testDb.insert(farm).values({ name: "Campo Sur" });
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "m@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: user.id, farmId: farmNorte.id });

    vi.mocked(requireSession).mockResolvedValue({
      user: { id: user.id, role: "manager" },
    } as never);

    const farms = await getSelectableFarms();
    expect(farms).toEqual([{ id: farmNorte.id, name: "Campo Norte" }]);
  });

  it("returns an empty list for a manager with no assigned farms", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Sin campo", email: "s@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();

    vi.mocked(requireSession).mockResolvedValue({
      user: { id: user.id, role: "manager" },
    } as never);

    expect(await getSelectableFarms()).toEqual([]);
  });

  it("returns all farms for an admin", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    await testDb.insert(farm).values([{ name: "Campo Norte" }, { name: "Campo Sur" }]);
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "a@example.com", passwordHash: "x", roleId: adminRole.id })
      .returning();

    vi.mocked(requireSession).mockResolvedValue({
      user: { id: admin.id, role: "admin" },
    } as never);

    expect(await getSelectableFarms()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- select-farm-actions`
Expected: FAIL — `Cannot find module '@/app/select-farm/actions'`.

- [ ] **Step 3: Write the actions, picker, and page**

`web/app/select-farm/actions.ts`:
```ts
"use server";

import { inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { farm } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { isAdmin, userFarmIds } from "@/lib/dal/farm-access";

export async function getSelectableFarms() {
  const session = await requireSession();
  const role = session.user.role;
  const userId = session.user.id;

  if (isAdmin(role)) {
    return db.select({ id: farm.id, name: farm.name }).from(farm);
  }

  const allowedFarmIds = await userFarmIds(userId);
  if (allowedFarmIds.length === 0) return [];
  return db.select({ id: farm.id, name: farm.name }).from(farm).where(inArray(farm.id, allowedFarmIds));
}

export async function selectFarmAction(farmId: string) {
  const session = await requireSession();
  const role = session.user.role;
  const userId = session.user.id;

  if (!isAdmin(role)) {
    const allowedFarmIds = await userFarmIds(userId);
    if (!allowedFarmIds.includes(farmId)) {
      throw new Error("No tenés acceso a este campo");
    }
  }

  const cookieStore = await cookies();
  cookieStore.set("active_farm_id", farmId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/dashboard");
}
```

`web/components/farm-picker.tsx`:
```tsx
"use client";

import { Button } from "@/components/ui/button";

type Farm = { id: string; name: string };

export function FarmPicker({
  farms,
  onSelect,
}: {
  farms: Farm[];
  onSelect: (farmId: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {farms.map((f) => (
        <form key={f.id} action={onSelect.bind(null, f.id)}>
          <Button type="submit" variant="outline" className="w-full">
            {f.name}
          </Button>
        </form>
      ))}
    </div>
  );
}
```

`web/app/select-farm/page.tsx`:
```tsx
import { getSelectableFarms, selectFarmAction } from "./actions";
import { FarmPicker } from "@/components/farm-picker";

export default async function SelectFarmPage() {
  const farms = await getSelectableFarms();

  if (farms.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p>No tenés campos asignados. Contactá al administrador.</p>
      </div>
    );
  }

  if (farms.length === 1) {
    await selectFarmAction(farms[0].id);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <FarmPicker farms={farms} onSelect={selectFarmAction} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- select-farm-actions`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/app/select-farm web/components/farm-picker.tsx web/__tests__/select-farm-actions.test.ts
git commit -m "feat: add /select-farm page with auto-select and no-farms edge case"
```

---

### Task 11: Protected app shell + logout

**Files:**
- Create: `web/lib/actions/logout.ts`
- Create: `web/components/app-shell.tsx`, `web/components/logout-button.tsx`
- Create: `web/app/(protected)/layout.tsx`
- Create: `web/__tests__/app-shell.test.tsx`

**Interfaces:**
- Consumes: `requireSession` (Task 6), `signOut` (Task 6), `db`/`farm` (Task 3), cookie `active_farm_id` (Task 10).
- Produces: `<AppShell userName activeFarmName>` layout wrapper; `logoutAction()` Server Action; the `(protected)` route group layout that redirects to `/select-farm` when there's no valid active farm.

- [ ] **Step 1: Write the failing component test**

`web/__tests__/app-shell.test.tsx`:
```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/app-shell";

describe("AppShell", () => {
  it("shows the active farm name and user name", () => {
    render(
      <AppShell userName="Encargado Norte" activeFarmName="Campo Norte">
        <p>contenido</p>
      </AppShell>
    );

    expect(screen.getByText("Campo Norte")).toBeInTheDocument();
    expect(screen.getByText("Encargado Norte")).toBeInTheDocument();
    expect(screen.getByText("Cambiar campo")).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- app-shell`
Expected: FAIL — `Cannot find module '@/components/app-shell'`.

- [ ] **Step 3: Write the shell, logout action, and protected layout**

`web/lib/actions/logout.ts`:
```ts
"use server";

import { signOut } from "@/auth";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
```

`web/components/logout-button.tsx`:
```tsx
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/logout";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost">
        Cerrar sesión
      </Button>
    </form>
  );
}
```

`web/components/app-shell.tsx`:
```tsx
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

export function AppShell({
  userName,
  activeFarmName,
  children,
}: {
  userName: string;
  activeFarmName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">{activeFarmName}</span>
        <div className="flex items-center gap-4">
          <Link href="/select-farm" className="text-sm underline">
            Cambiar campo
          </Link>
          <span className="text-sm">{userName}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

`web/app/(protected)/layout.tsx`:
```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { farm } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { AppShell } from "@/components/app-shell";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const cookieStore = await cookies();
  const activeFarmId = cookieStore.get("active_farm_id")?.value;

  if (!activeFarmId) {
    redirect("/select-farm");
  }

  const [activeFarm] = await db.select({ id: farm.id, name: farm.name }).from(farm).where(eq(farm.id, activeFarmId));

  if (!activeFarm) {
    redirect("/select-farm");
  }

  return (
    <AppShell userName={session.user.name ?? session.user.email ?? ""} activeFarmName={activeFarm.name}>
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- app-shell`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/actions/logout.ts web/components/app-shell.tsx web/components/logout-button.tsx "web/app/(protected)/layout.tsx" web/__tests__/app-shell.test.tsx
git commit -m "feat: add protected app shell layout with farm switch and logout"
```

---

### Task 12: `/dashboard` placeholder page

**Files:**
- Create: `web/app/(protected)/dashboard/page.tsx`

**Interfaces:**
- Produces: `/dashboard` route rendering inside the `(protected)` layout from Task 11. Real report content is out of scope — see `docs/superpowers/specs/2026-07-20-dashboard-reports-design.md` for the follow-up plan.

- [ ] **Step 1: Write the placeholder page**

`web/app/(protected)/dashboard/page.tsx`:
```tsx
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">
        Los reportes (stock por potrero, existencias por categoría) se agregan en un plan aparte.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd web && npm run build`
Expected: build succeeds, `/dashboard` listed as a route.

- [ ] **Step 3: Commit**

```bash
git add "web/app/(protected)/dashboard/page.tsx"
git commit -m "feat: add /dashboard placeholder page"
```

---

### Task 13: End-to-end flow (login → select-farm → dashboard → logout)

**Files:**
- Create: `web/playwright.config.ts`
- Modify: `web/e2e/middleware.spec.ts` (unskip/verify, from Task 8)
- Create: `web/e2e/auth-flow.spec.ts`
- Create: `web/e2e/global-setup.ts`

**Interfaces:**
- Consumes: the full stack from Tasks 1–12, plus a seeded test database.
- Produces: a Playwright suite that runs against `npm run dev` pointed at `traceability_test`, seeded fresh before the run.

- [ ] **Step 1: Configure Playwright to use the test database and seed it**

`web/e2e/global-setup.ts`:
```ts
import { execSync } from "node:child_process";

export default async function globalSetup() {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST is not set");
  }
  execSync(`DATABASE_URL="${testUrl}" npm run db:seed`, {
    stdio: "inherit",
    env: {
      ...process.env,
      SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
      SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD ?? "changeme123",
    },
  });
}
```

`web/playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
    },
  },
});
```

- [ ] **Step 2: Write the E2E flow**

`web/e2e/auth-flow.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("login, farm selection (auto-skip for single farm), and logout", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();

  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText("Dashboard")).toBeVisible();
  await expect(page.getByText("Campo Norte")).toBeVisible();

  await page.getByRole("button", { name: /cerrar sesión/i }).click();
  await page.waitForURL(/\/login/);
});

test("rejects invalid credentials with a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill("wrong-password");
  await page.getByRole("button", { name: /ingresar/i }).click();

  await expect(page.getByText("Email o contraseña incorrectos")).toBeVisible();
});
```

- [ ] **Step 3: Run the full E2E suite**

Run:
```bash
cd web
DATABASE_URL_TEST=$DATABASE_URL_TEST npx playwright test
```
Expected: all specs pass, including `e2e/middleware.spec.ts` from Task 8.

- [ ] **Step 4: Commit**

```bash
git add web/playwright.config.ts web/e2e
git commit -m "test: add end-to-end auth flow (login, farm selection, dashboard, logout)"
```

---

## Post-plan follow-ups (not in this plan)

- Migrating the event-sourcing schema (`category`, `product`, `animal`, `animal_tag_history`, `batch_operation`, `event` + children, `animal_current_state`, `paddock`) from the removed Supabase migrations to Drizzle — needed before `dashboard-reports` or `activity-loading` can be rebuilt.
- User management screen (admin creates managers) — referenced as out of scope in the spec.
- SNIG integration (`docs/superpowers/specs/2026-07-20-snig-integration-design.md`) — depends on the event schema above.
