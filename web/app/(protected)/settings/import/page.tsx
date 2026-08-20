import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tip } from "@/components/ui/tip";
import { ImportForm } from "@/components/settings/import-form";
import { requireSession } from "@/lib/dal/session";

export default async function ImportSettingsPage() {
  await requireSession();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Importar/Editar animales</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportForm />
        </CardContent>
      </Card>
      <Tip>
        Si la caravana del archivo ya existe, se actualizan sus datos generales. Antes de
        confirmar podés revisar qué se va a crear y qué se va a editar. Un animal nuevo también
        puede darse de alta directamente desde una actividad (Sanidad, Traslado, Venta), sin pasar
        por esta importación.
      </Tip>
    </div>
  );
}
