import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransferForm } from "@/components/activities/transfer-form";

export default function TransferActivityPage() {
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Traslado</CardTitle>
      </CardHeader>
      <CardContent>
        <TransferForm />
      </CardContent>
    </Card>
  );
}
