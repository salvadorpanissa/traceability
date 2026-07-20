# Diseño: Modelo de potreros — Sistema de trazabilidad de ganado

**Fecha:** 2026-07-20
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** extiende el esquema de base de datos ya implementado (`docs/superpowers/specs/2026-07-18-database-schema-design.md`, mergeado a `main`). Es un prerrequisito del spec de "cargar caravanas y actividades" (pausado hasta que esto esté listo). Solo esquema — la pantalla de administración de potreros queda como spec de frontend aparte, junto con la de alta de usuarios y la de establecimientos (ninguna de las dos existe todavía; hoy se cargan a mano desde Supabase Studio).

## Contexto

Durante el brainstorming de "cargar caravanas y actividades" surgió que un establecimiento (`farm`) tiene subdivisiones internas de pastoreo — potreros — y que la trazabilidad necesita saber en qué potrero está cada animal, no solo en qué establecimiento. El modelo actual no tiene ese nivel. Este spec lo agrega, de forma aditiva sobre lo ya implementado y en producción (sin romper filas ni RLS existentes).

## Decisiones

- **Potrero es opcional.** Un animal siempre tiene (o no) un establecimiento vía el mecanismo ya existente; el potrero específico dentro de ese establecimiento puede quedar sin asignar (`current_paddock_id` nullable). Evita bloquear operaciones por no tener ese dato al momento.
- **Un traslado puede ser entre potreros del mismo establecimiento**, no solo entre establecimientos distintos — de hecho, se espera que sea el caso más común (mover un lote de un potrero a otro dentro del mismo campo).
- **La regla de permisos existente ya cubre esto sin cambios:** `event_transfer_insert` ya permite a un `manager` crear el evento cuando `origin_farm_id = destination_farm_id`, y solo `admin` cuando cruza establecimientos. Un traslado entre potreros del mismo establecimiento matchea `origin_farm_id = destination_farm_id` automáticamente (los establecimientos no cambian, solo el potrero) — la política de RLS de `event_transfer` no necesita tocarse.
- **Alcance: solo esquema.** Sin pantalla de gestión de potreros en este spec.

## Cambios de esquema (aditivos, sobre el esquema ya mergeado)

### Entidad nueva: `paddock`

- `id` (uuid, pk)
- `farm_id` (uuid, not null, fk → `farm`) — a qué establecimiento pertenece. Cada potrero pertenece a exactamente un establecimiento.
- `name` (text, not null)

### `event_transfer`: se extiende, no se reemplaza

Se agregan dos columnas nullable:
- `origin_paddock_id` (uuid, nullable, fk → `paddock`)
- `destination_paddock_id` (uuid, nullable, fk → `paddock`)

`origin_farm_id`/`destination_farm_id` siguen existiendo exactamente igual que hoy (not null) — ninguna fila histórica se ve afectada. Cuando se especifica un potrero, debe pertenecer al establecimiento correspondiente del mismo evento (`origin_paddock_id` → su `farm_id` debe coincidir con `origin_farm_id`, ídem destino) — se valida en la función/lógica de inserción de la batch operation (fuera de alcance de este spec, que es solo esquema), no con una constraint de base de datos que complicaría el modelo para un caso de uso que hoy no existe.

### `animal_current_state`: gana `current_paddock_id`

Mismo patrón que `current_farm_id`: se deriva del último evento de traslado activo (no anulado) de cada animal, tomando `destination_paddock_id`. Si el último traslado no especificó potrero, o no hay ningún traslado, queda `null`.

### RLS

- `paddock`: `alter table enable row level security`, con el mismo patrón que `farm`:
  - `paddock_select`: `is_admin() or farm_id in (select user_farm_ids())`
  - `paddock_write`: solo `admin` (`for all using (is_admin()) with check (is_admin())`)
- `event_transfer`: **sin cambios.** La política actual ya produce el comportamiento deseado (ver "Decisiones" arriba).
- `animal_current_state` (la vista wrapper de Task 8): no necesita cambios de política — sigue filtrando por `current_farm_id`, que no cambia de significado. `current_paddock_id` es un dato adicional dentro de filas ya visibles, no un criterio de visibilidad nuevo.

## Fuera de alcance de este spec

Pantalla de administración de potreros (crear/editar/listar), el spec de "cargar caravanas y actividades" (retomar una vez esto esté implementado), validación de consistencia potrero↔establecimiento a nivel de base de datos (constraint), acceso restringido a nivel de potrero individual (hoy el acceso sigue siendo por establecimiento completo vía `user_farm`, un manager con acceso a un establecimiento puede operar en cualquiera de sus potreros).
