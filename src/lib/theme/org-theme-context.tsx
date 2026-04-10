"use client";

import { createContext, useContext } from "react";

export type OrgTheme = {
  logoUrl: string | null;
  name: string;
  slug: string;
};

const OrgThemeContext = createContext<OrgTheme | null>(null);

export function OrgThemeProvider({
  value,
  children,
}: {
  value: OrgTheme;
  children: React.ReactNode;
}) {
  return (
    <OrgThemeContext.Provider value={value}>{children}</OrgThemeContext.Provider>
  );
}

export function useOrgTheme(): OrgTheme {
  const ctx = useContext(OrgThemeContext);
  if (!ctx) {
    throw new Error("useOrgTheme must be used inside OrgThemeProvider");
  }
  return ctx;
}
