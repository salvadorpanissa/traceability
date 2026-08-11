import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransferForm } from "@/components/activities/transfer-form";
import { listSelectableEstablishments } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function TransferActivityPage() {
  const session = await requireSession();
  const establishments = await listSelectableEstablishments(session.user.id, session.user.role);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Traslado</CardTitle>
      </CardHeader>
      <CardContent>
        <TransferForm establishments={establishments} />
      </CardContent>
    </Card>
  );
}
