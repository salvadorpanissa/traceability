# Diseño: Esquema base (animales/eventos/catálogos) — port a Drizzle/Postgres local

**Fecha:** 2026-07-21
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** 1 de 2 prerrequisitos de "carga de caravanas y actividades" (el otro es potreros, spec aparte, todavía pendiente). Reemplaza `docs/superpowers/specs/2026-07-18-database-schema-design.md`, escrito para el stack Supabase ya descartado — el modelo de datos no cambia, lo que cambia es cómo se autoriza el acceso.

## Contexto

El rewrite a Postgres local + Auth.js (`docs/superpowers/specs/2026-07-20-frontend-auth-shell-design-v2.md`) reconstruyó `farm`/`role`/`user_account`/`user_farm` en Drizzle, pero descartó junto con el resto de `web/` (y de `supabase/`) todo el sistema de animales/eventos que existía en la implementación Supabase. Nada de eso existe hoy en el stack nuevo. Este spec lo vuelve a levantar, en Drizzle, sin RLS.

## Principio de diseño (sin cambios)

**Event sourcing parcial**: el estado actual de un animal nunca se edita directamente. Cada operación (traslado, sanidad, recaravaneo, recategorización, venta, baja) genera eventos inmutables. El estado actual se deriva de esos eventos vía una vista materializada. Las correcciones se hacen anulando el evento erróneo y cargando uno nuevo — nunca editando ni borrando historial.

Todas las operaciones se aplican **por lote** (grupo de animales a la vez), no animal por animal.

## Entidades

`farm`, `role`, `user_account`, `user_farm` — ya existen (`web/db/schema/farm.ts`, `role.ts`, `user.ts`), sin cambios.

### `category`
Catálogo configurable de categorías de animal (ternero, novillo, vaquillona, vaca, etc.).
- `id` (uuid, pk)
- `name` (text)
- `sort_order` (int)

### `product`
Catálogo de productos sanitarios.
- `id` (uuid, pk)
- `name` (text)
- `default_dose_unit` (text, nullable)
- `default_withdrawal_days` (int, nullable)

### `animal`
Identidad estable. Solo atributos que **no** cambian con el historial.
- `id` (uuid, pk)
- `birth_date` (date, nullable)
- `created_at` (timestamptz)

Explícitamente **no** tiene columnas de caravana activa, campo actual, categoría actual ni estado — se derivan (ver `animal_current_state`).

### `animal_tag_history`
Historial de caravanas físicas por animal, poblado por `event_retag`.
- `animal_id` (fk → animal)
- `tag` (text)
- `valid_from` (timestamptz)

## Sistema de eventos

### `batch_operation`
Registro de la operación de lote que disparó un conjunto de eventos. Efímero — solo trazabilidad.
- `id` (uuid, pk)
- `event_type` (text)
- `farm_id` (fk → farm)
- `selection_criteria` (jsonb)
- `animal_count` (int)
- `created_by` (fk → user_account)
- `created_at` (timestamptz)

### `event` (tabla base)
Un registro por animal afectado, común a todos los tipos.
- `id` (uuid, pk)
- `event_type` (text) — `transfer`, `health`, `retag`, `recategorize`, `sale`, `death`, `void`
- `event_date` (date)
- `animal_id` (fk → animal)
- `farm_id` (fk → farm) — campo donde se registró
- `batch_operation_id` (fk → batch_operation)
- `created_by` (fk → user_account)
- `created_at` (timestamptz)
- `voids_event_id` (fk → event, nullable) — solo se setea cuando `event_type='void'`

Inmutable: solo `INSERT`, nunca `UPDATE`/`DELETE`. Un evento está vigente si no existe ninguna fila `void` cuyo `voids_event_id` lo referencie.

### Tablas hijas (1:1 a `event.id`)

