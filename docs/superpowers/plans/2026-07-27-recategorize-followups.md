# Pendientes — Recategorización manual (edad + sexo)

**Fecha:** 2026-07-27
**Estado:** Anotado para más adelante — ninguno bloquea el uso normal de la actividad.
**Contexto:** surgieron como hallazgos "Minor" en las revisiones finales de [`2026-07-27-manual-recategorize-no-farm-select-age-fallback-design.md`](../specs/2026-07-27-manual-recategorize-no-farm-select-age-fallback-design.md) y [`2026-07-27-manual-recategorize-sex-mismatch-design.md`](../specs/2026-07-27-manual-recategorize-sex-mismatch-design.md), ya mergeadas a `main`. Se dejaron sin resolver a propósito (severidad menor) pero el usuario pidió que quedaran documentadas.

## Chequeo de sexo (más relevantes)

1. **`targetCategoryId` vacío o inválido en confirm.** `confirmRecategorizeBatch` (`web/lib/activities/recategorize.ts`) consulta la categoría destino sin validar que el id venga cargado. Si el usuario vacía el select "Categoría destino" después de subir un lote con filas `age-resolved` (que no necesitan categoría destino para confirmarse), puede llegar a mostrarse un error crudo de Postgres en vez de un mensaje claro.
   - Fix sugerido: en `recategorize.ts`, saltear la consulta a `category` cuando no hay filas `existing`/`age-unresolvable` en el batch, y si la hay, validar `targetCategoryId` antes de la query y tirar un error de dominio claro si no existe.

2. **`sexMismatchDecisions` sin validar en el Server Action.** `confirmRecategorizeBatchAction` (`web/app/(protected)/activities/recategorize/actions.ts`) reenvía el campo tal cual. Un cliente viejo (pestaña abierta desde antes de este cambio) que no mande el campo haría que `recategorize.ts` tire un `TypeError` genérico en vez de asumir "omitir" por defecto.
   - Fix sugerido: `sexMismatchDecisions: input.sexMismatchDecisions ?? {}` en la Server Action.

3. **Override de sexo no se resetea al cambiar la categoría destino.** En `web/components/activities/recategorize-form.tsx`, `sexMismatchOverrides` es independiente del `targetCategoryId` — si el usuario decide algo para una fila con un destino, cambia el destino a otra categoría, la decisión vieja sigue aplicada aunque ya no tenga sentido para el nuevo destino. Se ve reflejado en la tabla (no es un dato oculto), pero conviene limpiarlo.
   - Fix sugerido: en el `onChange` del select de categoría destino, agregar `setSexMismatchOverrides({})` junto al resto del reset.

4. **Falta un test puntual de enmascarado.** El test de `previewRecategorizeBatch` que verifica que las filas fuera de acceso se enmascaran (`web/__tests__/activities/recategorize-actions.test.ts`) no afirma explícitamente que el campo `sex` también desaparece de la fila enmascarada (aunque el código ya lo hace bien, por construcción).
   - Fix sugerido: agregar `expect(rows[1]).not.toHaveProperty("sex")` a ese test.

## Fallback por edad (más de prolijidad/documentación)

5. **Mensaje de error potencialmente engañoso.** `recategorize-resolution.ts` usa un `join` a `animal` que, en un estado de datos técnicamente imposible (violación de integridad referencial), haría que la fila se reporte como "El animal está vendido o muerto" en vez de un mensaje más preciso. No debería poder ocurrir bajo las FKs actuales.

6. **Falta un comentario aclaratorio.** En `recategorize-form.tsx`, `globalUnresolvableDefault` persiste entre cargas de archivo mientras que los overrides por fila sí se resetean — es el comportamiento correcto (preserva la preferencia del usuario), pero no está explicado con un comentario.

7. **Documentar la migración del backfill.** La migración que agregó `event_recategorize.source` (`web/drizzle/0024_heavy_sebastian_shaw.sql`) marcó todo el historial previo como `'initial'` por default — una decisión de negocio (ningún evento viejo bloquea al cron de auto-recategorización por edad) que conviene dejar explícita en un comentario o en las notas de release.

8. **E2E nunca se corrió de verdad.** El test end-to-end de Playwright para el caso "sin edad calculable, elegir 'Asignar destino'" (`web/e2e/recategorize-manual.spec.ts`) se revisó línea por línea contra el código real y da correcto, pero nunca se ejecutó contra una base de test real en este entorno (no había Postgres de test disponible). Hay que correrlo una vez en CI o localmente antes de confiar en él al 100%.

## Fuera de alcance / no vale la pena tocar

- N+1 de queries por fila en `recategorize-resolution.ts` — patrón ya preexistente en el resto de la actividad, no se agravó con estos cambios.
- `key` indexado por posición en `recategorize-preview-table.tsx` — solo sería un problema si en algún momento se agrega orden/sorting a la tabla, cosa que no está planeada.
