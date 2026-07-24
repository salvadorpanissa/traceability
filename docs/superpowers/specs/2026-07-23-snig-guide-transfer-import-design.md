# Diseño: Importar guía SNIG (PDF) en Traslados

**Fecha:** 2026-07-23
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** primera parte de un proyecto de dos etapas. Construye un parser reusable de la "Constancia de Propiedad y Tránsito" (SNIG) y lo integra a la actividad de Traslado, ya existente. La actividad de **Venta** (que hoy no existe en la app — solo hay pantallas para Sanidades y Traslados, aunque el modelo de datos ya tiene `event_sale`) queda como sub-proyecto siguiente, reusando este mismo parser.

## Contexto

MGAP/SNIG emite, para cada movimiento de animales entre establecimientos, una "Constancia de Propiedad y Tránsito de Animales Registrados": un PDF de layout fijo (solo cambian los datos) que ya trae toda la información necesaria para cargar un lote de traslado: fecha, número de guía, DICOSE de origen y destino, y la lista completa de caravanas con sexo y edad. Hoy, para cargar un traslado, el usuario arma o exporta un Excel a mano y lo sube por el flujo existente (selección de columnas, fecha manual, etc.). Cuando el usuario ya tiene la guía SNIG en PDF, ese trabajo es redundante — el PDF ya contiene todo.

Ejemplo de guía usado como referencia (ver PDF adjunto en la conversación, `D838153.pdf`):
- FECHA: 11/07/2026
- CORRESPONDE A LA GUÍA DE PROPIEDAD Y TRÁNSITO: D838153
- DICOSE A: 151400442 (PANISSA SILVA ANTONIO Y HORACIO) — propietario
- DICOSE B: 151518192 (PANISSA SILVA ANTONIO Y HORACIO) — mismo propietario en este caso; si hubiera cambio de propiedad, sería el DICOSE del nuevo propietario o del consignatario/rematador
- DICOSE C: 151400442 — campo físico de origen
- DICOSE D: 151518192 — campo físico de destino
- CAMBIO DE PROPIEDAD: NO
- 64 caravanas, cada una con sexo (H/M) y edad en meses, en una lista numerada que puede continuar en la página siguiente
- Nombre del titular que emite la constancia (informativo, no se persiste)

Nota: DICOSE A/B no necesariamente coinciden aunque sea un traslado interno (mismo dueño, dos campos propios) — la señal de qué formulario usar (Traslado vs. Venta) la elige el usuario manualmente al cargar, no se infiere de "CAMBIO DE PROPIEDAD".

## Parser de la guía SNIG

Nuevo módulo `lib/activities/snig-guide-parsing.ts`, con una función `parseSnigGuide(buffer: ArrayBuffer): Promise<SnigGuide>`:

```ts
type SnigGuide = {
  guideNumber: string;
  eventDate: string; // ISO yyyy-mm-dd
  originDicoseCode: string;   // DICOSE C
  destinationDicoseCode: string; // DICOSE D
  animals: { tag: string; sex: "male" | "female" | null; ageMonths: number | null }[];
};
```

**Riesgo técnico identificado y a validar en el plan de implementación:** el texto de un PDF no siempre se extrae en orden visual de lectura — en la prueba de lectura del PDF de ejemplo, las etiquetas ("DICOSE A:", "DICOSE B:", ...) y sus valores no aparecieron intercalados de forma trivial (todas las etiquetas primero, todos los valores después, en otro bloque). Por eso, la implementación debe extraer texto **con posición** (coordenadas x/y de cada fragmento, vía una librería que las exponga, ej. `pdfjs-dist`) y reconstruir los pares etiqueta→valor por cercanía vertical/horizontal, en lugar de regex sobre texto plano. El plan de implementación debe incluir, como primer paso, una prueba de esta técnica contra el PDF de ejemplo real antes de construir el resto del parser — y el usuario va a probar con guías adicionales para detectar variaciones de formato no cubiertas por el único ejemplo disponible hoy.

Reglas de extracción:
- `guideNumber`: valor junto a "CORRESPONDE A LA GUÍA DE PROPIEDAD Y TRÁNSITO:".
- `eventDate`: valor junto a "FECHA:", normalizado con `normalizeDate` (ya existente, soporta `dd/mm/yyyy`).
- `originDicoseCode` / `destinationDicoseCode`: valores junto a "DICOSE C:" / "DICOSE D:" respectivamente (los códigos numéricos, no el nombre del titular que aparece al lado).
- `animals`: la lista numerada bajo "NÚMEROS DE CARAVANAS:", que puede continuar en páginas siguientes (debe recorrerse el PDF completo, no solo la primera página) hasta la sección "RESUMEN DE ANIMALES...". Cada entrada tiene caravana, sexo (`H`/`M`, normalizado con `normalizeSex` ya existente) y edad en meses (entero).
- Si falta cualquier campo obligatorio (guideNumber, eventDate, algún DICOSE, o la lista de caravanas está vacía), `parseSnigGuide` lanza un error descriptivo — no se intenta adivinar ni completar con valores parciales.

## Resolución DICOSE → campo

Nueva función en `lib/dal/dicose-registration.ts` (o archivo nuevo si crece), `findFarmByDicoseCode(dicoseCode: string): Promise<{ farmId: string; farmName: string } | null>`, que busca en `dicose_registration` por `dicoseCode`. Si `originDicoseCode` o `destinationDicoseCode` no resuelven a ningún registro, se corta con un error claro ("No hay ningún campo registrado con DICOSE 151400442") antes de mostrar cualquier preview.

## UI: segunda forma de cargar el lote en Traslado

