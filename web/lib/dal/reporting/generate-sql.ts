import { GoogleGenAI } from "@google/genai";

const SCHEMA_DESCRIPTION = `
Tablas disponibles (todas de solo lectura):

my_animal_state(animal_id, current_tag, current_farm_id, farm_name, current_paddock_id, paddock_name, current_category_id, category_name, owner_id, owner_name, status)
  -- status es uno de: 'alive', 'sold', 'dead'
my_farms(id, name)
my_paddocks(id, name, farm_id)
my_categories(id, name, sort_order)
my_products(id, name, default_dose_unit, default_withdrawal_days)
my_owners(id, name)
my_transfer_events(event_id, event_date, animal_id, animal_tag, farm_id, farm_name, origin_farm_id, origin_farm_name, destination_farm_id, destination_farm_name, origin_paddock_id, origin_paddock_name, destination_paddock_id, destination_paddock_name, guide_number, notes, created_at)
my_health_events(event_id, event_date, animal_id, animal_tag, farm_id, farm_name, product_id, product_name, dose, dose_unit, route, withdrawal_days, health_notes, notes, created_at)
my_retag_events(event_id, event_date, animal_id, farm_id, farm_name, old_tag, new_tag, notes, created_at)
my_recategorize_events(event_id, event_date, animal_id, animal_tag, farm_id, farm_name, old_category_id, old_category_name, new_category_id, new_category_name, notes, created_at)
my_sale_events(event_id, event_date, animal_id, animal_tag, farm_id, farm_name, buyer, price, weight_kg, notes, created_at)
my_death_events(event_id, event_date, animal_id, animal_tag, farm_id, farm_name, cause, notes, created_at)

Reglas:
- Devolvé ÚNICAMENTE una consulta SQL, un solo SELECT, sin punto y coma final, sin explicación, sin markdown.
- Usá exclusivamente las tablas listadas arriba.
- Para "última X", ordená por event_date descendente (y created_at descendente como desempate) y usá LIMIT.
`.trim();

function stripMarkdownFences(text: string): string {
  const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  return body.trim().replace(/;$/, "");
}

export async function generateReportingSql(question: string): Promise<string> {
  if (process.env.NL_QUERY_TEST_SQL_OVERRIDE) {
    return process.env.NL_QUERY_TEST_SQL_OVERRIDE;
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    contents: question,
    config: { systemInstruction: SCHEMA_DESCRIPTION },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned no text");
  }
  return stripMarkdownFences(text);
}
