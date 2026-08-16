import { Suspense } from "react";
import { cookies } from "next/headers";
import { AppLogo } from "@/components/app-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { parseLocaleCookie, translate } from "@/lib/i18n/dictionaries";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const locale = parseLocaleCookie(cookieStore.get("locale")?.value);

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-muted to-background p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <AppLogo className="size-11 shrink-0" />
          <CardTitle className="mt-2 text-xl">{translate(locale, "app.title")}</CardTitle>
          <CardDescription>{translate(locale, "login.tagline")}</CardDescription>
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
