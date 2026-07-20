# Diseño: Login y estructura base del frontend — Sistema de trazabilidad de ganado

**Fecha:** 2026-07-19
**Estado:** **Superseded** por `docs/superpowers/specs/2026-07-20-frontend-auth-shell-design-v2.md` (2026-07-20) — se decidió migrar de Supabase (`@supabase/ssr`, RLS) a Postgres local + Auth.js, y el enfoque pasó de mobile-first a desktop-first. Este documento queda como referencia histórica; no usar como fuente vigente.
**Sub-proyecto:** primer spec de frontend. Depende del esquema de base de datos (`docs/superpowers/specs/2026-07-18-database-schema-design.md`, ya implementado en la rama `feature/database-schema`). Le siguen, como specs separados: alta de usuarios (admin crea encargados), pantalla de selección de lote + acción, y el módulo de chat con Claude (pausado hasta resolver la cuenta de API).

## Contexto

Con el esquema de base de datos y RLS ya implementados, hace falta la base del frontend: login y la estructura de navegación sobre la que se van a colgar las demás pantallas (selección de lote, chat, reportes). Sin esto no hay dónde probar ni construir nada más.

## Decisiones de arquitectura

### Stack

- **Next.js (App Router)**, mismo proyecto que va a alojar más adelante el módulo de chat con Claude.
- **Tailwind CSS + shadcn/ui** para estilos y componentes — mobile-first, consistente con la prioridad de uso desde el campo.
- **`@supabase/ssr`** para la sesión (cookies httpOnly), en vez de manejar tokens a mano.

### Autenticación

- **Email + contraseña** (no magic link) — el usuario ya tiene sus credenciales guardadas, no depende de que le llegue un email justo cuando quiere entrar con mala conectividad.
- **No hay auto-registro.** Las cuentas las crea un admin. Cómo se hace ese alta (UI, o a mano desde el dashboard de Supabase mientras tanto) es un spec aparte — este spec asume que las cuentas ya existen.
- **`middleware.ts`** protege todas las rutas salvo `/login`: sin sesión válida, redirige a `/login?returnTo=<ruta original>`, así después de loguearse vuelve adonde estaba.
- Error de credenciales inválidas: mensaje genérico en español ("email o contraseña incorrectos"), nunca se filtra si el email existe.

### Campo activo

- Después del login se lee `user_account.role_id` (join a `role`) y `user_farm` para saber qué campos tiene asociados el usuario. Para `admin`, la lista sale de `farm` completa sin filtrar (la RLS ya se encarga, no se duplica esa lógica en el frontend).
- El campo elegido se guarda en una **cookie** `active_farm_id` (no en la URL): es un dato de sesión ("qué campo estoy mirando ahora"), no un recurso direccionable. Cambiar de campo desde el nav solo reescribe la cookie y refresca los datos.
- Si el usuario tiene un único campo asociado, se saltea la elección: la cookie se setea automáticamente server-side en el primer request post-login.
- **Caso borde:** un `manager` sin ningún campo asignado ve una pantalla explícita ("no tenés campos asignados, contactá al administrador") en vez de un dashboard vacío o un error de RLS crudo.

## Pantallas y rutas

- **`/login`** — formulario email + contraseña. Server Action que llama `supabase.auth.signInWithPassword`; error inline, sin redirigir.
- **`/select-farm`** — solo se muestra si el usuario tiene más de un campo asociado (o es admin). Al elegir uno, setea `active_farm_id` y redirige a `/dashboard`.
- **`/dashboard`** — placeholder: nombre del campo activo, rol del usuario, y el layout de navegación. El contenido real (stock, sanidades pendientes) es un spec de reportes aparte, fuera de alcance acá.
- **`layout.tsx`** (app shell) — barra superior con el campo activo + botón para cambiarlo (vuelve a `/select-farm`), menú de usuario con logout, nav mobile-first con los links a las secciones que se vayan agregando.

## Testing

- **Componentes** (formulario de login, selector de campo): Vitest + Testing Library — validación de inputs, estados de error, que se dispare la acción correcta.
- **E2E** (Playwright): flujo completo login → selección de campo (o skip automático si tiene un solo campo) → dashboard → logout, corriendo contra el Supabase local ya configurado (mismo stack que los tests de esquema) en vez de mockear la autenticación.
- No hace falta testear contenido de reportes/analytics — el dashboard es placeholder en este spec.

## Fuera de alcance de este spec

Alta de usuarios (pantalla donde el admin crea encargados y les asigna campo), pantalla de selección de lote + acción, módulo de chat con Claude, y cualquier contenido real de dashboard/reportes — son specs separados, a definir después.
