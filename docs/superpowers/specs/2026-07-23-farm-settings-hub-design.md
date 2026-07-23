# Diseño: Configuración del campo (hub centralizado + CRUD de catálogos)

**Fecha:** 2026-07-23
**Estado:** Aprobado, pendiente de plan de implementación

## Contexto

Hoy existen dos pantallas de configuración (`/settings/dicose` y `/settings/own-tags`) que no están relacionadas entre sí en la navegación: DICOSE no aparece en ningún menú, y "Registrar caravanas propias" está mezclado en la barra de navegación principal junto con las actividades del día a día (Sanidades, Traslados). Además, tres catálogos que ya existen en el modelo de datos — `product`, `category`, `paddock` — tienen únicamente alta (`create`) y lectura (`list`) en el DAL, sin pantalla propia ni forma de editarlos.

Esta spec centraliza toda la configuración administrativa del campo (DICOSE, caravanas propias, productos, potreros, categorías) detrás de un único punto de entrada en el header, y completa el CRUD de los tres catálogos que faltaban.

## Navegación

- El botón de usuario en el header (`components/app-shell.tsx`), que hoy solo despliega "Cerrar sesión", pasa a tener dos ítems:
  1. **"Configuración del campo"** (nuevo) → navega a `/settings`.
  2. **"Cerrar sesión"** (existente, sin cambios de comportamiento).
- Se elimina la entrada `"/settings/own-tags"` de `navItems` en `app-shell.tsx` (barra superior) — deja de estar duplicada, vive únicamente dentro de `/settings`.
- El botón de engranaje (`SettingsMenu`, idioma/tema) no cambia — es un menú distinto, de preferencias de la app, no de configuración del campo.

## Layout `/settings`

Nuevo `app/(protected)/settings/layout.tsx` con menú lateral (sidebar) que lista las secciones y envuelve las páginas existentes/nuevas:

- DICOSE → `/settings/dicose` (existente, sin cambios funcionales)
- Caravanas propias → `/settings/own-tags` (existente, sin cambios funcionales)
- Productos → `/settings/products` (nueva)
- Potreros → `/settings/paddocks` (nueva)
- Categorías → `/settings/categories` (nueva)

En desktop el sidebar es persistente a la izquierda; en mobile colapsa detrás de un botón/desplegable, siguiendo el mismo patrón responsive que ya usa `app-shell.tsx` para su nav (`isMobileNavOpen`).

Cada sección resalta como activa según el pathname, igual que `navItems` en el header hoy.

## DAL: completar CRUD de catálogos

Se agrega una función `update*` a cada catálogo existente, análoga a las `create*` que ya están:

- `lib/dal/product-catalog.ts`: `updateProduct(id, { name, defaultDoseUnit, defaultWithdrawalDays })`.
- `lib/dal/category-catalog.ts`: `updateCategory(id, { name, sortOrder })`.
- `lib/dal/paddock-catalog.ts`: `updatePaddock(id, { name })` (el `farmId` de un potrero no se reasigna desde esta pantalla — si cambia de campo, se borra y se crea de nuevo; evita mover potreros entre campos sin querer).

`list*` y `create*` no cambian. No se agrega `delete` — no lo pidió el usuario y no hay caso de uso claro todavía (los catálogos son referenciados por otras tablas).

## Páginas nuevas

Las tres siguen el mismo patrón que ya usa `dicose-registration-form.tsx`: tabla de filas existentes (server component, datos cargados en la `page.tsx`) + formulario de alta debajo, todo dentro de un componente cliente. Se agrega edición en línea: un botón "Editar" por fila convierte esa fila en inputs, con "Guardar"/"Cancelar"; al guardar llama a una server action `update*Action` y actualiza el estado local, igual que el alta ya hace con `create*Action`.

### Productos (`/settings/products`)

