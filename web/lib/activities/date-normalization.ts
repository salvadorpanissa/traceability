const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Excel exports from field devices (e.g. RFID readers) commonly store dates
// as plain text in day/month/year form ("8/7/2026") rather than as a real
// date cell, so ISO_DATE alone rejects rows that do have a usable date.
const SLASH_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
// Herd records (e.g. birth date) often only track month/year — the exact day
// of birth isn't known — so "01/2021" needs to resolve to something instead
// of silently failing to match SLASH_DATE. Approximated to the 1st of the
// month, the best available precision.
const MONTH_YEAR_DATE = /^(\d{1,2})\/(\d{4})$/;

export function normalizeDate(rawDate: string): string | null {
  const trimmed = rawDate.trim();
  if (ISO_DATE.test(trimmed)) return trimmed;

  const slashMatch = SLASH_DATE.exec(trimmed);
  if (slashMatch) {
    const [, dayStr, monthStr, yearStr] = slashMatch;
    const day = Number(dayStr);
    const month = Number(monthStr);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${yearStr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const monthYearMatch = MONTH_YEAR_DATE.exec(trimmed);
  if (monthYearMatch) {
    const [, monthStr, yearStr] = monthYearMatch;
    const month = Number(monthStr);
    if (month < 1 || month > 12) return null;
    return `${yearStr}-${String(month).padStart(2, "0")}-01`;
  }

  return null;
}

// Approximates a birth date from an age given in whole months, anchored to
// an event date — used for animals whose only age information is "N months
// old" (e.g. a SNIG guide), the same precision convention MONTH_YEAR_DATE
// already uses above: exact day unknown, approximate to the 1st.
export function estimateBirthDateFromAge(eventDateIso: string, ageMonths: number): string {
  const [year, month] = eventDateIso.split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) - ageMonths;
  const resultYear = Math.floor(totalMonths / 12);
  const resultMonth = totalMonths % 12;
  return `${resultYear}-${String(resultMonth + 1).padStart(2, "0")}-01`;
}
