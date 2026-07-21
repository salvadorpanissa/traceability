"use server";

import { z } from "zod";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginState = { error: string | null };

// Fixed fake origin used only to resolve `returnTo` through the URL parser.
// Browsers normalize backslashes and repeated slashes right after the leading
// "/" the same way for special (http/https) schemes, so resolving against a
// fixed base and checking the resulting origin catches every such variant
// (e.g. "//evil.com", "/\\evil.com", "/\\/evil.com") without having to
// enumerate them via regex — closing the CWE-601 open redirect for good.
const SAFE_REDIRECT_BASE = "http://localhost";

function resolveSafeRedirect(returnTo: FormDataEntryValue | null): string {
  if (typeof returnTo !== "string" || returnTo.length === 0) {
    return "/dashboard";
  }

  let resolved: URL;
  try {
    resolved = new URL(returnTo, SAFE_REDIRECT_BASE);
  } catch {
    return "/dashboard";
  }

  if (resolved.origin !== SAFE_REDIRECT_BASE) {
    return "/dashboard";
  }

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Email o contraseña incorrectos" };
  }

  const redirectTo = resolveSafeRedirect(formData.get("returnTo"));

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
