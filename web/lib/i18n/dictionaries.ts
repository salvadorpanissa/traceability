export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

const dictionaries = {
  es: {
    "app.title": "Trazabilidad de ganado",
    "appShell.changeFarm": "Cambiar campo",
    "appShell.logout": "Cerrar sesión",
    "appShell.navigation": "Navegación principal",
    "appShell.openNavigation": "Abrir navegación",
    "appShell.closeNavigation": "Cerrar navegación",
    "appShell.userMenu": "Menú de usuario",
    "appShell.navDashboard": "Dashboard",
    "appShell.navHealth": "Sanidades",
    "appShell.navTransfer": "Traslados",
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
    "settings.menu": "Configuración",
    "settings.themeLight": "Claro",
    "settings.themeDark": "Oscuro",
    "settings.themeSystem": "Sistema",
    "livestock.title": "Estado del ganado",
    "livestock.empty": "No hay animales para mostrar.",
    "livestock.tag": "Caravana",
    "livestock.farm": "Campo",
    "livestock.paddock": "Potrero",
    "livestock.category": "Categoría",
    "livestock.status": "Estado",
    "livestock.statusAlive": "Vivo",
    "livestock.statusSold": "Vendido",
    "livestock.statusDead": "Muerto",
    "livestock.showAll": "Ver todos",
    "livestock.showLess": "Ver menos",
    "livestock.summaryTitle": "Resumen por campo y categoría",
    "livestock.summaryEmpty": "No hay animales vivos para resumir.",
    "livestock.summaryCount": "Cantidad",
    "livestock.noCategory": "Sin categoría",
    "livestock.noFarm": "Sin campo",
  },
  en: {
    "app.title": "Livestock traceability",
    "appShell.changeFarm": "Change farm",
    "appShell.logout": "Log out",
    "appShell.navigation": "Main navigation",
    "appShell.openNavigation": "Open navigation",
    "appShell.closeNavigation": "Close navigation",
    "appShell.userMenu": "User menu",
    "appShell.navDashboard": "Dashboard",
    "appShell.navHealth": "Sanities",
    "appShell.navTransfer": "Transfers",
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
    "settings.menu": "Settings",
    "settings.themeLight": "Light",
    "settings.themeDark": "Dark",
    "settings.themeSystem": "System",
    "livestock.title": "Livestock status",
    "livestock.empty": "No animals to show.",
    "livestock.tag": "Tag",
    "livestock.farm": "Farm",
    "livestock.paddock": "Paddock",
    "livestock.category": "Category",
    "livestock.status": "Status",
    "livestock.statusAlive": "Alive",
    "livestock.statusSold": "Sold",
    "livestock.statusDead": "Dead",
    "livestock.showAll": "Show all",
    "livestock.showLess": "Show less",
    "livestock.summaryTitle": "Summary by farm and category",
    "livestock.summaryEmpty": "No live animals to summarize.",
    "livestock.summaryCount": "Count",
    "livestock.noCategory": "No category",
    "livestock.noFarm": "No farm",
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
