import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const longDateFormatter = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "long", year: "numeric" })
const shortDateFormatter = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", year: "numeric" })

// Formats a "YYYY-MM-DD" date column value (e.g. "16 de junio de 2026").
// Parsed as UTC noon to dodge the local-timezone day-shift that new
// Date("YYYY-MM-DD") is prone to.
export function formatLongDate(dateStr: string): string {
  return longDateFormatter.format(new Date(`${dateStr}T12:00:00Z`))
}

// Compact form for narrow table columns (e.g. "16 ago. 2026").
export function formatShortDate(dateStr: string): string {
  return shortDateFormatter.format(new Date(`${dateStr}T12:00:00Z`))
}

// Normalizes free text typed into the database inconsistently (e.g. a
// product name entered as "ASPERSIN") into sentence case for display — only
// the first letter capitalized, the rest lowercased. Word-by-word Title
// Case would wrongly capitalize Spanish connector words (e.g. "Vaca de
// cría" becoming "Vaca De Cría"), so this stays a single first-letter
// capitalization. Display-only: never applied to identifiers like tags.
export function toSentenceCase(value: string): string {
  if (value.length === 0) return value
  return value[0].toUpperCase() + value.slice(1).toLowerCase()
}