En `components/activities/transfer-form.tsx`, se agrega una alternativa junto al upload de Excel actual: un selector simple (ej. dos botones/tabs) **"Excel"** vs **"Guía SNIG (PDF)"**.

Camino Excel: sin cambios (selección de campo destino → subir archivo → mapear columnas si hace falta → fecha manual si falta → preview → confirmar).

Camino PDF: no se pide nada de antemano. El usuario sube el PDF; el sistema:
1. Parsea la guía (`parseSnigGuide`).
2. Resuelve origen y destino vía DICOSE (`findFarmByDicoseCode`), cortando con error si alguno no está registrado.
3. Muestra la info resuelta (campo origen, campo destino, fecha, N° de guía) junto con la tabla de preview de animales — reusando el mismo componente de preview y el mismo flujo de resolución de dueños/potreros pendientes que ya existe para Excel.
4. Confirmar guarda el lote igual que hoy, pero con `originFarmId`/`destinationFarmId` explícitos del PDF (ver siguiente sección) y con `guideNumber` completado.

Server action nueva, `previewTransferBatchFromPdf(formData: FormData)` en `app/(protected)/activities/transfer/actions.ts`, análoga a `previewTransferBatch` pero sin `farmId`/`eventDate` de entrada (todo sale del PDF) y devolviendo también el origen/destino resueltos para mostrarlos en el preview.

## Cambios en resolución de filas y confirmación

- `ResolvedRow` (en `lib/activities/batch-resolution.ts`) para status `"new"`/`"wrong_farm"`/`"foreign"` gana un campo `birthDate: string | null` ya existente en el tipo — hoy solo lo completa el flujo de altas de caravanas propias (`own-tag`); `resolveBatchRows` para Traslado debe poder recibirlo también cuando la fila viene de una guía PDF con edad conocida.
- Edad → fecha de nacimiento estimada: `eventDate` de la guía menos `ageMonths` meses, aproximado al día 1 del mes resultante (mismo criterio que ya usa `normalizeDate` para fechas `mm/yyyy` sin día conocido). Solo aplica a filas que terminan siendo altas nuevas (`"new"`, `"wrong_farm"`, `"foreign"` forzada) — una fila `"existing"` ignora por completo el sexo/edad del PDF, igual que ya ignora cualquier dato redundante de otras fuentes hoy.
- `confirmTransferBatch` (en `lib/activities/transfer.ts`): para el camino PDF, `originFarmId` de los animales nuevos deja de ser igual al destino (comportamiento actual, heredado del flujo Excel) y pasa a ser el `originFarmId` resuelto por DICOSE C. Este cambio queda acotado a filas que llegan por este nuevo camino — el comportamiento del flujo Excel actual no se modifica.
- `guideNumber` (columna ya existente en `event_transfer`, hoy nunca completada por ningún flujo) se guarda por primera vez con el número de guía del PDF.
- Categoría queda sin asignar — la guía SNIG no trae categoría, igual que cualquier alta sin ese dato hoy.

## Manejo de errores y casos borde

- DICOSE de origen o destino sin registro en el sistema: error claro antes del preview, no se continúa.
- PDF que no es una guía SNIG reconocible, o al que le falta algún campo obligatorio: error descriptivo, sin intentar completar con valores parciales.
- Lista de caravanas que continúa en páginas siguientes: el parser recorre todas las páginas del PDF.
- Caravana duplicada dentro del mismo PDF: mismo criterio que ya aplica `resolveBatchRows` hoy para Excel (fila marcada como error) — no se reinventa lógica nueva.
- Caravana que ya existe en el sistema (`"existing"`): sigue el camino normal; sexo/edad del PDF se descartan para esa fila.

## Testing

- **Unit — `parseSnigGuide`**: contra el PDF de ejemplo (`D838153.pdf`) y contra los ejemplos adicionales que el usuario va a aportar — extrae correctamente guideNumber, fecha, ambos DICOSE (C y D), y las 64 filas de caravanas con sexo/edad, incluyendo el cruce página 1→2. Casos de error: campo obligatorio faltante, lista de caravanas vacía.
- **Unit — `findFarmByDicoseCode`**: código encontrado (devuelve farmId/farmName) vs. no encontrado (`null`, y el llamador corta con error).
- **Unit — `resolveBatchRows` extendido**: fila nueva con `birthDate` estimado se resuelve correctamente con ese valor; fila `"existing"` ignora el birthDate provisto.
- **Unit — `confirmTransferBatch`**: fila nueva proveniente del camino PDF usa el `originFarmId` explícito (no el destino) y guarda `guideNumber`.
- **Component — `TransferForm`**: alternar entre "Excel" y "Guía SNIG (PDF)"; al subir el PDF se resuelven y muestran origen/destino/fecha/N° de guía sin pedirlos manualmente; error visible si algún DICOSE no está registrado.
- **E2E**: subir el PDF de ejemplo, confirmar el lote, verificar que los animales nuevos quedan con el origen correcto (no el destino), que `guideNumber` se guardó en `event_transfer`, y que las fechas de nacimiento estimadas son coherentes con la edad informada.

## Fuera de alcance de este spec

- Actividad de **Venta** — sub-proyecto siguiente, que se apoya en `parseSnigGuide`/`findFarmByDicoseCode` construidos acá.
- Generación de guías SNIG o cualquier documentación oficial — este sub-proyecto es de solo lectura/importación.
- Autodetección automática de traslado vs. venta a partir de "CAMBIO DE PROPIEDAD" — el usuario elige manualmente en qué formulario cargar cada guía.
- Cambios al flujo Excel existente de Traslado — queda intacto; el camino PDF es aditivo.
