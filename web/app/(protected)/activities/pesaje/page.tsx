import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PesajeForm } from "@/components/activities/pesaje-form";
import { listSelectableFarms, listSelectableEstablishments } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function PesajeActivityPage() {
  const session = await requireSession();
  const [farms, establishments] = await Promise.all([
    listSelectableFarms(session.user.id, session.user.role),
    listSelectableEstablishments(session.user.id, session.user.role),
  ]);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Pesaje</CardTitle>
      </CardHeader>
      <CardContent>
        <PesajeForm farms={farms} establishments={establishments} />
      </CardContent>
    </Card>
  );
}
