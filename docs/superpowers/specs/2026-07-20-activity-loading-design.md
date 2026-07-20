# Diseño: Carga de caravanas y actividades por lote (sin Claude)

**Fecha:** 2026-07-20
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** frontend, alternativo al módulo de chat con Claude (pausado hasta resolver la cuenta de API). Depende del esquema de base de datos, RLS, y modelo de potreros, todos ya implementados y mergeados a `main`. Cubre dos actividades de referencia — **traslado** y **sanidad** — el resto (recategorización, venta, baja) se agrega después reutilizando el mismo patrón.

## Contexto

Es la pieza que faltaba del flujo típico descrito en el documento original del proyecto: "seleccionar un lote (por Excel de caravanas) → elegir la acción → aplicar una vez → el sistema genera un evento por cada animal del lote." A diferencia del módulo de chat (pausado), este flujo es un formulario tradicional — no depende de la API de Claude y se puede construir ya.

## Decisiones de diseño

### Alta de animales nuevos, integrada al flujo de actividad (no un flujo separado)

No existe una pantalla de "alta" separada. Cuando el Excel de una actividad trae una caravana que no existe en el sistema, se crea automáticamente como parte de esa misma operación ("se agrega a las existencias"). El usuario ve en el preview cuáles son nuevas antes de confirmar — es su oportunidad de detectar un error de tipeo antes de que se cree un animal de más.

**Categoría inicial:** el Excel puede traer una columna `categoria` opcional. Si la caravana ya existe, esa columna se ignora (no se toca su categoría actual). Si es nueva y la columna trae un valor, se usa para la categoría inicial. Si no, el animal queda sin categoría hasta que se cargue una recategorización más adelante.

**Ubicación de animales nuevos** (necesaria porque el campo/potrero de un animal siempre se deriva de sus eventos, nunca es un dato suelto — sin esto, el animal quedaría invisible para el manager que lo cargó, ya que la RLS filtra por campo actual):
- Si la actividad es **traslado**: el animal nuevo recibe directamente el evento de traslado que ya se está generando para el lote (ver más abajo) — no hace falta un evento extra.
- Si la actividad es **cualquier otra** (sanidad, etc.): el animal nuevo recibe, además del evento de la actividad, un traslado interno (origen = destino = el campo desde el que se está operando, sin potrero) — solo para dejarlo ubicado. No es una actividad real que el usuario haya elegido, es infraestructura para que el animal sea visible.

### Traslado, con potrero

- El formulario pide **campo destino** (obligatorio) y **potrero destino** (opcional; el selector solo lista los potreros de ese campo, se recarga si se cambia el campo).
- Para animales **existentes**: el origen del evento (campo y potrero) se toma del estado actual de cada animal en la base — distintos animales del mismo lote pueden estar hoy en campos/potreros distintos, así que no se elige a mano.
- Para animales **nuevos**: origen = el campo desde el que se está operando (el contexto del lote), sin potrero de origen (nunca tuvieron uno).

### Sanidad

- El formulario pide **producto**, **dosis**, **unidad de dosis**, **vía de administración**, y **días de carencia** — uniformes para todo el lote, igual que ya se había definido antes de este spec.
- El período de carencia (para venta/faena, por residuos en carne) se precarga con el default del producto elegido (`product.default_withdrawal_days`), pero queda editable para ese lote específico — la carencia real a veces depende de la dosis u otros factores. Se guarda en `event_health.withdrawal_days`, que ya existe en el esquema.
- No se calcula ni se muestra en esta pantalla la fecha desde la que los animales quedan habilitados para venta — el dato queda disponible para eso más adelante (ej. en el reporte de "sanidades pendientes" ya anotado como spec futuro).

### Flujo de validación y confirmación (sin persistir el Excel)

1. El usuario elige la actividad, sube el Excel, completa los parámetros propios de esa actividad, y envía.
2. Un **Server Action de validación** parsea el Excel server-side (recibido directo en el request, nunca guardado en disco ni en la base) y devuelve un preview estructurado: por cada fila, si el animal existe (con su campo/potrero/categoría actual) o es nuevo (con la categoría que trajo el Excel, si trajo), o es un error de fila.
3. El preview se guarda en el estado de React de la pantalla — no hace falta un mecanismo de almacenamiento temporal server-side ni volver a subir el archivo.
4. Al confirmar, un **segundo Server Action** recibe esa lista ya validada directamente (no vuelve a tocar el Excel) y crea, en una transacción: `batch_operation`, un `event` (+ tabla hija) por cada fila válida, y el `animal`/`animal_tag_history`/eventos de ubicación para las filas nuevas.

### Errores de fila (bloquean la confirmación de todo el lote)

- Caravana duplicada dentro del mismo Excel.
- Caravana que corresponde a un animal ya vendido o muerto (`status <> 'alive'`).
- Columna `categoria` con un valor que no existe en el catálogo `category`.

Si el Excel tiene cualquier fila con error, no se aplica nada hasta que se corrija — evita cargas parciales confusas donde algunos animales del lote quedan procesados y otros no.

## Testing

- **Vitest**: la lógica de parseo/validación del Excel (existente, nueva, duplicada, vendida/muerta, categoría inválida) como funciones puras, sin tocar la base.
- **Playwright E2E** contra el Supabase local: subir un Excel real con mezcla de caravanas existentes y nuevas, confirmar, y verificar en la base que los animales/eventos quedaron creados correctamente — para traslado (con y sin potrero) y sanidad.

## Fuera de alcance de este spec

Recategorización, venta y baja como actividades (mismo patrón, se agregan después). Selección de lote por criterio en lenguaje natural o por tabla con checkboxes (formas alternativas de armar el lote, no cubiertas acá — este spec es específicamente el camino de Excel). El módulo de chat con Claude.
