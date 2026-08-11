"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { translate, type Locale, type TranslationKey } from "./dictionaries";

type LocaleContextValue = {
  locale: Locale;
  t: (key: TranslationKey) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const t = useCallback((key: TranslationKey) => translate(initialLocale, key), [initialLocale]);

  const value = useMemo(() => ({ locale: initialLocale, t }), [initialLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return context;
}

