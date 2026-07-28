import { redirect } from "next/navigation";
import { auth } from "@/auth";

// redirect() (not throw) because this runs in a Server Component render path
// (app/(protected)/layout.tsx) where a thrown Error would bubble past any
// error.tsx in the same segment straight to the nearest parent boundary —
// there isn't one, so an expired session would show a raw crash screen
// instead of sending the user back to /login.
export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}
