"use client";

import { createContext, useContext } from "react";
import type { Dict, Locale } from "@/lib/i18n";

const I18nCtx = createContext<{ t: Dict; locale: Locale } | null>(null);

export function I18nProvider({
  dict,
  locale,
  children,
}: {
  dict: Dict;
  locale: Locale;
  children: React.ReactNode;
}) {
  return <I18nCtx.Provider value={{ t: dict, locale }}>{children}</I18nCtx.Provider>;
}

export function useT() {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx;
}
