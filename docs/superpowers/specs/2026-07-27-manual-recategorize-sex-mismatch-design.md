# Diseño: chequeo de sexo contra la categoría destino en la recategorización manual

**Fecha:** 2026-07-27
**Estado:** Aprobado, pendiente de plan de implementación
**Depende de:** [`2026-07-27-manual-recategorize-no-farm-select-age-fallback-design.md`](./2026-07-27-manual-recategorize-no-farm-select-age-fallback-design.md), ya implementado y mergeado en esta rama (sin select de campo, fallback de categoría por edad, y su ronda de fixes de seguridad).

## Contexto

Al usar la recategorización manual para mover animales a una categoría con sexo restringido (p. ej. "Novillo 1 a 2 años", `sex: male`), el sistema hoy no verifica el sexo del animal contra el de la categoría destino — una hembra en el mismo Excel se movería igual a una categoría de machos sin ningún aviso. Se pide agregar ese chequeo, con el mismo patrón de decisión (global + override por fila) ya usado para "sin edad calculable".

## Regla de mismatch

Hay mismatch cuando:
- la categoría destino tiene `sex` definido (`male` o `female`), **y**
- el animal tiene `sex` cargado en la base, **y**
- son distintos.

Si el animal no tiene sexo cargado, o la categoría destino no tiene sexo (aplica a ambos), **no** hay mismatch — se asigna normal, sin preguntar.

## Alcance: qué filas participan

El chequeo aplica a toda fila que vaya a terminar con `newCategoryId = targetCategoryId`:

- **`existing`** (tiene categoría actual, se mueve al destino): siempre en alcance si cambia de categoría.
- **`age-unresolvable`** cuya decisión (ya existente, de la spec anterior) sea `"assignTarget"`: en alcance — si además hay mismatch de sexo, se le agrega una **segunda** decisión a esa misma fila.
- **`age-resolved`**: nunca en alcance. `resolveCategoryForAge` ya filtra por sexo al elegir la categoría, así que un mismatch ahí es estructuralmente imposible.

Una fila `age-unresolvable` puede terminar con dos decisiones apiladas: la primera (omitir / asignar destino, ya existente) y, solo si la primera es "asignar destino" y hay mismatch de sexo, una segunda (omitir / asignar igual). Si la primera decisión es "omitir", la fila ya está descartada y la segunda pregunta no aplica.

## UI

Mismo patrón que "sin edad calculable", como un control **independiente**:

- Un segundo toggle global: *"Animales de sexo distinto al de la categoría destino: Omitir / Asignar igual"* (default: Omitir).
- Un selector por fila en la tabla de preview, análogo al de edad, que aparece:
  - siempre en filas `existing` con mismatch,
  - condicionalmente en filas `age-unresolvable` cuya decisión efectiva de edad sea "asignar destino" y haya mismatch (se renderiza debajo/junto al selector de edad ya existente en esa celda).
- El selector por fila arranca en el valor del toggle global correspondiente pero se puede cambiar individualmente, igual que ya funciona para edad (mismo mecanismo de "override gana sobre default global").

## Backend

### Resolución de filas (`recategorize-resolution.ts`)

Se agrega `sex: "male" | "female" | null` a las variantes `"existing"` y `"age-unresolvable"` de `RecategorizeResolvedRow` (el dato ya se lee en la consulta SQL existente para el fallback de edad; solo falta incluirlo en estas dos ramas del resultado).

### Confirmación (`recategorize.ts`)

`confirmRecategorizeBatch` recibe un nuevo parámetro `sexMismatchDecisions: Record<string, "skip" | "assignTarget">` (keyed por `animalId`, mismo tipo `UnresolvableDecision` reusado).

Antes de construir `plannedChanges`, se carga una vez el `sex` de la categoría destino (`targetCategoryId`). Igual que ya se hizo para el fix de seguridad de la ronda anterior, el sexo del animal usado para el chequeo es el que se vuelve a leer de la base (`loadFreshState`), nunca el que mandó el cliente en la fila.

