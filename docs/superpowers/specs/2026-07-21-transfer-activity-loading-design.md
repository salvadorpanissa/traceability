# Diseño: Carga de actividad "traslado" — primer recorte de carga de caravanas y actividades

**Fecha:** 2026-07-21
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** primer recorte de [`docs/superpowers/specs/2026-07-20-activity-loading-design.md`](./2026-07-20-activity-loading-design.md) — cubre únicamente la actividad **traslado**, con mapeo de columnas recordado por firma de encabezados. Sanidad (multi-producto), recategorización, venta y baja quedan para specs siguientes, reusando el mismo patrón. Depende del esquema base y de potreros, ambos ya portados a Drizzle y mergeados a `main`.

## Contexto

Con el esquema (`animal`/`event`/`animal_current_state`) y potreros ya en el stack Postgres local, esta es la primera pieza de UI que un usuario puede probar de punta a punta: subir un Excel de caravanas, mapear sus columnas, y confirmar un traslado por lote. El resto del flujo original (sanidad multi-producto, sexo/propietario del animal) se agrega después reusando esta misma base.

## Esquema nuevo: `column_mapping`

Recuerda, por firma exacta de encabezados (nombres + orden), qué significa cada columna — compartido para toda la cuenta, no por establecimiento ni usuario.

- `id` (uuid, pk)
- `headerSignature` (text, unique) — JSON stringificado del array de encabezados detectados, en el orden del archivo (p. ej. `["IDE","Fecha","SANIDAD"]`).
- `mapping` (jsonb, not null) — array de `{ header: string, meaning: "tag" | "date" | "category" | "ignore" }`.
- `createdAt` (timestamptz, default now)

Sin RLS: cualquier usuario autenticado puede leer/escribir esta tabla (no es dato sensible por campo, es configuración compartida de la cuenta).

## Parseo de Excel

**Librería: `exceljs`** (no `xlsx`/SheetJS — tiene CVEs de ReDoS/prototype-pollution sin parchear en la versión gratuita, relevante porque este código parsea archivos subidos por usuarios no confiables).

Funciones puras, sin tocar la base, en `web/lib/activities/`:
- `parseExcelFile(buffer: ArrayBuffer): { headers: string[]; rows: string[][] }` — lee la primera hoja, primera fila = encabezados.
- `applyColumnMapping(headers: string[], rows: string[][], mapping: ColumnMapping[]): MappedRow[]` — aplica el mapeo guardado (o el que el usuario acaba de elegir) y devuelve `{ tag: string; date: string | null; category: string | null }` por fila. Una fila sin columna mapeada a `tag` o con celda vacía en esa columna es un error de fila (`tag` es obligatorio siempre).

## Resolución de filas (toca DB)

`resolveBatchRows(rows: MappedRow[], operatingFarmId: string): Promise<ResolvedRow[]>` en `web/lib/activities/transfer.ts`:

- Por cada fila, busca el animal por `tag` en `animal_tag_history` (no solo la caravana activa — cualquier caravana histórica identifica al mismo animal).
- Si existe: trae su estado actual de `animal_current_state` (campo/potrero/categoría/status). Si `status <> 'alive'`, la fila es un error ("animal vendido o muerto").
- Si no existe: la fila es "nueva", usando `category` del Excel (si vino) como categoría inicial; sin ubicación previa (el traslado que se está armando la establece).
- Caravana repetida dentro del mismo Excel → error en todas las filas repetidas.
- Columna `category` mapeada con un valor que no matchea ningún `category.name` existente → error de fila.

Si **cualquier** fila tiene error, no se aplica nada (todo o nada).

## Confirmación (transacción)

`confirmTransferBatch({ operatingFarmId, destinationFarmId, destinationPaddockId, rows, userId }): Promise<void>` en el mismo archivo:

1. `requireFarmAccess(userId, role, operatingFarmId)` — ya lo exige la capa que resuelve el campo activo (`(protected)/layout.tsx`), pero la Server Action lo revalida por su cuenta, no confía en el cliente.
2. `requireTransferAuthorization(role, operatingFarmId, destinationFarmId)` — ya existente (`lib/dal/animal-access.ts`), sin cambios: solo admin cruza establecimientos.
3. Dentro de una transacción Drizzle: un `batch_operation` (`event_type='transfer'`, `farm_id=operatingFarmId`), y por fila: si el animal existe, un `event`+`event_transfer` con origen = su campo/potrero actual, destino = los elegidos en el formulario; si es nueva, primero `animal`+`animal_tag_history` (con la caravana del Excel), luego el mismo `event`+`event_transfer` pero con origen = `operatingFarmId` sin potrero de origen (nunca tuvo uno).

## Server Actions (dos pasos, sin persistir el Excel)

En `web/app/(protected)/activities/transfer/actions.ts`:

- `previewTransferBatch(formData): Promise<PreviewResult>` — recibe el archivo (del `FormData`), lo parsea, detecta si la firma de encabezados ya tiene un mapeo guardado (la aplica) o no (devuelve los encabezados crudos para que el usuario mapee), resuelve las filas, devuelve el preview estructurado. No escribe nada todavía (ni siquiera el `column_mapping` si es la primera vez — se guarda recién al confirmar, junto con el resto, para no dejar mapeos huérfanos si el usuario abandona antes de confirmar).
- `confirmTransferBatch(input): Promise<void>` — si el mapeo usado era nuevo (no encontrado por firma), lo guarda (`insert ... on conflict (header_signature) do nothing` — otro usuario pudo haberlo guardado mientras tanto); luego llama a la función de confirmación de arriba.

El estado intermedio (preview, mapeo elegido por el usuario) vive en el estado de React del cliente entre ambos pasos — no hay almacenamiento temporal server-side.

## UI

Página nueva: `web/app/(protected)/activities/transfer/page.tsx`.

1. Input de archivo + botón "Subir".
2. Si la firma de encabezados no tiene mapeo guardado: se muestran los encabezados detectados con un `<select>` por columna (`Caravana` / `Fecha` / `Categoría` / `Ignorar`), "Caravana" es obligatorio antes de continuar.
3. Selects de campo destino (obligatorio) y potrero destino (opcional, se recarga según el campo elegido).
4. Preview: tabla con una fila por animal — "existente" (con su ubicación actual) o "nuevo", y errores resaltados si los hay. Botón "Confirmar" deshabilitado si hay cualquier error.
5. Al confirmar: llama al segundo Server Action, redirige o muestra éxito.

Reusa `Button`/`Input`/`Label`/`Card` existentes (`web/components/ui/`); agrega un `Select` nuevo (Base UI, mismo patrón que `Button`) ya que no existe todavía.

## Testing

- **Vitest**: `parseExcelFile`/`applyColumnMapping` como funciones puras (sin DB) — casos de encabezados variados, celda de caravana vacía, columna no mapeada. `resolveBatchRows`/`confirmTransferBatch` de integración contra Postgres local (mismo patrón que el resto del proyecto) — animal existente, nuevo, duplicado, vendido/muerto, categoría inválida, traslado entre potreros del mismo campo, traslado cruzado que requiere admin.
- **Playwright E2E**: subir un Excel de prueba con mezcla de caravanas existentes/nuevas, mapear columnas (primera vez), confirmar, verificar en la base que animales/eventos quedaron creados; una segunda carga con la misma firma de encabezados no vuelve a pedir mapeo.

## Fuera de alcance de este spec

Sanidad (multi-producto), recategorización, venta, baja. Sexo/propietario del animal. Selección de lote por criterio o tabla con checkboxes (solo Excel). El módulo de chat con Claude.
