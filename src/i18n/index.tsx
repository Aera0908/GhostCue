import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { SupportedLocale, TranslationDictionary, LanguageOption } from "./types";
import { translations, SUPPORTED_LANGUAGES, STT_LANGUAGES, RESPONSE_LANGUAGES } from "./translations";

interface I18nContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: TranslationDictionary;
  languages: LanguageOption[];
  sttLanguages: typeof STT_LANGUAGES;
  responseLanguages: typeof RESPONSE_LANGUAGES;
}

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = "ghostcue_ui_locale";

interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: string;
  onLocaleChange?: (locale: string) => void;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({
  children,
  initialLocale,
  onLocaleChange,
}) => {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    if (initialLocale && initialLocale in translations) {
      return initialLocale as SupportedLocale;
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in translations) {
      return saved as SupportedLocale;
    }
    // Try browser language match
    const navLang = navigator.language;
    if (navLang in translations) {
      return navLang as SupportedLocale;
    }
    const baseNav = navLang.split("-")[0];
    if (baseNav === "zh") {
      return navLang.toLowerCase().includes("tw") || navLang.toLowerCase().includes("hk")
        ? "zh-TW"
        : "zh-CN";
    }
    const match = Object.keys(translations).find((k) => k.startsWith(baseNav));
    if (match) {
      return match as SupportedLocale;
    }
    return "en";
  });

  useEffect(() => {
    if (initialLocale && initialLocale in translations && initialLocale !== locale) {
      setLocaleState(initialLocale as SupportedLocale);
    }
  }, [initialLocale]);

  const setLocale = (newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch {
      // ignore
    }
    if (onLocaleChange) {
      onLocaleChange(newLocale);
    }
  };

  const t = useMemo(() => {
    return translations[locale] || translations.en;
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      languages: SUPPORTED_LANGUAGES,
      sttLanguages: STT_LANGUAGES,
      responseLanguages: RESPONSE_LANGUAGES,
    }),
    [locale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useTranslation = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    // Fallback if rendered outside provider
    return {
      locale: "en",
      setLocale: () => {},
      t: translations.en,
      languages: SUPPORTED_LANGUAGES,
      sttLanguages: STT_LANGUAGES,
      responseLanguages: RESPONSE_LANGUAGES,
    };
  }
  return context;
};

export * from "./types";
export * from "./translations";
