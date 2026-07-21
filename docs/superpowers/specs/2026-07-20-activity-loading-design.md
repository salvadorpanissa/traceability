# Diseño: Carga de caravanas y actividades por lote (sin Claude)

**Fecha:** 2026-07-20 (revisado 2026-07-20, tras inspeccionar un archivo real de lectura)
**Estado:** Aprobado, pendiente de plan de implementación (revisión — ver "Revisión" abajo)
**Sub-proyecto:** frontend, alternativo al módulo de chat con Claude (pausado hasta resolver la cuenta de API). Depende del esquema de base de datos, RLS, y modelo de potreros, todos ya implementados y mergeados a `main`. Cubre dos actividades de referencia — **traslado** y **sanidad** — el resto (recategorización, venta, baja) se agrega después reutilizando el mismo patrón.

## Nota de migración (2026-07-20)

Se decidió migrar el backend de Supabase a Postgres local + Auth.js (ver `docs/superpowers/specs/2026-07-20-frontend-auth-shell-design-v2.md`). Las validaciones de permisos descritas en este spec que hoy se apoyan en RLS de Supabase pasan a verificarse en el DAL (Server Actions); la lógica de negocio (qué puede hacer un manager vs. un admin) no cambia.

## Revisión (importante)

La primera versión de este spec asumía que el Excel siempre trae columnas fijas (`caravana`, `categoria` opcional). Un archivo real de lectura (exportado por el lector de caravanas electrónicas en una sanidad del 16/06) mostró que esto no se sostiene:

- Los encabezados reales son `IDE` (caravana electrónica, número de 15 dígitos), `IDV`, `Fecha`, `Hora`, `SEXO`, `SANIDAD`, `SANIDAD 2`, `PROPIETARIO`, `NOTA` — nada que se llame "caravana" ni "categoria".
- Una misma lectura puede traer **más de un producto aplicado a la vez** (`SANIDAD` + `SANIDAD 2` = dos productos distintos en una sola pasada).
- Columnas como `PROPIETARIO` varían **por fila dentro del mismo archivo** (dos dueños distintos en el mismo lote).
- El formato **varía incluso entre lecturas del mismo tipo de actividad** — no hay una plantilla fija ni siquiera por actividad.

Esta sección documenta los cambios de diseño que resultan de eso. El resto del documento (alta automática de animales nuevos, traslado con potrero, flujo de validación sin persistir el Excel, errores que bloquean el lote) sigue vigente sin cambios — lo que cambia es *cómo se interpreta el Excel* y se agregan dos datos nuevos del animal.

### Mapeo de columnas manual (reemplaza la detección por nombre fijo)

En vez de buscar columnas llamadas "caravana"/"categoria", después de subir el archivo se muestran los encabezados detectados y el usuario asigna qué significa cada uno:

- **Caravana** — obligatorio, siempre disponible.
- **Fecha** — opcional (si no se mapea, se usa la fecha que ya se completa en el formulario).
- **Categoría** — opcional, disponible para traslado y sanidad (mismo uso que antes: solo aplica a animales nuevos).
- **Producto** — solo en sanidad; se puede asignar a **varias columnas a la vez** (ver "Sanidad con múltiples productos" abajo).
- **Ignorar** — cualquier columna no relevante (`IDV`, `Hora`, `SEXO`, `PROPIETARIO`, `NOTA` en el ejemplo, a menos que se mapeen explícitamente — ver abajo).

Columnas nunca mapeadas (o mapeadas como "Ignorar") no se guardan ni se procesan.

**El mapeo se recuerda.** Se guarda asociado a la firma exacta de encabezados del archivo (mismos nombres de columna, mismo orden), compartido para toda la cuenta — no por establecimiento ni por usuario. La próxima vez que se sube un archivo con esa misma firma, el mapeo se aplica solo y el usuario solo confirma; solo hay que mapear a mano la primera vez que aparece un formato nuevo.

