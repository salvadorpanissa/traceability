"use server";

import { z } from "zod";
import { requireSession } from "@/lib/dal/session";
import { requireEstablishmentAccess } from "@/lib/dal/farm-access";
import { getAnimalEditState, updateAnimalDetails, type AnimalLookupDetail } from "@/lib/dal/animal-access";
import { confirmSingleRecategorize } from "@/lib/activities/recategorize-single";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

export type UpdateAnimalActionResult = { ok: true; animal: AnimalLookupDetail } | { ok: false; error: string };

const updateAnimalSchema = z.object({
  animalId: z.string().uuid(),
  sex: z.enum(["male", "female"]).nullable(),
  breed: z.string().trim().nullable(),
  birthDate: z.string().trim().nullable(),
  ownerId: z.string().uuid().nullable(),
  secondaryTag: z.string().trim().nullable(),
  categoryId: z.string().uuid().nullable(),
  reproductiveStatusId: z.string().uuid().nullable(),
});

export async function updateAnimalAction(
  input: z.infer<typeof updateAnimalSchema>
): Promise<UpdateAnimalActionResult> {
  const session = await requireSession();
  const parsed = updateAnimalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const state = await getAnimalEditState(parsed.data.animalId);
  if (!state || !state.establishmentId) return { ok: false, error: "Animal no encontrado" };
  await requireEstablishmentAccess(session.user.id, session.user.role, state.establishmentId);

  try {
    if (parsed.data.categoryId && parsed.data.categoryId !== state.categoryId) {
      if (state.status !== "alive") throw new Error("Solo se puede cambiar la categoría de un animal vivo");
      await confirmSingleRecategorize({
        userId: session.user.id,
        animalId: parsed.data.animalId,
        establishmentId: state.establishmentId,
        oldCategoryId: state.categoryId,
        newCategoryId: parsed.data.categoryId,
      });
    }

    const updated = await updateAnimalDetails(parsed.data.animalId, {
      sex: parsed.data.sex,
      breed: parsed.data.breed || null,
      birthDate: parsed.data.birthDate || null,
      ownerId: parsed.data.ownerId,
      secondaryTag: parsed.data.secondaryTag || null,
      reproductiveStatusId: parsed.data.reproductiveStatusId,
    });
    if (!updated) return { ok: false, error: "Animal no encontrado" };
    return { ok: true, animal: updated };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ese chip secundario ya pertenece a otro animal" };
    if (error instanceof Error) return { ok: false, error: error.message };
    throw error;
  }
}
