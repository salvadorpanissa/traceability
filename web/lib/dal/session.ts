import { auth } from "@/auth";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("No autenticado");
  }
  return session;
}
