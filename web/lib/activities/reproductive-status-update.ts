import { eq } from "drizzle-orm";
import { animal } from "@/db/schema";
import type { db } from "@/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// A diferencia de gapFillBreed/gapFillSecondaryTag (que solo completan un
// campo vacío), esto sobrescribe siempre — un nuevo diagnóstico de preñez en
// Sanidad reemplaza al anterior, no se acumula. `null` significa "esta fila
// no traía dato" (valor sin mapear o columna sin usar), no "vaciar el
// estado" — por eso es un no-op, nunca limpia un valor ya cargado.
export async function updateReproductiveStatus(
  tx: Transaction,
  animalId: string,
  reproductiveStatusId: string | null
): Promise<void> {
  if (!reproductiveStatusId) return;
  await tx.update(animal).set({ reproductiveStatusId }).where(eq(animal.id, animalId));
}
