# Diseño: Consulta en lenguaje natural → SQL → tabla, en el dashboard

**Fecha:** 2026-07-22
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** nueva sección del dashboard (`/dashboard`), definido en `docs/superpowers/specs/2026-07-20-dashboard-reports-design.md`. Depende del esquema de base de datos y del modelo de autorización por campo (`isAdmin`/`userFarmIds`/`requireFarmAccess`) ya existentes.

## Contexto

El dashboard actual (stock por potrero, stock por categoría) cubre dos vistas fijas predefinidas. Se agrega una tercera sección: un cuadro de texto donde el usuario escribe una pregunta en lenguaje natural (español), que se traduce a SQL mediante un LLM (Gemini, capa gratuita) y se ejecuta contra la base para devolver una tabla de resultados con columnas dinámicas.

El requisito de negocio central es que esta funcionalidad **debe respetar el mismo modelo de autorización por campo que el resto de la app**: un manager solo puede ver datos de los campos a los que tiene acceso; un admin ve todo.

## Modelo de seguridad: vistas temporales acotadas por campo

En vez de confiar en que el SQL generado por la IA incluya (correctamente) un filtro de campo, el filtrado se aplica **antes** de que la IA vea el esquema:

1. El servidor calcula el alcance del usuario (`isAdmin(role)` / `userFarmIds(userId)`, patrón ya existente en `lib/dal/farm-access.ts`).
2. Dentro de una transacción de solo lectura, se crean vistas temporales (`CREATE TEMP VIEW`) ya filtradas al alcance del usuario (sin filtro si es admin).
3. El LLM solo conoce el esquema de esas vistas temporales — nunca ve las tablas reales ni columnas de campo (`farm_id`/`current_farm_id`), porque para él la vista ya es "todo lo que existe".
4. El SQL generado se valida (un solo `SELECT`, solo tablas de la whitelist `my_*`, sin funciones peligrosas) y se ejecuta contra esas vistas.

Esto garantiza que ninguna consulta generada por la IA — sin importar cuán compleja sea (joins, `GROUP BY`, agregaciones) — puede exponer datos de un campo fuera del alcance del usuario, porque esos datos físicamente no están en las vistas que consulta.

**Riesgo residual:** ninguno relevante para el scoping por campo — el filtrado ocurre a nivel de datos, no de texto SQL. El riesgo que sí queda (y se acepta para v1) es el de cualquier generador de SQL asistido por IA: la calidad de la respuesta depende de qué tan bien el LLM interpreta la pregunta.

## Esquema curado expuesto al LLM

### Estado actual
- **`my_animal_state`** — vista nueva sobre la materializada `animal_current_state`, con nombres legibles: tag, estado (`alive`/`sold`/`dead`), nombre de campo, nombre de potrero, nombre de categoría, nombre de propietario.
- **`my_farms`**, **`my_paddocks`**, **`my_categories`**, **`my_products`**, **`my_owners`** — catálogos de referencia (los últimos tres sin scoping por campo, son catálogos globales).

### Historial de eventos
Mismo patrón para cada tipo: `event` + tabla hija del tipo + tag del animal + nombres resueltos de campo/potrero/categoría/producto según corresponda. Todas excluyen eventos anulados (`event_type = 'void'` y los eventos que fueron anulados por un `void`), replicando la lógica ya usada por `animal_current_state`.

- **`my_transfer_events`** — traslados (campo/potrero origen y destino).
- **`my_health_events`** — sanidad (producto, dosis, vía, carencia).
- **`my_retag_events`** — recaravaneos (tag viejo/nuevo).
- **`my_recategorize_events`** — recategorizaciones (categoría vieja/nueva).
- **`my_sale_events`** — ventas (comprador, precio, peso).
- **`my_death_events`** — bajas (causa).

El scoping por campo en las vistas de eventos se aplica sobre `event.farm_id` (el campo donde se registró el evento), restringido a los `farmIds` del usuario para no-admins.

**Fuera de alcance de v1:** cualquier tabla no listada arriba (usuarios, roles, autenticación, mapeos de columnas de importación) no es visible para el LLM bajo ninguna circunstancia — ni siquiera para admins, ya que no forman parte del esquema de reporting.

## Rol de Postgres de solo lectura dedicado

- Rol nuevo (ej. `reporting_ro`) creado vía migración SQL, con `GRANT SELECT` únicamente sobre las tablas base necesarias para las vistas curadas (`animal`, `farm`, `paddock`, `category`, `product`, `owner`, `event`, `event_transfer`, `event_health`, `event_retag`, `event_recategorize`, `event_sale`, `event_death`, y la vista materializada `animal_current_state`).
- Sin permisos de `INSERT`/`UPDATE`/`DELETE`/`DROP`/DDL sobre nada. `CREATE TEMP VIEW` no requiere permisos adicionales de schema (corre en el `pg_temp` de la sesión).
- `statement_timeout` corto (5 segundos) fijado a nivel de rol, para cortar consultas ineficientes generadas por el LLM.
- Connection string nueva en `.env.local` / `.env.local.example` (ej. `DATABASE_URL_REPORTING`), con un pool de conexión separado (`web/lib/dal/reporting-db.ts`) del que usa el resto de la app (`web/db/index.ts` no cambia).

