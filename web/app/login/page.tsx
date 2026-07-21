import { Suspense } from "react";
import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/login-form";
import { SettingsMenu } from "@/components/settings-menu";
import { parseLocaleCookie, translate } from "@/lib/i18n/dictionaries";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const locale = parseLocaleCookie(cookieStore.get("locale")?.value);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="absolute right-4 top-4">
        <SettingsMenu />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{translate(locale, "app.title")}</CardTitle>
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
