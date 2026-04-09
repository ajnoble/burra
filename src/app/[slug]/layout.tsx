import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { deriveAccentPalette } from "@/lib/theme/derive-accent";
import { InjectAccent } from "@/lib/theme/inject-accent";
import { OrgThemeProvider } from "@/lib/theme/org-theme-context";

export default async function ClubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const palette = org.accentColor ? deriveAccentPalette(org.accentColor) : null;

  return (
    <OrgThemeProvider value={{ logoUrl: org.logoUrl, name: org.name, slug }}>
      {palette && <InjectAccent palette={palette} />}
      {children}
    </OrgThemeProvider>
  );
}
