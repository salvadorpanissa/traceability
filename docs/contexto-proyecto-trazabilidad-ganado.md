# Contexto del proyecto: Sistema de trazabilidad de ganado

## Resumen

Empresa ganadera en **Uruguay**, con **varios campos** y **miles de animales**, necesita reemplazar su sistema actual de gestión de trazabilidad. Uso **interno de la empresa** (no requiere integración obligatoria con organismos oficiales como MGAP/SNIG desde el inicio, aunque conviene dejar el modelo compatible a futuro).

## Situación actual

- Usaban una herramienta de terceros que quedó **deprecada** → se arranca de cero.
- El flujo actual es manual: cargan un Excel con las caravanas (identificación de los animales) y agregan a mano la sanidad u otra actividad realizada sobre ese lote.
- Este proceso no escala, es propenso a error humano y no deja un historial confiable/auditable.

## Procesos que el sistema debe automatizar

1. **Traslados** — movimiento de animales entre campos
2. **Sanidades** — tratamientos, vacunaciones, controles sanitarios
3. **Recaravaneo** — reemplazo de la caravana (identificador físico) de un animal, manteniendo su historial
4. **Recategorización** — cambio de categoría del animal (ej. ternero → novillo, vaquillona → vaca, etc.)
5. **Ventas** — salida de animales del stock

Todas estas operaciones se realizan hoy **por lote** (un grupo de animales a la vez), no animal por animal — el sistema debe estar optimizado para eso.

## Decisiones de arquitectura ya tomadas

### Modelo de datos: animal + historial de eventos (event log)

- **No** guardar el estado del animal como campos sueltos que hay que mantener sincronizados a mano.
- En cambio: cada animal tiene un historial inmutable de eventos (`traslado`, `sanidad`, `recaravaneo`, `recategorizacion`, `venta`), cada uno con fecha, lote afectado, usuario que lo cargó, y datos específicos del tipo de evento.
- El estado actual del animal (campo, categoría, caravana activa) se **deriva** del último evento de cada tipo — nunca se edita directamente, evitando desincronización.
- Correcciones se hacen con un evento de corrección, no editando/borrando historial (trazabilidad auditable).

### Entidades principales (borrador, a refinar)

- `Animal` (caravana activa, campo actual, categoría actual, estado: vivo/vendido/muerto)
- `Campo` (establecimiento)
- `Lote` (agrupación de animales sobre la que se aplica una acción masiva)
- `Evento` (tabla central: tipo, fecha, animal(es) o lote afectado, campo origen/destino según tipo, usuario, payload específico por tipo)
- `Usuario` (con rol y campo(s) asociados)

### Roles y permisos

- Encargado de campo: ve y carga solo su(s) campo(s)
- Administrador: ve todos los campos, puede hacer traslados entre ellos

### Carga de datos

- Se mantiene la carga por Excel como método de **importación masiva** (ej. alta de un rodeo nuevo), pero validada contra la base antes de aplicar — no como fuente de verdad.
- Operación típica: seleccionar un lote (por campo, categoría, o lista de caravanas) → elegir la acción → aplicar una vez → el sistema genera un evento por cada animal del lote.
- Prioridad de UX: cargar un lote debe tomar segundos.
- Conectividad en campo puede ser mala → considerar soporte offline / sincronización diferida más adelante.

## Decisión de stack técnico

> **Actualizado 2026-07-20:** se confirmó la migración fuera de Supabase (ver `docs/superpowers/specs/2026-07-20-frontend-auth-shell-design-v2.md`). El esquema de datos y el modelo de eventos (SQL estándar) siguen vigentes sin cambios — lo que cambia es la capa de auth/RLS y el enfoque de UI.

- **Backend + base de datos: Postgres local**, con Prisma o Drizzle como ORM desde Server Actions de Next.js.
  - El esquema se mantuvo en SQL estándar desde el inicio (decisión original), por lo que la migración de datos vía `pg_dump`/`pg_restore` desde Supabase es viable.
  - Lo que sí cambió respecto a Supabase: la autenticación (ahora Auth.js/NextAuth con Credentials Provider) y el control de acceso (RLS reemplazado por un Data Access Layer que verifica sesión y campos asignados en cada Server Action).
- **Frontend:** Next.js (App Router) + Tailwind + shadcn/ui, **desktop-first** — prioriza tablas densas y formularios complejos en pantallas grandes. El uso desde el celular en el campo (prioridad original) queda de lado por ahora.
- **Hosting:** proveedor simple tipo Vercel/Railway para el frontend/backend liviano.

## Nota pendiente (no bloqueante)

En Uruguay, el MGAP/SNIG exige DICOSE y guías de traslado para movimientos de animales entre establecimientos. Aunque el sistema es interno, conviene que el evento de "traslado" tenga desde el diseño los campos necesarios (RUC/DICOSE origen-destino, fecha, cantidad) para eventualmente generar esa documentación sin rediseñar el modelo.

## Próximos pasos

1. Diseñar el esquema completo de tablas en SQL (Postgres/Supabase): `Animal`, `Campo`, `Lote`, `Evento` (con sus variantes por tipo), `Usuario`, roles y RLS.
2. Definir el payload específico de cada tipo de evento (qué datos captura sanidad vs. traslado vs. recaravaneo vs. recategorización vs. venta).
3. Prototipar el flujo de carga por lote (selección de animales/lote + acción + validación + generación de eventos).
4. Prototipar reportes básicos: stock actual por campo/categoría, historial por caravana, sanidades pendientes.
5. Definir estrategia de importación/validación de Excel contra la base existente.

---
*Este documento resume el contexto acordado en la conversación previa con Claude (chat), para continuar el desarrollo técnico en Claude Code.*
