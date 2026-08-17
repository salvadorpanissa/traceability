import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tip } from "@/components/ui/tip";
import { ImportForm } from "@/components/settings/import-form";
import { requireSession } from "@/lib/dal/session";

export default async function ImportSettingsPage() {
  await requireSession();

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Importar caravanas existentes</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Tip>
          Esta herramienta permite incorporar a la plataforma los animales que ya tiene registrados
          en otro sistema o planilla, sin necesidad de cargarlos uno por uno. También es posible
          incorporar animales de forma individual a través de las actividades habituales — por
          ejemplo, al registrar un evento de Sanidad, Traslado o Venta con una caravana que todavía
          no existe en el sistema, el animal se da de alta automáticamente con los datos de esa
          actividad.
        </Tip>
        <ImportForm />
      </CardContent>
    </Card>
  );
}
