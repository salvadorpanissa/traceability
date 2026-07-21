# Diseño: Integración con SNIG (Sistema Nacional de Información Ganadera) — Sistema de trazabilidad de ganado

**Fecha:** 2026-07-20
**Estado:** Borrador inicial
**Sub-proyecto:** módulo de sincronización oficial. Depende del esquema de base de datos y modelo de potreros ya implementados, y del stack definido en `docs/superpowers/specs/2026-07-20-frontend-auth-shell-design-v2.md` (Postgres local, sin RLS).

## Nota de reconciliación (2026-07-20)

La versión original de este borrador asumía que el sistema seguía en Supabase, con RLS y Supabase Edge Functions/`pg_cron` como mecanismo de sincronización. Esa premisa quedó **obsoleta** al confirmarse la migración a Postgres local + Auth.js (`frontend-auth-shell-design-v2`). Este documento ya refleja el stack actualizado: el worker de sincronización deja de depender de Supabase Edge Functions y pasa a ser un proceso propio de la aplicación; la seguridad de acceso pasa por el Data Access Layer (DAL), no por RLS.

## Contexto

El objetivo de este módulo es conectar el historial interno de eventos con la API oficial del SNIG en Uruguay, automatizando la declaración de traslados, muertes y recaravaneos, sin perjudicar la experiencia de usuario en zonas de baja conectividad.

## Decisiones de arquitectura

- **Sincronización asíncrona (patrón outbox):** las operaciones de los usuarios en el campo no deben esperar una respuesta en tiempo real del SNIG. El usuario guarda su lote en el sistema interno al instante y un proceso en segundo plano se encarga de negociar con la API del gobierno.
- **Respeto a la inmutabilidad:** la tabla principal `event` está diseñada para ser inmutable (solo `INSERT`, nunca `UPDATE` ni `DELETE`). Por lo tanto, el estado de sincronización con el SNIG no puede agregarse como columna en esa tabla. Se crea una tabla paralela de estado que sí permite actualizaciones.
- **Procesamiento mediante un worker propio de la aplicación:** en vez de Supabase Edge Functions, la cola de eventos pendientes se procesa con un proceso programado del lado del backend (ej. un job periódico del servidor Next.js/Node, o un proceso worker separado con `node-cron`/una cola tipo BullMQ), consistente con tener la base de datos en Postgres local sin dependencias de Supabase. El disparador (`AFTER INSERT` sobre `event`) sigue siendo un trigger estándar de Postgres — eso no cambia con la migración.

## Cambios de esquema (aditivos)

### Nueva entidad: `snig_sync_state`

Tabla mutable que hace seguimiento del ciclo de vida de un evento hacia el SNIG, manteniendo intacta la regla de inmutabilidad de la tabla `event`.

- `event_id` (uuid, pk, fk → `event`)
- `sync_status` (text) — valores: `pending`, `processing`, `synced`, `error`, `ignored` (para eventos puramente internos, como movimientos entre potreros del mismo establecimiento).
- `last_attempt_at` (timestamptz, nullable)
- `error_message` (text, nullable) — guarda el rechazo exacto devuelto por la API del SNIG.
- `snig_transaction_id` (text, nullable) — el número de confirmación o ticket devuelto por el gobierno.

### Trigger de encolamiento

Un trigger `AFTER INSERT` sobre la tabla `event` que inserte automáticamente una fila en `snig_sync_state` con estado `pending` para los tipos de evento que requieren declaración oficial (ej. `transfer` cuando cruza diferentes DICOSE, `death`, `retag`).

## Reglas de validación (pre-vuelo)

Para que un evento pase a estado `pending` y no falle en la API del SNIG, la interfaz de usuario debe aplicar validaciones más estrictas al momento de cargar el Excel o el formulario:

- **Formato de caravana:** el SNIG exige la caravana electrónica (IDE). El sistema valida que el identificador guardado en `animal_tag_history` sea estrictamente un número de 15 dígitos cuando la actividad requiera sincronización.
- **Datos de establecimiento:** los traslados entre distintos campos requieren que la tabla `farm` tenga correctamente poblado el campo `dicose_code` tanto en el origen como en el destino.
- **Guía de propiedad:** `event_transfer` debe tener el campo `guide_number` completo y validado en su formato oficial.

## Flujo del worker

1. La función se ejecuta cada X minutos.
2. Busca filas en `snig_sync_state` donde `sync_status = 'pending'`.
3. Agrupa los eventos por tipo y establecimiento para minimizar llamadas a la API.
4. Realiza el `POST` a los endpoints del SNIG.
5. Actualiza `sync_status` a `synced` y guarda el `snig_transaction_id` en caso de éxito.
6. En caso de rechazo (ej. "El animal no pertenece al DICOSE de origen"), actualiza a `error` y guarda el `error_message`.

## Impacto en el frontend

- **Panel de monitoreo SNIG:** una nueva vista (accesible para administradores) que lista los eventos en estado `error` o `pending` prolongado. El acceso se controla vía el DAL (verificación de rol admin en el Server Action/ruta), no vía RLS.
- **Resolución de conflictos:** si el SNIG rechaza un movimiento, el usuario no puede simplemente editar el evento (por la regla de inmutabilidad). El flujo correcto desde el frontend es: leer el error, emitir un evento `void` referenciando el `event_id` erróneo, y cargar el lote corregido, que genera un nuevo ciclo de sincronización.

## Fuera de alcance de este spec

El detalle exacto del mecanismo de scheduling del worker (cron del sistema operativo, cola dedicada, etc.) y el plan de migración de datos de Supabase a Postgres local en general — se definen en specs/planes de infraestructura separados.
