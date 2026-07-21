# Diseño: sexo y propietario del animal (carga de actividades)

**Fecha:** 2026-07-21
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** extiende [`docs/superpowers/specs/2026-07-21-transfer-activity-loading-design.md`](./2026-07-21-transfer-activity-loading-design.md) y [`docs/superpowers/specs/2026-07-21-health-activity-loading-design.md`](./2026-07-21-health-activity-loading-design.md), ambos ya implementados y mergeados a `main`. Retoma "sexo y propietario" del spec original ([`docs/superpowers/specs/2026-07-20-activity-loading-design.md`](./2026-07-20-activity-loading-design.md)), explícitamente diferido en ambos specs de traslado/sanidad.

## Contexto

Los Excel de actividades a veces traen una columna de sexo y/o propietario del animal. Ninguno de los dos existe hoy en el modelo. A diferencia de campo/categoría/caravana (que cambian con el tiempo y se derivan de eventos), ambos son **datos fijos, no versionados** — no tienen su propio tipo de evento.

## Esquema

### `animal.sex`

Enum de Postgres (`create type animal_sex as enum ('male', 'female')`), columna nullable en `animal`. Sexo es verdaderamente binario y no va a crecer — un enum a nivel de base garantiza que ningún valor fuera de esos dos pueda guardarse, sin necesitar tabla ni pantalla de administración.

### `owner` (catálogo nuevo) + `animal.ownerId`

Mismo patrón que `category`/`product`: `owner(id uuid pk, name text unique)`. `animal.ownerId` (uuid, nullable, fk → `owner`).

## Mapeo de columnas

Dos significados nuevos en `ColumnMeaning`: `"sex"` y `"owner"`, disponibles para **ambas** actividades (traslado y sanidad) — son atributos del animal, no de la actividad. Mismo criterio que categoría: solo se usan al dar de alta un animal **nuevo**; si la caravana ya existe, se ignoran (no se toca el sexo/propietario de un animal existente).

## Resolución de sexo

Al aplicar el mapeo, el valor crudo de la columna "Sexo" se normaliza (case-insensitive, trim) contra:
- `M`, `MACHO` → `male`
- `H`, `HEMBRA` → `female`

Si no matchea ninguno (valor vacío, o cualquier otra cosa), el sexo del animal nuevo queda `null` — **no bloquea la fila**, mismo criterio que si la columna no se hubiera mapeado.

## Resolución de propietario

A diferencia de producto (un valor uniforme para todo el lote), el propietario viene **por fila** — cada animal nuevo puede traer un nombre de propietario distinto. Al resolver el lote:

- Si la fila es de un animal existente, el valor de la columna "Propietario" se ignora.
- Si es un animal nuevo y el valor matchea (case-insensitive, trim) el `name` de un `owner` existente, la fila queda con ese `ownerId` ya resuelto.
- Si es un animal nuevo y el valor no matchea ningún `owner` existente, la fila queda con el nombre crudo guardado como "propietario pendiente" — no es un error que bloquee la fila, pero **el lote no se puede confirmar hasta que ese propietario se resuelva** (ver flujo de confirmación abajo).

## Flujo de alta de propietario pendiente (UI)

Después del preview, si alguna fila quedó con propietario pendiente, la pantalla junta los nombres **distintos** pendientes de todo el lote y muestra un alta inline por cada uno — mismo patrón que la creación de producto: un input con el nombre (precargado, editable) y un botón "Crear". Al confirmarse cada uno:
- Se crea en el catálogo `owner`.
- Se aplica automáticamente su `ownerId` a **todas** las filas del lote que traían ese mismo nombre pendiente (no hace falta repetir la creación por fila).

El botón "Confirmar" del lote queda deshabilitado mientras quede algún propietario pendiente sin resolver, igual que hoy queda deshabilitado si hay filas con error.

## Confirmación (transacción)

`confirmTransferBatch`/`confirmHealthBatch` (la creación de animal nuevo, compartida vía `createNewAnimal`) pasan a recibir también `sex`/`ownerId` resueltos por fila, y los graban directamente como columnas de `animal` al insertarlo — sin evento asociado, ya que son datos fijos no versionados. Nada de esto afecta al resto de la lógica de traslado/sanidad ya implementada (autoubicación, self-retag, self-recategorize, eventos de salud) — es aditivo sobre `createNewAnimal`.

## Fuera de alcance

Reasignación de propietario para un animal existente (si algún día hace falta trazar cambios de dueño, es un evento nuevo, spec aparte — como ya señalaba el spec original). Pantalla de administración del catálogo `owner`. Un tercer valor de sexo (si apareciera, es un cambio de enum, no de este diseño).

## Testing

Vitest: normalización de sexo (pura), resolución de propietario por fila (integración, existente/nuevo/pendiente), `createNewAnimal` grabando `sex`/`ownerId`, Server Actions devolviendo los nombres de propietario pendientes, componente de alta inline de propietario. Playwright E2E: un Excel con una fila de propietario sin match, crearlo inline, confirmar.
