import type { Locale } from "@/lib/i18n/dictionaries";

// The LLM-generated SQL selects columns straight from the my_* reporting
// views (see generate-sql.ts's SCHEMA_DESCRIPTION), so headers arrive as raw
// snake_case column/alias names — this maps the known ones to labels an end
// user recognizes, in whichever locale the dashboard is showing.
const COLUMN_LABELS: Record<string, Record<Locale, string>> = {
  animal_id: { es: "ID animal", en: "Animal ID" },
  current_tag: { es: "Caravana", en: "Tag" },
  animal_tag: { es: "Caravana", en: "Tag" },
  old_tag: { es: "Caravana anterior", en: "Previous tag" },
  new_tag: { es: "Caravana nueva", en: "New tag" },
  current_farm_id: { es: "Campo", en: "Farm" },
  farm_id: { es: "Campo", en: "Farm" },
  farm_name: { es: "Campo", en: "Farm" },
  origin_farm_id: { es: "Campo origen", en: "Origin farm" },
  origin_farm_name: { es: "Campo origen", en: "Origin farm" },
  destination_farm_id: { es: "Campo destino", en: "Destination farm" },
  destination_farm_name: { es: "Campo destino", en: "Destination farm" },
  current_paddock_id: { es: "Potrero", en: "Paddock" },
  paddock_name: { es: "Potrero", en: "Paddock" },
  origin_paddock_id: { es: "Potrero origen", en: "Origin paddock" },
  origin_paddock_name: { es: "Potrero origen", en: "Origin paddock" },
  destination_paddock_id: { es: "Potrero destino", en: "Destination paddock" },
  destination_paddock_name: { es: "Potrero destino", en: "Destination paddock" },
  current_category_id: { es: "Categoría", en: "Category" },
  category_name: { es: "Categoría", en: "Category" },
  old_category_id: { es: "Categoría anterior", en: "Previous category" },
  old_category_name: { es: "Categoría anterior", en: "Previous category" },
  new_category_id: { es: "Categoría nueva", en: "New category" },
  new_category_name: { es: "Categoría nueva", en: "New category" },
  sort_order: { es: "Orden", en: "Order" },
  owner_id: { es: "Propietario", en: "Owner" },
  owner_name: { es: "Propietario", en: "Owner" },
  product_id: { es: "Producto", en: "Product" },
  product_name: { es: "Producto", en: "Product" },
  default_dose_unit: { es: "Unidad por defecto", en: "Default unit" },
  default_withdrawal_days: { es: "Carencia por defecto (días)", en: "Default withdrawal (days)" },
  dose: { es: "Dosis", en: "Dose" },
  dose_unit: { es: "Unidad", en: "Unit" },
  route: { es: "Vía", en: "Route" },
  withdrawal_days: { es: "Carencia (días)", en: "Withdrawal (days)" },
  health_notes: { es: "Notas del producto", en: "Product notes" },
  status: { es: "Estado", en: "Status" },
  event_id: { es: "ID evento", en: "Event ID" },
  event_date: { es: "Fecha", en: "Date" },
  guide_number: { es: "Guía", en: "Guide number" },
  buyer: { es: "Comprador", en: "Buyer" },
  price: { es: "Precio", en: "Price" },
  weight_kg: { es: "Peso (kg)", en: "Weight (kg)" },
  cause: { es: "Causa", en: "Cause" },
  notes: { es: "Notas", en: "Notes" },
  created_at: { es: "Creado", en: "Created" },
  id: { es: "ID", en: "ID" },
  name: { es: "Nombre", en: "Name" },
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