Reglas por tipo de fila:
- **`existing`** que cambia de categoría: si hay mismatch de sexo (sexo de categoría destino definido, sexo del animal definido y distinto), se consulta `sexMismatchDecisions[animalId] ?? "skip"`; si es `"skip"`, la fila se excluye del batch (no genera evento); si es `"assignTarget"`, sigue el flujo normal (`oldCategoryId = categoría actual`, `newCategoryId = targetCategoryId`, `source: "manual"`).
- **`age-unresolvable`** con decisión de edad `"assignTarget"`: si además hay mismatch de sexo, se aplica el mismo chequeo de `sexMismatchDecisions` antes de incluir la fila; si la decisión de sexo es `"skip"`, la fila se excluye igual que si la decisión de edad hubiera sido `"skip"`.
- Sin mismatch de sexo, el comportamiento es exactamente el ya implementado (sin cambios).

### Server Action (`actions.ts`)

`confirmRecategorizeBatchAction` agrega `sexMismatchDecisions` a su input y lo pasa tal cual a `confirmRecategorizeBatch`.

## Frontend (`recategorize-form.tsx` + `recategorize-preview-table.tsx`)

- Nuevo estado en el form: `sexMismatchGlobalDefault: "skip" | "assignTarget"` (default `"skip"`) y `sexMismatchOverrides: Record<string, "skip" | "assignTarget">`, con el mismo patrón `useMemo` de "override gana sobre default global" ya usado para `unresolvableDecisions`.
- La condición de mismatch para una fila (`existing` o `age-unresolvable` con decisión de edad efectiva `"assignTarget"`) se calcula en el cliente comparando `row.sex` contra `categories.find(c => c.id === targetCategoryId)?.sex`, ambos no nulos y distintos.
- El toggle global de sexo solo se muestra si hay al menos una fila en esa condición.
- `RecategorizePreviewTable` recibe `sexMismatchDecisions` y `onSexMismatchDecisionChange` como props nuevas, y renderiza el selector correspondiente (`aria-label={"Decisión de sexo para " + row.tag}`) donde aplique.
- Al confirmar, se arma `sexMismatchDecisions` resolviendo cada fila en alcance a su valor efectivo, igual que ya se hace con `unresolvableDecisions`.

## Validaciones y casos borde

- Un animal sin sexo cargado nunca dispara esta pregunta (ni para "existing" ni para "age-unresolvable"), consistente con la regla de mismatch.
- Una categoría destino sin sexo definido (aplica a ambos) nunca dispara esta pregunta.
- El botón "Confirmar" considera una fila como confirmable solo si, tras resolver todas sus decisiones aplicables (edad y/o sexo), termina generando un cambio real.

## Testing

- **Vitest** (`recategorize-confirm.test.ts`): fila `existing` con sexo distinto al de la categoría destino y decisión `"skip"` no genera evento; con `"assignTarget"` sí, igual que hoy; fila `existing` sin sexo cargado nunca pregunta y se asigna directo; fila `age-unresolvable` con decisión de edad `"assignTarget"` y mismatch de sexo respeta la segunda decisión; el sexo usado para el chequeo se re-deriva de la base y no del valor que mande el cliente en la fila (mismo criterio de seguridad que el resto de `confirmRecategorizeBatch`).
- **Vitest** (`recategorize-form.test.tsx`): aparece el segundo toggle global solo cuando corresponde; el selector por fila permite overridear el default global sin afectar otras filas; una fila `age-unresolvable` con ambas decisiones renderiza los dos selectores.

## Fuera de alcance de este spec

Filas `age-resolved` (no aplica, imposible por construcción). Cambios a `resolveCategoryForAge` o a la lógica del cron de auto-recategorización. Cualquier validación de sexo fuera del flujo de recategorización manual.
