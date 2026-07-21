export function normalizeSex(raw: string | null): "male" | "female" | null {
  if (!raw) return null;
  const value = raw.trim().toUpperCase();
  if (value === "M" || value === "MACHO") return "male";
  if (value === "H" || value === "HEMBRA") return "female";
  return null;
}
