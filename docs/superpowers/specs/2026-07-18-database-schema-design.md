# Diseño: Esquema de base de datos — Sistema de trazabilidad de ganado

**Fecha:** 2026-07-18
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** 1 de 4 (esquema de datos + roles/RLS). Los siguientes son: lógica de carga por lote, importación/validación de Excel, reportes.

## Nota de migración (2026-07-20)

Se decidió migrar el backend de Supabase a Postgres local + Auth.js (ver `docs/superpowers/specs/2026-07-20-frontend-auth-shell-design-v2.md`). Las tablas y el modelo de eventos de este spec **siguen vigentes tal cual** (son SQL estándar de Postgres); lo que deja de ser vigente es la sección "Roles y RLS" más abajo — la autorización por `farm_id` pasa a enforzarse en el Data Access Layer (Server Actions), no en políticas RLS de Postgres/Supabase. El plan concreto de migración de datos y de las funciones `is_admin()`/`user_farm_ids()` a chequeos equivalentes en el DAL es un spec/plan aparte, todavía no escrito.

## Contexto

Empresa ganadera en Uruguay, varios campos, miles de animales. Reemplaza un sistema de terceros deprecado y un flujo manual por Excel que no escala ni deja historial auditable. Uso interno (no requiere integración obligatoria con MGAP/SNIG desde el inicio, pero el modelo debe quedar compatible a futuro). Backend en Supabase (Postgres). Ver contexto completo en la conversación original con el usuario.

## Principio de diseño

**Event sourcing parcial**: el estado actual de un animal nunca se edita directamente. Cada operación (traslado, sanidad, recaravaneo, recategorización, venta, baja) genera eventos inmutables. El estado actual se deriva de esos eventos vía una vista materializada. Las correcciones se hacen anulando el evento erróneo y cargando uno nuevo — nunca editando ni borrando historial.

Todas las operaciones se aplican **por lote** (grupo de animales a la vez), no animal por animal.

## Entidades base

### `farm`
Establecimiento.
- `id` (uuid, pk)
- `name` (text)
- `dicose_code` (text, nullable) — código DICOSE (MGAP) del establecimiento
- `ruc` (text, nullable)

### `role`
Catálogo de roles.
- `id` (uuid, pk)
- `name` (text) — valores: `manager`, `admin`

### `user_account`
Usuario del sistema (vía Supabase Auth).
- `id` (uuid, pk, = auth.uid())
- `name` (text)
- `email` (text)
- `role_id` (fk → role)

### `user_farm`
Relación many-to-many entre usuarios `manager` y los campos que administran. Los `admin` no necesitan filas acá (su acceso es global por rol).
- `user_id` (fk → user_account)
- `farm_id` (fk → farm)
- PK compuesta `(user_id, farm_id)`

### `category`
Catálogo configurable de categorías de animal (ternero, novillo, vaquillona, vaca, etc.), editable sin tocar el esquema.
- `id` (uuid, pk)
- `name` (text)
- `sort_order` (int)

### `product`
Catálogo de productos sanitarios (vacunas, antiparasitarios, etc.).
- `id` (uuid, pk)
- `name` (text)
- `default_dose_unit` (text, nullable)
- `default_withdrawal_days` (int, nullable)

### `animal`
Identidad estable del animal. Solo atributos que **no** cambian con el historial.
- `id` (uuid, pk)
- `birth_date` (date, nullable)
- `created_at` (timestamptz)

Explícitamente **no** tiene columnas de caravana activa, campo actual, categoría actual ni estado — esos se derivan (ver `animal_current_state` más abajo).

### `animal_tag_history`
Historial de caravanas físicas por animal, poblado por `event_retag`.
- `animal_id` (fk → animal)
- `tag` (text)
- `valid_from` (timestamptz)

Permite buscar un animal por cualquier caravana histórica, no solo la activa.

## Sistema de eventos

