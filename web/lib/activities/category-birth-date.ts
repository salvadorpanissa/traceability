export type CategoryAgeBracket = { id: string; minAgeMonths: number | null };

// Deduces an age (in months) for a category from its position among every
// category's minAgeMonths, regardless of sex — "Ternero"/"Ternera" (min 0)
// share the same birth-to-next-bracket window even though only the male
// side has further numbered brackets ("Novillo 1-2 años", etc.), matching
// how the farm actually uses those two labels as one shared newborn stage.
// Returns null when the category has no minAgeMonths at all (e.g. "Toro",
// "Vaca de cría") — there's no age to deduce for those, and inventing one
// would be worse than leaving the birth date unknown.
export function deduceAgeMonthsForCategory(categoryId: string, categories: CategoryAgeBracket[]): number | null {
  const current = categories.find((c) => c.id === categoryId);
  if (!current || current.minAgeMonths === null) return null;

  const thresholds = Array.from(
    new Set(categories.map((c) => c.minAgeMonths).filter((m): m is number => m !== null))
  ).sort((a, b) => a - b);
  const index = thresholds.indexOf(current.minAgeMonths);
  const next = thresholds[index + 1];
  if (next !== undefined) {
    return Math.round((current.minAgeMonths + next) / 2);
  }

  // Open-ended top bracket (e.g. "Novillo +3 años", min 36 with no next
  // threshold): extends by the same gap as the previous bracket instead of
  // just returning the bare minimum, so it lands on the midpoint of the
  // implied next bracket the same way every other category does.
  const previous = thresholds[index - 1];
  const gap = previous !== undefined ? current.minAgeMonths - previous : 0;
  return current.minAgeMonths + Math.round(gap / 2);
}
