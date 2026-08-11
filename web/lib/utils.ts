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
