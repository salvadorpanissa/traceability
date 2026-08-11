import type { Locale } from "@/lib/i18n/dictionaries";

// The LLM-generated SQL selects columns straight from the my_* reporting
// views (see generate-sql.ts's SCHEMA_DESCRIPTION), so headers arrive as raw
// snake_case column/alias names — this maps the known ones to labels an end
// user recognizes.
const COLUMN_LABELS: Record<string, Record<Locale, string>> = {
  animal_id: { es: "ID animal" },
  current_tag: { es: "Caravana" },
  animal_tag: { es: "Caravana" },
  old_tag: { es: "Caravana anterior" },
  new_tag: { es: "Caravana nueva" },
  current_farm_id: { es: "Campo" },
  farm_id: { es: "Campo" },
  farm_name: { es: "Campo" },
  origin_farm_id: { es: "Campo origen" },
  origin_farm_name: { es: "Campo origen" },
  destination_farm_id: { es: "Campo destino" },
  destination_farm_name: { es: "Campo destino" },
  current_paddock_id: { es: "Potrero" },
  paddock_name: { es: "Potrero" },
  origin_paddock_id: { es: "Potrero origen" },
  origin_paddock_name: { es: "Potrero origen" },
  destination_paddock_id: { es: "Potrero destino" },
  destination_paddock_name: { es: "Potrero destino" },
  current_category_id: { es: "Categoría" },
  category_name: { es: "Categoría" },
  old_category_id: { es: "Categoría anterior" },
  old_category_name: { es: "Categoría anterior" },
  new_category_id: { es: "Categoría nueva" },
  new_category_name: { es: "Categoría nueva" },
  sex: { es: "Sexo" },
  min_age_months: { es: "Edad mínima (meses)" },
  owner_id: { es: "Propietario" },
  owner_name: { es: "Propietario" },
  product_id: { es: "Producto" },
  product_name: { es: "Producto" },
  default_dose_unit: { es: "Unidad por defecto" },
  default_withdrawal_days: { es: "Carencia por defecto (días)" },
  dose: { es: "Dosis" },
  dose_unit: { es: "Unidad" },
  route: { es: "Vía" },
  withdrawal_days: { es: "Carencia (días)" },
  health_notes: { es: "Notas del producto" },
  status: { es: "Estado" },
  event_id: { es: "ID evento" },
  event_date: { es: "Fecha" },
  guide_number: { es: "Guía" },
  buyer: { es: "Comprador" },
  price: { es: "Precio" },
  weight_kg: { es: "Peso (kg)" },
  cause: { es: "Causa" },
  notes: { es: "Notas" },
  created_at: { es: "Creado" },
  id: { es: "ID" },
  name: { es: "Nombre" },
};

function humanize(column: string): string {
  return column
    .split("_")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function friendlyColumnLabel(column: string, locale: Locale): string {
  return COLUMN_LABELS[column]?.[locale] ?? humanize(column);
}
