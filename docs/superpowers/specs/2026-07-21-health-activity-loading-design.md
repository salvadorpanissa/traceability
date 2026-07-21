# Diseño: Carga de actividad "sanidad" — segundo recorte de carga de caravanas y actividades

**Fecha:** 2026-07-21
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** segundo recorte de [`docs/superpowers/specs/2026-07-20-activity-loading-design.md`](./2026-07-20-activity-loading-design.md), después de traslado (`docs/superpowers/specs/2026-07-21-transfer-activity-loading-design.md`, ya implementado y mergeado). Recategorización, venta y baja quedan para specs siguientes.

## Contexto

Con traslado funcionando de punta a punta, sanidad reusa casi toda su infraestructura (parseo de Excel, mapeo de columnas, resolución de filas por caravana). Lo que cambia es qué pasa al confirmar: en vez de un destino único, el usuario carga una **lista de productos** (uno o más), y cada animal del lote recibe **un evento de sanidad por cada producto de la lista**.

## Refactor previo (DRY)

La lógica de resolución de filas (`resolveBatchRows`, tipo `ResolvedRow`, conteo de duplicados, búsqueda por `animal_tag_history`, validación de categoría) no depende de qué actividad se está cargando — hoy vive en `lib/activities/transfer.ts` pero es igual de válida para sanidad. Se extrae a `lib/activities/batch-resolution.ts`.

La lógica de alta de un animal nuevo (crear `animal`, `animal_tag_history`, evento `retag` autoreferenciado, evento `recategorize` autoreferenciado si vino categoría) también se repite igual en ambas actividades — se extrae a una función compartida `createNewAnimal(tx, { userId, operatingFarmId, batchId, row })` en `lib/activities/animal-creation.ts`, devolviendo el `animalId` creado. `confirmTransferBatch` se adapta para usarla (mismo comportamiento, sin cambios funcionales).

## Ubicación de animales nuevos en sanidad

Sanidad no mueve animales de campo — a diferencia de traslado, no hay un destino que aplicar. Pero un animal nuevo necesita quedar ubicado en algún campo para ser visible (`animal_current_state` deriva `current_farm_id` de `event_transfer`, nunca de otro tipo de evento). Por eso, **un animal nuevo en un lote de sanidad recibe, además de sus eventos de sanidad, un traslado interno** (origen = destino = el campo desde el que se está operando, sin potrero) — igual que especifica el spec original. Un animal ya existente no recibe este traslado interno (ya tiene ubicación).

## Lista de productos (multi-producto)

El formulario permite agregar N productos, cada uno con:
- `productId` (del catálogo `product`, obligatorio)
- `dose`, `doseUnit`, `route` (obligatorios) — al elegir el producto, `dose`/`doseUnit` se precargan desde `product.defaultDoseUnit` si existe (dosis en blanco, unidad prellenada); quedan editables
- `withdrawalDays` (opcional) — se precarga desde `product.defaultWithdrawalDays`, editable
- `notes` (opcional)

Al confirmar, **cada animal del lote recibe un evento `health` (+ su `event_health`) por cada producto de la lista** — mismos valores de dosis/vía/carencia para todo el lote, ninguna variación por fila del Excel (eso queda fuera de alcance, ver más abajo).

## Confirmación (transacción)

`confirmHealthBatch({ userId, role, operatingFarmId, products, rows }): Promise<void>` en `lib/activities/health.ts`:

1. `requireFarmAccess(userId, role, operatingFarmId)` — sanidad no cruza campos, **no** aplica `requireTransferAuthorization`.
2. Rechaza si `rows` tiene alguna fila con error, o si `products` está vacío.
3. Transacción: un `batch_operation` (`event_type='health'`); por fila, si es nueva, `createNewAnimal` + un evento de traslado interno (origen=destino=`operatingFarmId`, sin potrero); luego, para **todas** las filas (existentes y nuevas), un evento `health`+`event_health` por cada producto de la lista.

## Catálogo de productos para el formulario

Nuevo Server Action de solo lectura `listProducts(): Promise<{ id: string; name: string; defaultDoseUnit: string | null; defaultWithdrawalDays: number | null }[]>` — cualquier usuario autenticado puede leerlo (mismo criterio que categorías: catálogo compartido, no filtrado por campo).

## Server Actions y UI

Mismo patrón de dos pasos que traslado, en `web/app/(protected)/activities/health/`:
- `previewHealthBatch(formData)` — idéntico a `previewTransferBatch` pero sin campo/potrero destino (reusa el `resolveBatchRows` compartido).
- `confirmHealthBatchAction({ headerSignature, mapping, products, rows })` — guarda el mapeo (igual que traslado) y llama a `confirmHealthBatch`.

Página `web/app/(protected)/activities/health/page.tsx`: mismo flujo de subida + mapeo (primera vez) + preview, pero en vez de campo/potrero destino, un editor de lista de productos (`ProductListEditor`: agregar/quitar filas, cada una con un `<select>` de producto del catálogo + inputs de dosis/unidad/vía/carencia/notas).

## Fuera de alcance de este spec

Mapeo de columna "Producto" del Excel (precargar el producto desde una columna, permitir múltiples valores por fila). Recategorización, venta, baja como actividades. Historial de sanidades pendientes / fecha de habilitación para venta por carencia (reportes, spec aparte).

## Testing

Vitest, mismo patrón que traslado: `batch-resolution.ts` y `animal-creation.ts` con tests de integración (reusan los ya existentes, movidos); `confirmHealthBatch` con casos nuevos (un producto, múltiples productos, fila con error bloquea todo, animal nuevo recibe el traslado interno además de sus eventos de salud, animal existente no lo recibe); Server Actions y UI con los mismos patrones que traslado. Playwright E2E: subir un Excel, mapear, agregar dos productos, confirmar, verificar en la base 2 eventos `health` por animal.