### Sanidad con múltiples productos

El formulario de sanidad ya no pide un solo producto — permite agregar una lista ("+ Agregar producto"), cada uno con su propia dosis/unidad/vía/carencia. Al confirmar, cada animal del lote recibe **un evento de sanidad por cada producto de la lista** (coincide con lo que pasa en la lectura real: `ASPERSIN` + `AFTOSA` aplicados juntos → dos eventos por animal).

Si una columna del Excel se mapea como "Producto" y todas sus filas traen el mismo valor (caso típico), ese valor precarga una fila de producto en el formulario. Si el nombre no matchea ningún producto del catálogo, el usuario elige el producto correcto de un desplegable en el momento — no bloquea la carga por un nombre que no coincide exactamente.

### Dos datos nuevos del animal: sexo y propietario

Ninguno de los dos existía en el modelo. A diferencia de campo/categoría/caravana (que cambian con el tiempo y por eso se derivan de eventos), ambos son **datos fijos, no versionados**:

- **`animal.sex`** (nullable) — el sexo no cambia nunca, no necesita su propio tipo de evento.
- **`animal.owner_id`** (nullable, fk → `owner`) — el propietario sí podría reasignarse en teoría (campos con ganado de varios socios pastando junto), pero se modela como dato fijo por ahora, no versionado — si más adelante hace falta trazar el historial de cambios de dueño, se rediseña como evento en un spec aparte.
- **`owner`** — catálogo nuevo, mismo patrón que `category`/`product` (evita variantes de tipeo como "SA SG" vs "S.A. S.G." y permite reportar por dueño después).

Ninguno de los dos es obligatorio en el Excel ni bloquea una fila si falta — si la columna correspondiente no se mapea, el animal (nuevo o existente) simplemente no tiene ese dato cargado.

## Contexto

Es la pieza que faltaba del flujo típico descrito en el documento original del proyecto: "seleccionar un lote (por Excel de caravanas) → elegir la acción → aplicar una vez → el sistema genera un evento por cada animal del lote." A diferencia del módulo de chat (pausado), este flujo es un formulario tradicional — no depende de la API de Claude y se puede construir ya.

## Decisiones de diseño

### Alta de animales nuevos, integrada al flujo de actividad (no un flujo separado)

No existe una pantalla de "alta" separada. Cuando el Excel de una actividad trae una caravana que no existe en el sistema, se crea automáticamente como parte de esa misma operación ("se agrega a las existencias"). El usuario ve en el preview cuáles son nuevas antes de confirmar — es su oportunidad de detectar un error de tipeo antes de que se cree un animal de más.

**Categoría inicial:** si la columna mapeada como "Categoría" trae un valor para una fila. Si la caravana ya existe, esa columna se ignora (no se toca su categoría actual). Si es nueva y la columna trae un valor, se usa para la categoría inicial. Si no, el animal queda sin categoría hasta que se cargue una recategorización más adelante.

**Sexo y propietario inicial:** mismo criterio que categoría — si la columna correspondiente está mapeada y trae valor, se usa para el alta del animal nuevo; si el animal ya existía, no se toca.

**Ubicación de animales nuevos** (necesaria porque el campo/potrero de un animal siempre se deriva de sus eventos, nunca es un dato suelto — sin esto, el animal quedaría invisible para el manager que lo cargó, ya que la RLS filtra por campo actual):
- Si la actividad es **traslado**: el animal nuevo recibe directamente el evento de traslado que ya se está generando para el lote (ver más abajo) — no hace falta un evento extra.
- Si la actividad es **cualquier otra** (sanidad, etc.): el animal nuevo recibe, además del evento de la actividad, un traslado interno (origen = destino = el campo desde el que se está operando, sin potrero) — solo para dejarlo ubicado. No es una actividad real que el usuario haya elegido, es infraestructura para que el animal sea visible.

### Traslado, con potrero

