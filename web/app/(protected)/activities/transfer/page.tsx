import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransferForm } from "@/components/activities/transfer-form";
import { getSelectableFarms } from "@/app/select-farm/actions";

export default async function TransferActivityPage() {
  const farms = await getSelectableFarms();

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Traslado</CardTitle>
      </CardHeader>
      <CardContent>
        <TransferForm farms={farms} />
      </CardContent>
    </Card>
  );
}
