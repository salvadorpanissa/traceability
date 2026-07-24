// Whole elapsed calendar months between two ISO dates (yyyy-mm-dd),
// matching everyday "age in months" semantics: the day-of-month must have
// been reached for the current month to count. Clamped at 0 so a
// data-entry birth date in the future never produces a negative age.
export function computeAgeMonths(birthDateIso: string, asOfIso: string): number {
  const [birthYear, birthMonth, birthDay] = birthDateIso.split("-").map(Number);
  const [asOfYear, asOfMonth, asOfDay] = asOfIso.split("-").map(Number);
  let months = (asOfYear - birthYear) * 12 + (asOfMonth - birthMonth);
  if (asOfDay < birthDay) months -= 1;
  return Math.max(0, months);
}

export type AgeCategoryRule = { id: string; sex: "male" | "female" | null; minAgeMonths: number | null };

// Among categories eligible for this animal's sex (sex-matched or
// sex-unscoped) and age (minAgeMonths at or below its current age), picks
// the one with the highest minAgeMonths — the bracket the animal's age
// currently falls into. Categories with minAgeMonths: null never
// participate; they're manual-only by definition. Returns null if the
// animal is younger than every configured bracket for its sex.
export function resolveCategoryForAge(
  categories: AgeCategoryRule[],
  animalSex: "male" | "female",
  ageMonths: number
): string | null {
  const eligible = categories.filter(
    (c) => c.minAgeMonths !== null && c.minAgeMonths <= ageMonths && (c.sex === null || c.sex === animalSex)
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((best, c) => (c.minAgeMonths! > best.minAgeMonths! ? c : best)).id;
}
