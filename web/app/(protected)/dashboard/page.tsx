import { cookies } from "next/headers";
import { parseLocaleCookie, translate } from "@/lib/i18n/dictionaries";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const locale = parseLocaleCookie(cookieStore.get("locale")?.value);

  return (
    <div>
      <h1 className="text-xl font-semibold">{translate(locale, "dashboard.title")}</h1>
      <p className="text-muted-foreground">{translate(locale, "dashboard.reportsNotice")}</p>
    </div>
  );
}
