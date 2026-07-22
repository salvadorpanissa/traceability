# Diseño: Registro DICOSE y detección de caravanas ajenas

**Fecha:** 2026-07-22
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** primera parte de un proyecto de dos etapas (ver `Fuera de alcance`). Modifica la lógica central de resolución de lotes (`web/lib/activities/batch-resolution.ts`), usada hoy por traslado y sanidad, y sienta la base de datos para la futura actividad de "recuento".

## Contexto

Hoy, cuando una actividad (traslado, sanidad) lee una caravana que no está en el historial del sistema (`animal_tag_history`), el sistema la trata automáticamente como un **alta nueva propia** — no existe ningún chequeo de si esa caravana pertenece realmente a la operación o es de un animal ajeno (de un vecino, por ejemplo) que se coló en el lote leído en el campo.

Además, la operación real tiene una estructura más rica de lo que el modelo de datos actual captura: existen **dos razones sociales** que operan en simultáneo (AIP — Antonio I. Panissa e Hijos, y SASG — San Antonio Soc. Ganadera), y cada una tiene un **DICOSE** (código de registro oficial ante las autoridades uruguayas) distinto **por campo físico** en el que opera. Un mismo campo puede tener DICOSE de ambas razones sociales (ej. campo "San Antonio": AIP y SASG tienen DICOSE propio ahí), o de una sola, con la otra pastando ahí sin DICOSE propio en ese campo ("a pastoreo" — ej. campo "Cuatro Cerros", arrendado por AIP, donde SASG no tiene registro).

## Modelo de datos

### `owner` (existente, sin cambios de estructura)

AIP y SASG se cargan como dos filas más en la tabla `owner` que ya existe — la misma tabla que hoy representa el propietario de un animal individual (por ejemplo, de un tercero cuyos animales se cuidan). No se introduce un concepto separado de "empresa"; para este sistema, una razón social es simplemente un tipo más de propietario.

### `dicose_registration` (nueva)

- `id`, `owner_id` (FK a `owner`), `farm_id` (FK a `farm`), `dicose_code` (texto).
- Una fila por cada combinación dueño+campo que tenga DICOSE propio. Ejemplo con los datos reales discutidos: AIP–San Antonio–151400442, SASG–San Antonio–151422799, AIP–Cuatro Cerros–151518192.
- El caso "a pastoreo" (SASG en Cuatro Cerros) **no tiene fila** en esta tabla — no se modela como un estado especial; se resuelve exclusivamente con la advertencia de campo incorrecto descrita más abajo, sin necesidad de una tabla de autorizaciones de pastoreo aparte. Esto es una simplificación deliberada: en vez de mantener una lista de qué combinaciones dueño-campo están "permitidas sin DICOSE", cualquier caravana propia leída en un campo que no coincide con su DICOSE simplemente se advierte, y el encargado de campo — que conoce el contexto real — decide si es un pastoreo esperado o algo a investigar.
- Catálogo global (como `category`/`product`/`owner`), gestionable por cualquier usuario logueado, sin restricción de rol ni de campo.

### `own_tag` (nueva)

- `tag` (único), `dicose_registration_id` (FK a `dicose_registration`), `created_by`, `created_at`.
- Cada caravana propia queda asociada a un registro DICOSE específico — de ahí se derivan tanto el dueño como el campo "correcto" de esa caravana al usarla.
- Se carga por Excel de una sola columna (el número de caravana), asociado a un `dicose_registration` elegido antes de subir el archivo. Cargas sucesivas **suman** al registro existente; duplicados (dentro del mismo archivo, o ya cargados antes) se ignoran sin error. Filas con formato no numérico se descartan sin bloquear el resto del archivo, informando un conteo de filas inválidas ignoradas.

## Cambios en `resolveBatchRows`

Sin cambios para caravanas ya encontradas en `animal_tag_history` (siguen siendo `"existing"` como hoy). Para una caravana **no** encontrada ahí:

1. Se busca en `own_tag`.
   - **No aparece** → nuevo estado `"foreign"` (caravana de un tercero real). Se excluye del lote por defecto.
   - **Aparece** → se compara el `farm_id` de su `dicose_registration` contra el campo donde se está cargando el lote (`operatingFarmId`):
     - **Coincide** → `"new"`, con el `ownerId` **inferido automáticamente** desde el `owner_id` del registro DICOSE — ya no se depende de la columna de texto libre "propietario" del Excel de la actividad para este caso. Esa columna queda como respaldo únicamente para caravanas `"foreign"` que el usuario decide forzar como propias (ver abajo).
     - **No coincide** → nuevo estado `"wrong_farm"`: se incluye igual en el lote (con el dueño ya inferido desde el DICOSE), pero se marca visualmente para que el encargado la note — es el caso típico de un animal a pastoreo.

El chequeo contra `own_tag` se hace una sola vez por lote al principio de `resolveBatchRows` (mismo patrón que ya existe para categorías y propietarios), no fila por fila.