### `batch_operation`
Registro de la operación de lote que disparó un conjunto de eventos. Efímero — no es una entidad reutilizable, solo trazabilidad de "qué se hizo en esa carga".
- `id` (uuid, pk)
- `event_type` (text)
- `farm_id` (fk → farm) — contexto donde se aplicó
- `selection_criteria` (jsonb) — cómo se armó la selección (ej. `{"farm": "Norte", "category": "vaca"}`)
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
- `voids_event_id` (fk → event, nullable) — solo se setea cuando `event_type='void'`; apunta al evento erróneo que este anula

Inmutable: solo `INSERT`, nunca `UPDATE`/`DELETE`. Un evento está vigente si no existe ninguna fila con `event_type='void'` cuyo `voids_event_id` lo referencie.

### Tablas hijas (una por tipo, FK 1:1 a `event.id`)

**`event_transfer`**
- `event_id` (fk → event, pk)
- `origin_farm_id` (fk → farm)
- `destination_farm_id` (fk → farm)
- `guide_number` (text, nullable) — número de guía de traslado en papel, si existe

DICOSE/RUC de origen y destino se obtienen por join a través de `farm`, no se duplican acá.

**`event_health`**
- `event_id` (fk → event, pk)
- `product_id` (fk → product)
- `dose` (numeric)
- `dose_unit` (text)
- `route` (text) — ej. subcutánea, intramuscular, oral
- `withdrawal_days` (int, nullable)
- `notes` (text, nullable)

**`event_retag`**
- `event_id` (fk → event, pk)
- `old_tag` (text)
- `new_tag` (text)

**`event_recategorize`**
- `event_id` (fk → event, pk)
- `old_category_id` (fk → category)
- `new_category_id` (fk → category)

**`event_sale`**
- `event_id` (fk → event, pk)
- `buyer` (text, nullable)
- `price` (numeric, nullable)
- `weight_kg` (numeric, nullable)

**`event_death`**
- `event_id` (fk → event, pk)
- `cause` (text, nullable)

**Corrección**: no tiene tabla hija propia. Se implementa con un evento `void` (mismo `animal_id` que el evento erróneo, `voids_event_id` = id del evento erróneo). Luego se carga el evento correcto normalmente con los tipos de arriba.

### Ejemplo de flujo (sanidad sobre un lote)

El encargado selecciona 50 vacas en Campo Norte → elige "Sanidad: Ivermectina 1% - 10ml - subcutánea" → aplica una vez. El sistema crea:
1. 1 fila en `batch_operation` (`event_type='health'`, `animal_count=50`)
2. 50 filas en `event` (una por animal, mismo `batch_operation_id`)
3. 50 filas en `event_health` (mismo `product_id`/dosis, `event_id` distinto cada una)

## Estado derivado: `animal_current_state`

Vista materializada, refrescada por trigger `AFTER INSERT` sobre `event`/tablas hijas (los eventos anulados — los que tienen una fila `void` con `voids_event_id` apuntando a ellos — se excluyen del cálculo).

Columnas calculadas por animal:
- `current_tag` — de `new_tag` en el último `event_retag`
- `current_farm_id` — de `destination_farm_id` en el último `event_transfer`
- `current_category_id` — de `new_category_id` en el último `event_recategorize`
- `status` — `alive` / `sold` / `dead`, derivado del último `event_sale` o `event_death` (lo que sea más reciente); `alive` si no hay ninguno

Todas las consultas de stock/listados/reportes leen de esta vista, nunca reconstruyen el estado a mano.

## Roles y RLS

- `manager`: acceso limitado a `farm_id IN (SELECT farm_id FROM user_farm WHERE user_id = auth.uid())`, vía funciones SQL reutilizables (`is_admin()`, `user_farm_ids()`) usadas en las políticas de `animal`, `animal_current_state`, `event` + hijas, `batch_operation`.
- `admin`: sin restricción de `farm_id`.
- Traslados entre campos (`origin_farm_id <> destination_farm_id`): solo `admin` puede crearlos. Se valida en la función de inserción de eventos, no solo en RLS, porque un `manager` con acceso a ambos campos igual no debería poder mover animales entre ellos sin autorización de nivel superior.

## Fuera de alcance de este spec

Lógica de carga por lote (funciones/API que arman `batch_operation` + N `event`), importación/validación de Excel, reportes — son sub-proyectos siguientes, cada uno con su propio spec.
