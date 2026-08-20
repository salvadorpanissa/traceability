import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tip } from "@/components/ui/tip";
import { TransferForm } from "@/components/activities/transfer-form";
import { listSelectableEstablishments } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function TransferActivityPage() {
  const session = await requireSession();
  const establishments = await listSelectableEstablishments(session.user.id, session.user.role);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Traslado / Venta</CardTitle>
        </CardHeader>
        <CardContent>
          <TransferForm establishments={establishments} />
        </CardContent>
      </Card>
      <Tip>
        La guía SNIG define automáticamente si es venta o traslado según el campo destino. Los traslados también se
        pueden realizar al registrar una sanidad.
      </Tip>
    </div>
  );
}
