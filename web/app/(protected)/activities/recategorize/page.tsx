import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecategorizeForm } from "@/components/activities/recategorize-form";
import { listSelectableFarms } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function RecategorizeActivityPage() {
  const session = await requireSession();
  const farms = await listSelectableFarms(session.user.id, session.user.role);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Recategorización</CardTitle>
      </CardHeader>
      <CardContent>
        <RecategorizeForm farms={farms} />
      </CardContent>
    </Card>
  );
}
