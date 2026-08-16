"use server";

import { z } from "zod";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { isLoginLocked, recordFailedLogin } from "@/lib/dal/login-attempts";
import { resolveSafeRedirect } from "@/lib/safe-redirect";

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

  if (await isLoginLocked(parsed.data.email)) {
    return { error: "Demasiados intentos. Probá de nuevo en unos minutos." };
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
      await recordFailedLogin(parsed.data.email);
      return { error: "Email o contraseña incorrectos" };
    }
    throw error;
  }
}

export async function googleSignInAction(returnTo: string | null): Promise<void> {
  const redirectTo = resolveSafeRedirect(returnTo);
  await signIn("google", { redirectTo });
}
