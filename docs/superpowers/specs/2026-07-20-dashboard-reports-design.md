# Diseño: Dashboard y Reportes Básicos — Sistema de trazabilidad de ganado

**Fecha:** 2026-07-20
**Estado:** Aprobado, pendiente de plan de implementación
**Sub-proyecto:** definición de la vista principal del sistema tras el login (`/dashboard`). Depende del esquema de base de datos y del app shell definidos en `docs/superpowers/specs/2026-07-20-frontend-auth-shell-design-v2.md`.

## Contexto

Se define la primera iteración de la vista `/dashboard`. El enfoque se mantiene minimalista: una visualización rápida del estado del establecimiento activo. El diseño está optimizado para web de escritorio, consistente con la decisión desktop-first de `frontend-auth-shell-design-v2`.

## Origen de los datos

Ambas gráficas se alimentan exclusivamente de la vista materializada `animal_current_state`, aplicando los siguientes filtros obligatorios:

- `current_farm_id` debe coincidir con el campo seleccionado en la sesión (leído de la cookie `active_farm_id`).
- `status = 'alive'` para contabilizar únicamente las existencias actuales, excluyendo animales vendidos o muertos.

## Visualizaciones definidas

### 1. Stock actual por potrero

- **Objetivo:** visualizar la distribución física de la carga animal dentro del establecimiento.
- **Métrica:** conteo total de animales agrupados por `current_paddock_id` (JOIN con `paddock` para obtener el nombre).
- **UI recomendada:** gráfico de barras horizontales — óptimo para nombres de potreros potencialmente largos en pantallas de escritorio.
- **Caso borde:** animales cuyo `current_paddock_id` sea nulo se agrupan bajo la etiqueta "Sin potrero asignado".

### 2. Existencias por categoría

- **Objetivo:** entender la composición demográfica del rodeo (ej. proporción de terneros, novillos, vacas).
- **Métrica:** conteo total de animales agrupados por `current_category_id` (JOIN con `category` para obtener el nombre).
- **UI recomendada:** gráfico de torta (pie chart) o gráfico de barras verticales.
- **Caso borde:** animales ingresados sin categoría inicial se agrupan bajo la etiqueta "Sin categoría".

## Implementación técnica

- **Componentes:** gráficos integrados de shadcn/ui (sobre Recharts), para mantener consistencia estética con el resto de la interfaz.
- **Carga de datos:** con Next.js App Router, el dashboard es un React Server Component (RSC). Las consultas SQL (vía el ORM seleccionado — ver `frontend-auth-shell-design-v2`) se ejecutan en el servidor, devolviendo únicamente los conteos finales agrupados al cliente para renderizar las gráficas.

## Fuera de alcance de este spec

Reportes adicionales (sanidades pendientes, historial por caravana), filtros interactivos, exportación de reportes — son specs separados, a definir después.
