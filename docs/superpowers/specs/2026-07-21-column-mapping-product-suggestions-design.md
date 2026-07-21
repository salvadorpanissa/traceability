# Diseño: reabrir el mapeo de columnas, mapeo de "Producto", y alta de producto en el formulario de sanidad

**Fecha:** 2026-07-21
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** extiende [`docs/superpowers/specs/2026-07-21-transfer-activity-loading-design.md`](./2026-07-21-transfer-activity-loading-design.md) y [`docs/superpowers/specs/2026-07-21-health-activity-loading-design.md`](./2026-07-21-health-activity-loading-design.md), ambos ya implementados y mergeados a `main`. Retoma la parte de "mapeo de columna Producto" que el spec de sanidad había dejado explícitamente fuera de alcance.

## Contexto

Dos limitaciones del flujo actual, encontradas en uso real:

1. **El mapeo de columnas nunca se puede revisar una vez guardado.** `previewTransferBatch`/`previewHealthBatch` aplican en silencio el mapeo guardado para una firma de encabezados ya conocida — el usuario nunca vuelve a ver el paso de mapeo, así que no puede asignarle un significado nuevo a una columna que dejó como "Ignorar" la primera vez (por ejemplo, para aprovechar la opción "Producto" que este spec agrega).
2. **Sanidad con múltiples productos en columnas separadas** (el caso real ya documentado en el spec original: un lector de caravanas exporta `SANIDAD` + `SANIDAD 2`, dos productos aplicados en la misma pasada) obliga hoy a cargar la lista de productos totalmente a mano en el formulario, sin aprovechar que el Excel ya trae esa información.

## Decisiones

### 1. El mapeo se reabre si queda alguna columna "Ignorar"

Un mapeo guardado siempre tiene una entrada por columna (incluidas las que se dejaron en "Ignorar" la primera vez) — eso se trata como "no configurada de verdad". `previewTransferBatch`/`previewHealthBatch` comparan el mapeo guardado contra la firma de encabezados: si **alguna** columna quedó en `"ignore"`, se vuelve a mostrar el paso de mapeo (precargado con las elecciones guardadas, no en blanco) para que el usuario pueda terminar de configurarlas o dejarlas como están y confirmar. Si ninguna quedó en `"ignore"`, se aplica en silencio como hoy.

### 2. Nuevo significado "Producto", solo para sanidad, no exclusivo

`ColumnMeaning` gana `"product"`. El `ColumnMapper` recibe qué significados ofrecer según la actividad (traslado: Caravana/Fecha/Categoría/Ignorar, sin cambios; sanidad: los mismos + Producto). A diferencia de Caravana (exactamente una columna obligatoria), **Producto puede marcarse en más de una columna a la vez** — cubre el caso `SANIDAD` + `SANIDAD 2`.

### 3. Autocompletar la lista de productos desde las columnas mapeadas

Al confirmar el mapeo (primera vez o al reabrirlo), por cada columna marcada como "Producto" se toma su primer valor no vacío (se asume uniforme en todo el archivo, igual que el resto del mapeo) y se agrega una fila a la lista de productos del formulario de sanidad:
- Si el valor matchea el `name` de un producto del catálogo (comparación case-insensitive, sin espacios extra), la fila arranca con ese producto ya elegido y sus valores default de dosis/carencia precargados (mismo comportamiento que elegir el producto a mano).
- Si no matchea ninguno, la fila arranca con el desplegable vacío, pero recuerda el nombre crudo del Excel para prellenar el alta rápida (decisión 4).

Ninguna columna mapeada como "Producto" cambia cómo se resuelven las filas por animal (`resolveBatchRows` no se toca) — sigue siendo, como hoy, una lista de productos aplicada uniformemente a todo el lote.

### 4. Alta de producto nuevo desde cualquier fila de la lista

El desplegable de producto de cada fila (venga de una sugerencia del Excel o agregada a mano con "+ Agregar producto") suma una opción **"+ Crear producto nuevo"**. Al elegirla, la fila muestra un input de nombre — precargado con el valor crudo del Excel si esa fila vino de una columna sin match, vacío si la fila se agregó a mano — y un botón "Crear". Al confirmar:
- Se crea el producto en el catálogo (`product.name` ya es único a nivel de base; un nombre repetido muestra el error de esa restricción).
- El catálogo en memoria del formulario se actualiza al instante (sin recargar la página), quedando disponible en el desplegable de **todas** las filas, no solo la que lo creó.
- La fila que lo creó queda con ese producto seleccionado.

No pide dosis/carencia default al crear — esos campos quedan en `null` en el catálogo (igual que un producto cargado a mano hoy contra la base), editables por fila como siempre; una pantalla de administración de catálogo queda fuera de alcance, igual que antes.

## Cambios de esquema

Ninguno — `product` ya tiene todo lo necesario.

## Server Actions nuevas

`createProductAction(name: string): Promise<ProductCatalogEntry>` — inserta en `product` (solo `name`, resto `null`), devuelve la entrada creada. Cualquier usuario autenticado puede crearlo, mismo criterio que categorías/productos hoy (catálogo compartido, no filtrado por campo).

## Fuera de alcance

Edición o borrado de productos ya creados. Pantalla de administración de catálogo. Variación de producto por fila del Excel (sigue siendo una lista uniforme para todo el lote). Reabrir el mapeo cuando **todas** las columnas ya tienen un significado real asignado (caso no cubierto: si alguna vez hace falta cambiar algo ya configurado, no hay flujo para eso todavía).

## Testing

Vitest: `applyColumnMapping`/nueva función de extracción de sugerencias de producto (pura); `previewTransferBatch`/`previewHealthBatch` con mapeo parcialmente `"ignore"` reabriendo el paso; `createProductAction` (integración); `ColumnMapper` con el significado "Producto" habilitado y selección múltiple; `ProductListEditor` con la opción de alta inline. Sin cambios de Playwright E2E nuevos obligatorios — los flujos existentes (`transfer-activity.spec.ts`, `health-activity.spec.ts`) siguen pasando sin modificación ya que sus archivos de prueba no dejan columnas en "Ignorar".
