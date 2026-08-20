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
        Este formulario permite importar animales que usted tenga registrados en otra aplicación.
        Si las caravanas existen en el sistema, se actualizan sus datos. Un animal nuevo también puede darse de
        alta directamente desde una sanidad o traslado, sin pasar por esta importación.
      </Tip>
    </div>
  );
}
