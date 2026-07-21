# Diseño: Login y estructura base del frontend (v2) — Sistema de trazabilidad de ganado

**Fecha:** 2026-07-20
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** estructura base del frontend. **Reemplaza a** `docs/superpowers/specs/2026-07-19-frontend-auth-shell-design.md` (ver nota de migración en ese archivo). Actualizado para la migración de Supabase a base de datos Postgres local, Auth.js, y enfoque web/desktop.

## Contexto

Se decide salir de Supabase hacia una base de datos Postgres local. El frontend pasa a asumir la responsabilidad de la gestión de sesiones y de la validación de permisos de acceso a datos (Data Access Layer), reemplazando el Row Level Security (RLS) previo, que dependía de políticas de Supabase/Postgres ligadas a `auth.uid()`.

Además, se confirma **desktop-first**: la prioridad pasa a ser la visualización de tablas densas y formularios complejos en pantallas grandes. El uso desde el celular en el campo (prioridad original del contexto del proyecto) deja de ser el driver de diseño inmediato.

## Decisiones de arquitectura y stack

- **Framework:** Next.js (App Router).
- **UI y estilos:** Tailwind CSS + shadcn/ui. Diseñado como aplicación web de escritorio.
- **Autenticación:** Auth.js (NextAuth) con Credentials Provider (email y contraseña).
- **ORM:** Prisma o Drizzle para la conexión directa a la base de datos local desde los Server Actions.

## Autenticación y seguridad

- **Sin auto-registro:** las cuentas las crea un administrador.
- **Middleware:** `middleware.ts` protege todas las rutas salvo `/login`. Redirige almacenando la ruta original en `returnTo`.
- **Seguridad a nivel de aplicación (DAL):** al no contar con RLS en el Postgres local, cada Server Action debe verificar la sesión y los permisos de acceso a los campos (`user_farm`, o si es admin) antes de ejecutar consultas a la base de datos. Esto reemplaza la capa de RLS que enforzaban los specs de esquema anteriores (ver nota de migración en `2026-07-18-database-schema-design.md`, `2026-07-20-paddocks-schema-design.md` y `2026-07-20-activity-loading-design.md`).
- **Errores genéricos:** el formulario de login arroja mensajes genéricos en caso de fallo, para no revelar si el email existe.

## Manejo de estado: campo activo

- El establecimiento activo se almacena en una cookie `active_farm_id`.
- Si el usuario tiene un solo campo asignado, el sistema setea la cookie automáticamente post-login.
- Si tiene varios, se le solicita elegir mediante la ruta `/select-farm`.

## Pantallas y rutas principales

- **`/login`** — formulario de ingreso (email + contraseña). Server Action para autenticar vía Auth.js.
- **`/select-farm`** — interfaz para elegir el campo de trabajo si el usuario tiene múltiples opciones asignadas.
- **`layout.tsx`** (app shell) — navegación principal adaptada para aplicación web: barra superior mostrando el campo activo, botón de cambio de campo, y menú de usuario.
- **`/dashboard`** — vista principal donde se integran los reportes (ver `2026-07-20-dashboard-reports-design.md`) y, más adelante, los módulos de carga masiva de lotes.

## Fuera de alcance de este spec

Alta de usuarios, pantalla de selección de lote + acción, módulo de chat con Claude, y el plan concreto de migración de datos existentes de Supabase a Postgres local (tablas, RLS → DAL, autenticación) — son specs/planes separados, a definir después.
