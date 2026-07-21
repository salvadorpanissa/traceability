import { cookies } from "next/headers";
import { getSelectableFarms, selectFarmAction } from "./actions";
import { FarmPicker } from "@/components/farm-picker";
import { AutoSelectFarm } from "@/components/auto-select-farm";
import { parseLocaleCookie, translate } from "@/lib/i18n/dictionaries";

export default async function SelectFarmPage() {
  const farms = await getSelectableFarms();

  if (farms.length === 0) {
    const cookieStore = await cookies();
    const locale = parseLocaleCookie(cookieStore.get("locale")?.value);
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p>{translate(locale, "selectFarm.noFarms")}</p>
      </div>
    );
  }

  if (farms.length === 1) {
    return <AutoSelectFarm farmId={farms[0].id} onSelect={selectFarmAction} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <FarmPicker farms={farms} onSelect={selectFarmAction} />
    </div>
  );
}
