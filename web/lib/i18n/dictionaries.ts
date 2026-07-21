export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

const dictionaries = {
  es: {
    "app.title": "Trazabilidad de ganado",
    "appShell.changeFarm": "Cambiar campo",
    "appShell.logout": "Cerrar sesión",
    "dashboard.title": "Dashboard",
    "dashboard.reportsNotice":
      "Los reportes (stock por potrero, existencias por categoría) se agregan en un plan aparte.",
    "login.email": "Email",
    "login.password": "Contraseña",
    "login.submit": "Ingresar",
    "login.submitPending": "Ingresando...",
    "selectFarm.noFarms": "No tenés campos asignados. Contactá al administrador.",
    "selectFarm.selecting": "Seleccionando campo...",
    "settings.language": "Idioma",
    "settings.theme": "Tema",
    "settings.themeLight": "Claro",
    "settings.themeDark": "Oscuro",
    "settings.themeSystem": "Sistema",
  },
  en: {
    "app.title": "Livestock traceability",
    "appShell.changeFarm": "Change farm",
    "appShell.logout": "Log out",
    "dashboard.title": "Dashboard",
    "dashboard.reportsNotice":
      "Reports (stock per paddock, headcount per category) are added in a separate plan.",
    "login.email": "Email",
    "login.password": "Password",
    "login.submit": "Sign in",
    "login.submitPending": "Signing in...",
    "selectFarm.noFarms": "You have no farms assigned. Contact the administrator.",
    "selectFarm.selecting": "Selecting farm...",
    "settings.language": "Language",
    "settings.theme": "Theme",
    "settings.themeLight": "Light",
    "settings.themeDark": "Dark",
    "settings.themeSystem": "System",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type TranslationKey = keyof (typeof dictionaries)["es"];

export function translate(locale: Locale, key: TranslationKey): string {
  return dictionaries[locale][key] ?? dictionaries[defaultLocale][key];
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export function parseLocaleCookie(value: string | undefined): Locale {
  return isLocale(value) ? value : defaultLocale;
}