- **`event_transfer`**: `origin_farm_id`, `destination_farm_id`, `guide_number` (nullable).
- **`event_health`**: `product_id`, `dose`, `dose_unit`, `route`, `withdrawal_days` (nullable), `notes` (nullable).
- **`event_retag`**: `old_tag`, `new_tag`.
- **`event_recategorize`**: `old_category_id`, `new_category_id`.
- **`event_sale`**: `buyer` (nullable), `price` (nullable), `weight_kg` (nullable).
- **`event_death`**: `cause` (nullable).

**Corrección**: no tiene tabla hija propia. Se implementa con un evento `void` (mismo `animal_id`, `voids_event_id` = id del evento erróneo). Luego se carga el evento correcto normalmente.

## Estado derivado: `animal_current_state`

Vista materializada, refrescada por trigger `AFTER INSERT` sobre `event`/tablas hijas (eventos anulados se excluyen).

Columnas calculadas por animal:
- `current_tag` — de `new_tag` en el último `event_retag` vigente.
- `current_farm_id` — de `destination_farm_id` en el último `event_transfer` vigente.
- `current_category_id` — de `new_category_id` en el último `event_recategorize` vigente.
- `status` — `alive` / `sold` / `dead`, del último `event_sale` o `event_death` vigente (el más reciente de los dos); `alive` si no hay ninguno.

Todas las consultas de stock/listados/reportes leen de esta vista, nunca reconstruyen el estado a mano.

Drizzle no modela vistas materializadas ni triggers de forma nativa — se agregan como SQL crudo en un archivo de migración adicional después del generado por `drizzle-kit generate` (mismo enfoque que ya usaban las migraciones de Supabase descartadas, adaptado a Postgres plano).

## Autorización (reemplaza RLS — sin políticas de Postgres)

No hay Row Level Security en Postgres local. El filtrado por `farm_id` se hace en el DAL (Server Actions / funciones de acceso a datos), reusando lo ya construido para `select-farm`:

- `isAdmin(role)`, `userFarmIds(userId)`, `requireFarmAccess(userId, role, farmId)` (`web/lib/dal/farm-access.ts`) — sin cambios, se extienden para cubrir las queries nuevas.
- Cualquier lectura/escritura de `animal`, `event` (+ hijas), `batch_operation`, `animal_current_state` debe pasar por una función del DAL que llame a `requireFarmAccess` con el `farm_id` relevante antes de tocar la base. No hay enforcement a nivel de Postgres — si una Server Action nueva olvida llamar al DAL, no hay red de seguridad adicional (mismo trade-off que ya aceptó el rewrite de auth-shell-v2).
- Traslados entre campos (`origin_farm_id <> destination_farm_id`): la función que crea eventos de traslado exige `isAdmin(role)`; un manager solo puede crear el evento cuando `origin_farm_id = destination_farm_id`. Se valida en la función de inserción, no en una capa de permisos genérica — mismo criterio que el spec original.

## Testing

- **Vitest, integración contra Postgres local** (`DATABASE_URL_TEST`, mismo patrón que `__tests__/schema/role-farm.test.ts`): inserción de cada tabla, constraint de unicidad donde aplique, inserción de eventos y su tabla hija correspondiente.
- Casos específicos de `animal_current_state`: refresco correcto tras `event_transfer`, `event_retag`, `event_recategorize`, `event_sale`/`event_death`; que un evento anulado (`void`) no se refleje en el estado derivado; que el estado más reciente gane cuando hay varios eventos del mismo tipo para un animal.
- No hay pgTAP (dependía de la CLI de Supabase, ya no está en el proyecto).

## Fuera de alcance de este spec

Potreros (`paddock`, spec aparte — el siguiente prerrequisito de carga de actividades). Lógica de carga por lote / importación de Excel / UI (spec `2026-07-20-activity-loading-design.md`, retomar una vez esquema + potreros estén portados). Reportes. Pantallas de administración de catálogos (`category`/`product`) — hoy se cargan a mano contra la base, igual que `farm`/`role` hoy.