## Pipeline del Server Action

1. **Autorización**: `requireSession()` + `isAdmin(role)` / `userFarmIds(userId)`.
2. Abrir conexión con el pool de reporting, `BEGIN TRANSACTION READ ONLY`.
3. Crear las 12 vistas temporales (`my_animal_state`, los 5 catálogos, y las 6 de eventos) con el filtro de campo aplicado (o sin filtro si es admin).
4. Prompt a Gemini: esquema (columnas y tipos) de esas vistas + la pregunta del usuario + instrucción de devolver únicamente el SQL, un solo `SELECT`, sin explicación ni markdown.
5. Validar el SQL con `node-sql-parser` (dialecto Postgres):
   - Exactamente un statement `SELECT` (rechaza múltiples statements separados por `;`, DDL, DML, `COPY`, etc.).
   - Todas las tablas referenciadas deben estar en la whitelist `my_*`.
   - Rechaza funciones no permitidas (whitelist de agregaciones comunes: `count`, `sum`, `avg`, `min`, `max`, `now`, etc.; bloquea `pg_sleep`, `dblink*`, `lo_*`, y cualquier función no listada).
   - Si no trae `LIMIT`, se agrega `LIMIT 500` automáticamente.
6. Si la validación falla: rollback, no se ejecuta nada, se devuelve un error genérico.
7. Ejecutar el SQL validado dentro de la misma transacción, contra las vistas temporales.
8. Devolver `{ columns: string[], rows: Record<string, unknown>[] }` al cliente (columnas dinámicas, tal cual las nombra Postgres).
9. `COMMIT` (o rollback en error) y cerrar la conexión — las vistas temporales desaparecen solas al terminar la sesión/transacción.

## UI / UX

- Nueva sección arriba de "Stock por potrero" y "Stock por categoría" en `/dashboard`.
- Componente `NaturalLanguageQuery`: `<textarea>` para la pregunta + botón "Consultar", deshabilitado con spinner mientras la consulta está en curso (mismo patrón visual que los botones de carga de actividades existentes).
- Componente `QueryResultTable`: tabla genérica con columnas dinámicas derivadas de las claves del primer row devuelto. Estado vacío: "Sin resultados para esta consulta."
- Sin historial persistente en v1: cada consulta reemplaza la tabla anterior; no se guarda en base ni en sesión.
- El SQL generado **no se muestra** al usuario — solo la tabla de resultados o el mensaje de error.
- Textos nuevos agregados al diccionario i18n existente (`web/lib/i18n/dictionaries.ts`).

## Manejo de errores

Mensajes genéricos en español, sin exponer SQL generado ni errores crudos de Postgres/Gemini:

- LLM no devuelve algo parseable como SQL → *"No pude generar una consulta a partir de tu pregunta. Probá reformularla."*
- SQL generado no pasa la validación (tabla fuera de whitelist, múltiples statements, función prohibida) → mismo mensaje genérico (no se revela el motivo específico del rechazo).
- Timeout de Postgres (`statement_timeout`) → *"La consulta tardó demasiado. Probá con una pregunta más simple o específica."*
- Error de red/rate-limit de Gemini → *"No se pudo conectar con el asistente. Probá de nuevo en un momento."*

**Nota operativa:** la capa gratuita de Gemini Flash tiene límite de requests por minuto. Para v1 no se agrega rate-limiting propio más allá de deshabilitar el botón mientras hay una consulta en curso (app interna de equipo chico, no pública).

## Testing

- **Unit — validador de SQL**: SELECT válido, múltiples statements, DDL/DML, tabla fuera de whitelist, función prohibida, `LIMIT` faltante (se agrega automáticamente).
- **Integration — Server Action** (contra `testDb`, mockeando la llamada a Gemini con `vi.mock`):
  - Happy path devuelve las filas esperadas.
  - **Caso clave de seguridad**: seedear dos campos con animales, loguearse como manager de uno solo, mockear a la IA para que devuelva SQL *sin* filtro de campo (`SELECT * FROM my_animal_state`) — el test debe confirmar que solo vuelven filas del campo del manager. Repetir con un admin y confirmar que ve datos de ambos campos.
- **Component — `QueryResultTable`**: columnas dinámicas, estado vacío, valores `null`.
- **E2E (Playwright)**: mock de la llamada a Gemini a nivel de red (no se pega contra la API real en CI) — flujo completo: escribir pregunta → ver loading → ver tabla con datos esperados.

## Fuera de alcance de este spec

- Mostrar el SQL generado al usuario.
- Historial de consultas persistente.
- Rate-limiting propio más allá del deshabilitado de botón durante la consulta en curso.
- Cualquier tabla no listada en el esquema curado (usuarios, roles, autenticación, mapeos de columnas de importación), incluso para admins.
- Exportación de resultados, gráficos sobre el resultado de la consulta libre.
