# Diseño: Modelo de potreros — port a Drizzle/Postgres local

**Fecha:** 2026-07-21
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** 2 de 2 prerrequisitos de "carga de caravanas y actividades" (el otro, ya portado y mergeado a `main`, es el esquema base — `docs/superpowers/specs/2026-07-21-core-schema-drizzle-design.md`). Reemplaza `docs/superpowers/specs/2026-07-20-paddocks-schema-design.md`, escrito para el stack Supabase ya descartado — el modelo de datos no cambia, lo que cambia es cómo se autoriza el acceso. Solo esquema — no incluye pantalla de administración de potreros.

## Contexto

Un establecimiento (`farm`) tiene subdivisiones internas de pastoreo — potreros — y la trazabilidad necesita saber en qué potrero está cada animal, no solo en qué establecimiento. El esquema base recién portado (`animal_current_state`, `event_transfer`) no tiene ese nivel. Este spec lo agrega, aditivamente.

## Decisiones (sin cambios respecto al spec original)

- **Potrero es opcional.** `current_paddock_id` nullable — no bloquea operaciones por falta de ese dato.
- **Un traslado puede ser entre potreros del mismo establecimiento** (el caso más común esperado), no solo entre establecimientos distintos.
- **La regla de autorización existente ya cubre esto sin cambios:** `requireTransferAuthorization` (`web/lib/dal/animal-access.ts`, agregada en el port del esquema base) ya exige `isAdmin(role)` solo cuando `originFarmId !== destinationFarmId`. Un traslado entre potreros del mismo establecimiento tiene `originFarmId === destinationFarmId` (el establecimiento no cambia, solo el potrero) — no hace falta tocar esa función.
- **Alcance: solo esquema.** Sin pantalla de gestión de potreros.

## Cambios de esquema (aditivos sobre lo ya mergeado)

### Entidad nueva: `paddock`

- `id` (uuid, pk)
- `farm_id` (uuid, not null, fk → `farm`)
- `name` (text, not null)

### `event_transfer`: se extiende, no se reemplaza

Dos columnas nullable nuevas:
- `origin_paddock_id` (uuid, nullable, fk → `paddock`)
- `destination_paddock_id` (uuid, nullable, fk → `paddock`)

`origin_farm_id`/`destination_farm_id` siguen not null, sin cambios. La validación de que un potrero pertenezca al `farm_id` correspondiente del mismo evento queda fuera de alcance de este spec (es lógica de la Server Action que construye la batch operation, no del esquema ni una constraint de base de datos).

### `animal_current_state`: gana `current_paddock_id`

Mismo patrón que `current_farm_id`: se deriva del último `event_transfer` vigente (no anulado), tomando `destination_paddock_id`. Postgres no tiene `ALTER MATERIALIZED VIEW ... AS` para agregar una columna calculada — la vista, el índice único, la función de refresh y los 7 triggers (`event` + sus 6 hijas) se recrean idénticos salvo por esta columna agregada, en una única migración SQL de reemplazo (mismo enfoque que ya usó este proyecto para crear la vista por primera vez).

## Autorización (sin cambios de diseño, ya cubierto)

No hay tabla nueva que requiera una función DAL nueva: `paddock` no tiene su propio control de acceso por potrero individual — el acceso sigue siendo por establecimiento completo vía `user_farm`/`requireFarmAccess`, un manager con acceso a un establecimiento puede operar en cualquiera de sus potreros. `requireTransferAuthorization` ya existente cubre la regla de traslados cruzados sin modificación.

## Testing

Vitest, integración contra Postgres local, mismo patrón que el resto del esquema (`__tests__/schema/*.test.ts`, `__tests__/derived-state.test.ts`):
- `paddock` pertenece a un `farm_id`.
- `event_transfer` acepta `origin_paddock_id`/`destination_paddock_id` nulos o seteados.
- `animal_current_state.current_paddock_id` refleja el potrero destino tras un traslado potrero-a-potrero dentro del mismo establecimiento; queda `null` si el traslado no especificó potrero.

## Fuera de alcance de este spec

Pantalla de administración de potreros. Validación de consistencia potrero↔establecimiento a nivel de constraint de base de datos. Acceso restringido a nivel de potrero individual. La lógica de carga por lote / Excel / UI de "cargar caravanas y actividades" — retomar una vez esto esté implementado.
