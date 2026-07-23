export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

const dictionaries = {
  es: {
    "app.title": "Trazabilidad de ganado",
    "appShell.logout": "Cerrar sesión",
    "appShell.navigation": "Navegación principal",
    "appShell.openNavigation": "Abrir navegación",
    "appShell.closeNavigation": "Cerrar navegación",
    "appShell.userMenu": "Menú de usuario",
    "appShell.navDashboard": "Dashboard",
    "appShell.navHealth": "Sanidades",
    "appShell.navTransfer": "Traslados",
    "appShell.navDicose": "Registro de DICOSE",
    "appShell.navRegisterTags": "Registro de Caravanas",
    "dashboard.title": "Dashboard",
    "login.email": "Email",
    "login.password": "Contraseña",
    "login.submit": "Ingresar",
    "login.submitPending": "Ingresando...",
    "settings.language": "Idioma",
    "settings.theme": "Tema",
    "settings.menu": "Configuración",
    "settings.themeLight": "Claro",
    "settings.themeDark": "Oscuro",
    "settings.themeSystem": "Sistema",
    "livestock.farm": "Campo",
    "livestock.paddock": "Potrero",
    "livestock.category": "Categoría",
    "livestock.summaryCount": "Cantidad",
    "livestock.noCategory": "Sin categoría",
    "livestock.noFarm": "Sin campo",
    "livestock.noPaddock": "Sin potrero",
    "livestock.byPaddockTitle": "Animales por potrero",
    "livestock.byPaddockEmpty": "No hay animales vivos para mostrar por potrero.",
    "livestock.byCategoryTitle": "Animales por categoría",
    "livestock.byCategoryEmpty": "No hay animales vivos para mostrar por categoría.",
    "nlQuery.placeholder": "Preguntá algo sobre tus animales, ej: ¿cuál fue la última sanidad en Cuatro Cerros?",
    "nlQuery.submit": "Consultar",
    "nlQuery.submitPending": "Consultando...",
    "nlQuery.emptyResults": "Sin resultados para esta consulta.",
    "nlQuery.errorCantGenerate": "No pude generar una consulta a partir de tu pregunta. Probá reformularla.",
    "nlQuery.errorTimeout": "La consulta tardó demasiado. Probá con una pregunta más simple o específica.",
    "nlQuery.errorConnection": "No se pudo conectar con el asistente. Probá de nuevo en un momento.",
  },
  en: {
    "app.title": "Livestock traceability",
    "appShell.logout": "Log out",
    "appShell.navigation": "Main navigation",
    "appShell.openNavigation": "Open navigation",
    "appShell.closeNavigation": "Close navigation",
    "appShell.userMenu": "User menu",
    "appShell.navDashboard": "Dashboard",
    "appShell.navHealth": "Sanities",
    "appShell.navTransfer": "Transfers",
    "appShell.navDicose": "Register DICOSE",
    "appShell.navRegisterTags": "Register tags",
    "dashboard.title": "Dashboard",
    "login.email": "Email",
    "login.password": "Password",
    "login.submit": "Sign in",
    "login.submitPending": "Signing in...",
    "settings.language": "Language",
    "settings.theme": "Theme",
    "settings.menu": "Settings",
    "settings.themeLight": "Light",
    "settings.themeDark": "Dark",
    "settings.themeSystem": "System",
    "livestock.farm": "Farm",
    "livestock.paddock": "Paddock",
    "livestock.category": "Category",
    "livestock.summaryCount": "Count",
    "livestock.noCategory": "No category",
    "livestock.noFarm": "No farm",
    "livestock.noPaddock": "No paddock",
    "livestock.byPaddockTitle": "Animals by paddock",
    "livestock.byPaddockEmpty": "No live animals to show by paddock.",
    "livestock.byCategoryTitle": "Animals by category",
    "livestock.byCategoryEmpty": "No live animals to show by category.",
    "nlQuery.placeholder": "Ask something about your animals, e.g.: what was the last health event in the North paddock?",
    "nlQuery.submit": "Query",
    "nlQuery.submitPending": "Querying...",
    "nlQuery.emptyResults": "No results for this query.",
    "nlQuery.errorCantGenerate": "I couldn't build a query from your question. Try rephrasing it.",
    "nlQuery.errorTimeout": "The query took too long. Try a simpler or more specific question.",
    "nlQuery.errorConnection": "Couldn't reach the assistant. Try again in a moment.",
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
