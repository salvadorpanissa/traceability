# Diseño: Recategorización manual sin select de campo + fallback por edad

**Fecha:** 2026-07-27
**Estado:** Aprobado, pendiente de plan de implementación
**Depende de:** la actividad de recategorización manual ya existente (`web/app/(protected)/activities/recategorize/`) y de la lógica de recategorización automática por edad ya construida en esta misma rama (`web/lib/activities/age-recategorization.ts`).

## Contexto

La actividad de recategorización manual hoy obliga a elegir un "Campo" en un `<select>` antes de subir el Excel, y valida que cada animal de la fila esté en ese campo — rechazando la fila con error si no. Eso es redundante: la DB ya sabe en qué campo está cada animal vía `animal_current_state`. Además, si un animal no tiene categoría asignada actualmente, hoy la fila se marca directamente como error ("El animal no tiene categoría asignada"), bloqueando toda la fila.

Se pide:
1. Sacar el select de Campo del formulario — la ubicación de cada animal se resuelve por fila, no se pide de antemano.
2. Si un animal no tiene categoría actual, en vez de error, calcular su categoría según la edad (reusando la lógica ya existente para el cron de auto-recategorización).
3. Si tampoco se puede calcular por edad (falta fecha de nacimiento o sexo, o ninguna categoría con edad mínima aplica), no bloquear la fila: dejar una decisión pendiente (omitir esa fila, o asignarle igual la categoría destino elegida en el select), con un toggle global por defecto y override por fila.

El select de "Categoría destino" se mantiene sin cambios en su rol: sigue siendo la categoría a la que se mueven los animales que **ya tienen** una categoría actual.

## Resolución de filas — `web/lib/activities/recategorize-resolution.ts`

`resolveRecategorizeBatchRows(rows: MappedRow[], formEventDate: string | null): Promise<RecategorizeResolvedRow[]>`

- Se saca el parámetro `operatingFarmId` y la validación "El animal no está en el campo seleccionado" (líneas 91-99 actuales).
- La consulta a `animal_current_state` se extiende para traer también `birth_date` y `sex` del animal (join a `animal`), y se cargan una sola vez (antes del loop) todas las categorías con `min_age_months` no nulo, igual que hace `findAnimalsNeedingAgeRecategorization`.
- Todas las validaciones de error existentes se mantienen igual (fecha faltante, caravana faltante, caravana duplicada, caravana no encontrada, animal vendido/muerto). Se agrega `currentFarmId` a **todos** los status no-error resultantes (se necesita después para agrupar el batch por campo).
- Nuevo árbol de decisión para cuando `current_category_id` es null (reemplaza el error actual):
  - Si `birthDate` y `sex` están presentes y `resolveCategoryForAge(ageManagedCategories, sex, computeAgeMonths(birthDate, eventDate))` devuelve una categoría → status `"age-resolved"` con `resolvedCategoryId`/`resolvedCategoryName`.
  - Si no (falta `birthDate`/`sex`, o `resolveCategoryForAge` devuelve `null`) → status `"age-unresolvable"`.

### Nuevo tipo `RecategorizeResolvedRow`

```ts
type RecategorizeResolvedRow =
  | { tag; eventDate; notes; status: "existing"; animalId; currentFarmId; currentCategoryId; currentCategoryName }
  | { tag; eventDate; notes; status: "age-resolved"; animalId; currentFarmId; resolvedCategoryId; resolvedCategoryName }
  | { tag; eventDate; notes; status: "age-unresolvable"; animalId; currentFarmId }
  | { tag; eventDate; notes; status: "error"; reason }
```

## Confirmación — `web/lib/activities/recategorize.ts` + `actions.ts`

`confirmRecategorizeBatch` deja de recibir `operatingFarmId` como parámetro único; en su lugar recibe las filas ya resueltas (con `currentFarmId` cada una) más las decisiones por fila para las `"age-unresolvable"`:

```ts
confirmRecategorizeBatch(input: {
  userId; role;
  targetCategoryId: string;
  rows: RecategorizeResolvedRow[];
  unresolvableDecisions: Record<string /* animalId */, "skip" | "assignTarget">;
}): Promise<void>
```

1. Sigue fallando si alguna fila tiene `status === "error"`.
2. Se agrupan las filas por `currentFarmId` (dedupe) y se llama `requireFarmAccess(userId, role, farmId)` una vez por cada campo distinto — mismo criterio de acceso que ya existe, pero ahora por fila en vez de uno solo elegido en el form.
3. Por cada campo, una transacción independiente con su propio `batchOperation` (`event_type: "recategorize"`) — mismo patrón de agrupado por campo que `runAgeBasedRecategorization`, para que un fallo en un campo no tumbe los demás.
4. Reglas de inserción en `event` + `event_recategorize` según el tipo de fila:
   - `"existing"` con `currentCategoryId !== targetCategoryId` → `oldCategoryId = currentCategoryId`, `newCategoryId = targetCategoryId`, `source: "manual"` (sin cambios respecto a hoy). Si es igual, se excluye (como hoy).
   - `"age-resolved"` → `oldCategoryId = newCategoryId = resolvedCategoryId` (self-loop, mismo patrón que ya usa `animal-creation.ts` para no violar el `NOT NULL` de `old_category_id` cuando no había categoría previa), `source: "initial"`.
   - `"age-unresolvable"` con decisión `"assignTarget"` → `oldCategoryId = newCategoryId = targetCategoryId`, `source: "initial"`.
   - `"age-unresolvable"` con decisión `"skip"` → no genera evento; no cuenta para `animalCount` del batch.