- Columnas: nombre, unidad de dosis por defecto (`defaultDoseUnit`), días de retiro por defecto (`defaultWithdrawalDays`).
- Alta: nombre (requerido), unidad de dosis (texto libre, opcional), días de retiro (numérico, opcional).
- `components/settings/product-catalog-form.tsx` + `app/(protected)/settings/products/{page.tsx,actions.ts}`.

### Potreros (`/settings/paddocks`)

- Como `paddock` es por campo (`farmId`), el formulario de alta incluye un selector de Campo (reutiliza `listFarms` ya existente en `settings/dicose/actions.ts`, se mueve a un lugar compartido o se reexporta) + nombre del potrero. Si el usuario solo tiene un campo asociado, se preselecciona y el selector puede mostrarse igual pero deshabilitado (mismo campo único).
- La tabla lista potreros de todos los campos del usuario, agrupados o con columna "Campo" visible, para distinguirlos.
- `components/settings/paddock-catalog-form.tsx` + `app/(protected)/settings/paddocks/{page.tsx,actions.ts}`.

### Categorías (`/settings/categories`)

- Columnas: nombre, orden (`sortOrder`, numérico — determina el orden de aparición en reportes/dashboard).
- Alta: nombre (requerido), orden (numérico, default siguiente entero disponible).
- `components/settings/category-catalog-form.tsx` + `app/(protected)/settings/categories/{page.tsx,actions.ts}`.

## i18n

Se agregan claves nuevas a `lib/i18n/dictionaries.ts` (es/en) para: ítem de menú "Configuración del campo", títulos de sección del sidebar (Productos, Potreros, Categorías — DICOSE y Caravanas ya tienen clave `appShell.navDicose`/`appShell.navRegisterTags`, se reutilizan como títulos de sección aunque ya no estén en la barra superior), labels de columnas y botones ("Editar", "Guardar", "Cancelar") de las tres pantallas nuevas.

## Permisos

Sin restricción de rol — igual que DICOSE y caravanas propias hoy, cualquier usuario logueado puede ver y administrar estos catálogos. Los potreros se filtran por los campos del usuario (vía `userFarmIds`, mismo mecanismo que ya usa `dicose-registration.ts`); productos y categorías son globales, visibles para todos.

## Manejo de errores y casos borde

- Alta con nombre duplicado (`product.name`, `category.name` son `unique`; `paddock` es único por `farmId`+`name`): la constraint de base de datos rechaza el insert; la action captura el error y devuelve un mensaje "Ya existe un [producto/categoría/potrero] con ese nombre" sin romper el formulario.
- Edición que deja el nombre vacío: se bloquea en el cliente (botón "Guardar" deshabilitado) antes de llamar a la action, mismo patrón que ya usa el alta (`disabled={!campo}`).
- Potrero: si el usuario no tiene ningún campo asociado, el selector de campo queda vacío y el formulario de alta se deshabilita con un mensaje ("No tenés campos asociados").

## Testing

- **Unit — DAL**: `updateProduct`/`updateCategory`/`updatePaddock` actualizan los campos esperados y devuelven la fila actualizada.
- **Integration — actions**: alta y edición de cada catálogo vía server action, incluyendo el caso de nombre duplicado (rechazo con mensaje, no excepción no controlada).
- **Component — formularios**: alta agrega una fila a la tabla local; "Editar" → "Guardar" actualiza la fila mostrada; "Cancelar" descarta cambios sin llamar a la action.
- **E2E**: desde el header, abrir "Configuración del campo", navegar por el sidebar a Productos/Potreros/Categorías, dar de alta uno de cada uno, editarlo, y confirmar que persiste tras recargar la página.

## Fuera de alcance de este spec

- Borrado (`delete`) de productos, potreros o categorías.
- Reasignar el `farmId` de un potrero existente desde la UI.
- Cualquier restricción de rol/permiso sobre estas pantallas (todas quedan abiertas a cualquier usuario logueado, como ya es el caso de DICOSE/caravanas).
- Cambios al modelo de datos — las tres tablas (`product`, `category`, `paddock`) ya existen tal cual se necesitan.