- El formulario pide **campo destino** (obligatorio) y **potrero destino** (opcional; el selector solo lista los potreros de ese campo, se recarga si se cambia el campo).
- Para animales **existentes**: el origen del evento (campo y potrero) se toma del estado actual de cada animal en la base — distintos animales del mismo lote pueden estar hoy en campos/potreros distintos, así que no se elige a mano.
- Para animales **nuevos**: origen = el campo desde el que se está operando (el contexto del lote), sin potrero de origen (nunca tuvieron uno).

### Sanidad

- El formulario pide una lista de **productos** (uno o más — ver "Sanidad con múltiples productos" arriba), cada uno con su **dosis**, **unidad de dosis**, **vía de administración**, y **días de carencia**, uniformes para todo el lote.
- El período de carencia de cada producto se precarga con su default (`product.default_withdrawal_days`), pero queda editable para ese lote específico — la carencia real a veces depende de la dosis u otros factores. Se guarda en `event_health.withdrawal_days`, que ya existe en el esquema.
- No se calcula ni se muestra en esta pantalla la fecha desde la que los animales quedan habilitados para venta — el dato queda disponible para eso más adelante (ej. en el reporte de "sanidades pendientes" ya anotado como spec futuro).

### Flujo de validación y confirmación (sin persistir el Excel)

1. El usuario elige la actividad, sube el Excel. El sistema detecta los encabezados y aplica el mapeo guardado si la firma coincide, o pide mapearlos a mano si es la primera vez.
2. El usuario completa los parámetros propios de la actividad (campo/potrero destino para traslado; lista de productos para sanidad) y envía.
3. Un **Server Action de validación** parsea el Excel server-side (recibido directo en el request, nunca guardado en disco ni en la base), aplica el mapeo de columnas, y devuelve un preview estructurado: por cada fila, si el animal existe (con su campo/potrero/categoría actual) o es nuevo (con los datos iniciales que trajo el Excel), o es un error de fila.
4. El preview se guarda en el estado de React de la pantalla — no hace falta un mecanismo de almacenamiento temporal server-side ni volver a subir el archivo.
5. Al confirmar, un **segundo Server Action** recibe esa lista ya validada directamente (no vuelve a tocar el Excel) y crea, en una transacción: `batch_operation`, un `event` (+ tabla hija) por cada fila válida (y por cada producto, en sanidad), y el `animal`/`animal_tag_history`/eventos de ubicación para las filas nuevas.

### Errores de fila (bloquean la confirmación de todo el lote)

- Caravana duplicada dentro del mismo Excel.
- Caravana que corresponde a un animal ya vendido o muerto (`status <> 'alive'`).
- Columna mapeada como "Categoría" con un valor que no existe en el catálogo `category`.

Si el Excel tiene cualquier fila con error, no se aplica nada hasta que se corrija — evita cargas parciales confusas donde algunos animales del lote quedan procesados y otros no.

## Testing

- **Vitest**: la lógica de parseo/validación del Excel (existente, nueva, duplicada, vendida/muerta, categoría inválida) y la lógica de aplicar un mapeo de columnas a filas crudas, como funciones puras, sin tocar la base.
- **Playwright E2E** contra el Supabase local: subir un Excel real con mezcla de caravanas existentes y nuevas, mapear columnas (primera vez) y confirmar que el mapeo se reutiliza en una segunda carga con la misma firma de encabezados, confirmar el lote, y verificar en la base que los animales/eventos quedaron creados correctamente — para traslado (con y sin potrero) y sanidad (con uno y con múltiples productos).

## Fuera de alcance de este spec

Recategorización, venta y baja como actividades (mismo patrón, se agregan después). Selección de lote por criterio en lenguaje natural o por tabla con checkboxes (formas alternativas de armar el lote, no cubiertas acá — este spec es específicamente el camino de Excel). El módulo de chat con Claude. Historial versionado de cambios de propietario (por ahora es un dato fijo, no un evento).
