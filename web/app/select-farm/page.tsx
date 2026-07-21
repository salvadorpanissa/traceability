import { getSelectableFarms, selectFarmAction } from "./actions";
import { FarmPicker } from "@/components/farm-picker";
import { AutoSelectFarm } from "@/components/auto-select-farm";

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
    return <AutoSelectFarm farmId={farms[0].id} onSelect={selectFarmAction} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <FarmPicker farms={farms} onSelect={selectFarmAction} />
    </div>
  );
}