## Confirmación del lote (`confirmHealthBatchAction`/`confirmTransferBatchAction`)

- `"foreign"` sin forzar → excluida silenciosamente, no genera animal ni evento.
- `"foreign"` forzada por el usuario ("es mía de todos modos", fila por fila, reversible antes de confirmar) → se da de alta igual que una fila `"new"` hoy, usando la columna `ownerName` del Excel si vino, o sin dueño si no.
- `"new"` y `"wrong_farm"` → ambas se incluyen en la confirmación sin excepción; `"wrong_farm"` lleva únicamente el aviso visual, nunca bloquea.
- Si tras excluir las `"foreign"` no forzadas no queda ninguna fila `"new"`/`"existing"`/`"wrong_farm"`/`"foreign"` forzada, el botón de confirmar queda deshabilitado (no tiene sentido confirmar un lote vacío).

## UI

- **Administración de DICOSE** (`/settings/dicose`): lista de registros dueño+campo+código + formulario para agregar uno nuevo. Disponible para cualquier usuario logueado, sin restricción de rol.
- **Carga de caravanas propias** (`/settings/own-tags` o similar): selector del registro DICOSE al que pertenece el lote a cargar, seguido de la subida del Excel (una columna, sin pantalla de mapeo de columnas). Muestra un contador de cuántas caravanas hay cargadas por cada DICOSE y la fecha de la última carga — no se listan las caravanas individualmente (no aporta valor ver miles de filas).
- **Previsualización de actividades** (traslado y sanidad): tres tratamientos visuales distintos junto a los ya existentes (`"existing"`, `"error"`):
  - `"foreign"` — etiqueta "Ajena", excluida por defecto, checkbox "Es mía de todos modos".
  - `"wrong_farm"` — incluida por defecto, con aviso visible (ej. "⚠ Caravana de [dueño], registrada en [campo real] — verificar pastoreo").
  - Resumen agregado antes de confirmar: conteo de filas ajenas sin resolver y de filas en campo incorrecto.

## Manejo de errores y casos borde

- Excel de carga de caravanas con filas vacías, duplicadas (mismo archivo o contra el registro existente), o con formato no numérico: se ignoran/descartan sin bloquear la carga del resto, informando los conteos correspondientes.
- Lote de actividad con todas las filas `"foreign"` sin forzar: se permite ver el aviso, pero el botón de confirmar queda deshabilitado hasta que quede al menos una fila válida.
- El checkbox "es mía de todos modos" es reversible antes de confirmar.

## Testing

- **Unit — `resolveBatchRows`**: caravana en `own_tag` con DICOSE del campo correcto (→ `"new"`, dueño inferido correctamente); caravana en `own_tag` con DICOSE de otro campo (→ `"wrong_farm"`, dueño igual inferido); caravana ausente de `own_tag` (→ `"foreign"`); caravana ya existente en `animal_tag_history` (→ sigue `"existing"`, el chequeo de ajeno no aplica).
- **Integration — alta de `dicose_registration`** y **carga de Excel de `own_tag`**: inserta nuevas, ignora duplicados y filas inválidas, devuelve los conteos.
- **Integration — `confirmHealthBatchAction`/`confirmTransferBatchAction`**: una fila `"foreign"` sin forzar no genera nada; una fila `"foreign"` forzada sí genera el alta; una fila `"wrong_farm"` se confirma con el dueño correcto sin necesitar acción del usuario.
- **Component — previsualización**: los tres estados (`"foreign"`, `"wrong_farm"`, y los existentes) se ven visualmente distintos; el checkbox de "foreign" cambia el estado y se refleja en lo que se envía a confirmar.
- **E2E**: cargar dos registros DICOSE (mismo dueño, distinto campo, o dos dueños en el mismo campo) y sus caravanas, correr un lote de traslado en un campo con una caravana de cada tipo (propia normal, ajena, campo incorrecto), confirmar que el resultado final es el esperado en los tres casos.

## Fuera de alcance de este spec

- La nueva actividad de **"recuento"** (conteo físico de animales por potrero, para reconciliar contra el estado que el sistema cree tener) — sub-proyecto siguiente, que se apoya en esta base (usa el mismo concepto de `"foreign"`/`"wrong_farm"` durante el conteo).
- Generación de documentación oficial DICOSE/guías de traslado a partir de estos registros (ya señalado como pendiente no bloqueante en `docs/contexto-proyecto-trazabilidad-ganado.md`).
- Aprendizaje automático de correcciones manuales: si el usuario fuerza una caravana "foreign" como propia, esa decisión no se persiste como excepción — si la misma caravana aparece de nuevo sin haberse cargado en `own_tag`, se vuelve a marcar `"foreign"`.
- Un tercer estado o tabla de "autorizaciones de pastoreo" explícitas — el caso de pastoreo se resuelve con la advertencia de `"wrong_farm"`, sin necesidad de una lista separada de combinaciones dueño-campo permitidas sin DICOSE.