5. Si después de aplicar las reglas no queda ninguna fila que genere evento, se sigue lanzando "Ningún animal cambia de categoría; no se puede confirmar" (igual que hoy).
6. Al final (fuera de las transacciones por campo, una sola vez), `refresh materialized view concurrently animal_current_state`.

`confirmRecategorizeBatchAction` (Server Action) deja de recibir `farmId`; recibe `unresolvableDecisions` además de lo que ya recibía.

## Frontend — `web/components/activities/recategorize-form.tsx`

- Se elimina el estado `farmId` y el bloque completo del `<select id="farmId">`.
- `runPreview` ya no agrega `farmId` al `FormData`; el botón "Subir" queda habilitado con `!targetCategoryId || !file` (se saca `!farmId` de la condición).
- Nuevo estado `unresolvableDecisions: Record<string, "skip" | "assignTarget">` (clave = `animalId`) y `globalUnresolvableDefault: "skip" | "assignTarget"` (default `"skip"`).
- Cuando el preview trae al menos una fila `"age-unresolvable"`, se muestra un toggle global (dos botones/radio) que fija `globalUnresolvableDefault`. Cambiar el toggle global solo afecta a las filas que el usuario no haya tocado individualmente todavía (se trackea con el mismo `unresolvableDecisions`, sembrado lazy: si una fila no tiene entrada propia, su valor efectivo es `globalUnresolvableDefault`).
- Al confirmar, se arma `unresolvableDecisions` resolviendo cada fila `"age-unresolvable"` a su valor efectivo (override si existe, si no el global) antes de pasarlo al Server Action.

## Preview table — `web/components/activities/recategorize-preview-table.tsx`

Se agregan las columnas/estados nuevos, sin tocar el resto del layout:

| status | Categoría actual | Categoría nueva | Estado |
|---|---|---|---|
| `existing` | `currentCategoryName ?? "—"` | `targetCategoryName` | "OK" |
| `age-resolved` | "Sin categoría" | `resolvedCategoryName` | "OK (por edad)" |
| `age-unresolvable` | "Sin categoría" | `targetCategoryName` si decisión = assignTarget, si no "—" | "Sin edad calculable" + selector inline (Omitir / Asignar destino) que llama a un callback `onDecisionChange(animalId, decision)` del padre |
| `error` | "—" | "—" | `reason` en rojo (sin cambios) |

El componente recibe además `unresolvableDecisions` y `onDecisionChange` como props nuevas.

## Validaciones y casos borde

- Un mismo Excel puede traer animales de distintos campos: cada uno se resuelve y persiste con su propio `currentFarmId`, sin exigir que coincidan entre sí.
- Si el usuario no tiene acceso a alguno de los campos involucrados (no-admin sin ese campo asignado), `requireFarmAccess` lanza error para ese campo — al estar cada campo en su propia transacción, los campos a los que sí tiene acceso ya habrán sido confirmados antes de llegar al que falla. Esto es aceptable (mismo comportamiento que ya acepta `runAgeBasedRecategorization` para el job automático) y se documenta como comportamiento esperado, no un bug.
- El botón "Confirmar" sigue deshabilitado si hay alguna fila `"error"`, o si no queda ninguna fila que efectivamente vaya a generar un evento (todas las `existing` ya están en la categoría destino, no hay `age-resolved`, y todas las `age-unresolvable` están en "Omitir").
- No se toca la lógica de `findAnimalsNeedingAgeRecategorization`/`runAgeBasedRecategorization` (cron automático): sigue exigiendo que el animal ya tenga una categoría age-managed actual para actuar. Este cambio solo afecta el flujo manual, que ahora también puede asignar la **primera** categoría a un animal que nunca tuvo una.

## Testing

- **Vitest** (integración contra Postgres local, mismo patrón que el resto de la actividad):
  - `resolveRecategorizeBatchRows`: fila con categoría actual (existing), fila sin categoría pero con edad calculable (age-resolved, verificar que elige el bracket correcto según sexo), fila sin categoría y sin `birthDate`/`sex` (age-unresolvable), fila sin categoría con edad que no matchea ningún bracket (age-unresolvable), animal en campo distinto al de otras filas del mismo excel (ya no debe dar error), resto de errores existentes sin cambios (caravana duplicada, no encontrada, vendido/muerto, fecha faltante).
  - `confirmRecategorizeBatch`: batch con filas de campos distintos genera un `batchOperation` por campo; fila `age-resolved` inserta `event_recategorize` con `old = new` y `source: 'initial'`; fila `age-unresolvable` con decisión `assignTarget` idem con `targetCategoryId`; con decisión `skip` no genera evento; falla si algún campo involucrado no es accesible para el usuario (no-admin).
- **Playwright E2E**: actualizar el test existente de recategorización manual (`bf9f097`) para no seleccionar campo; agregar un caso con un animal sin categoría y con fecha de nacimiento/sexo cargados (se recategoriza por edad automáticamente) y un caso sin fecha de nacimiento (aparece la fila con el selector de decisión, se elige "Asignar destino" y se confirma).

## Fuera de alcance de este spec

Cambios a la lógica del cron de auto-recategorización por edad (`age-recategorization.ts`) — se reusa tal cual, sin modificarla. Cambios al select de "Categoría destino" (se mantiene igual). Cualquier UI para elegir campo en otras actividades (traslado, sanidad, etc.) — no se toca ese patrón, solo el de recategorización manual.
