import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import {
  deriveAccentPalette,
  type AccentPalette,
} from "@/lib/theme/derive-accent";
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

  // Guard against a malformed accentColor somehow landing in the DB
  // (manual SQL, bad migration, etc.). The server action validates on
  // write, but if an invalid value ever slips through, we degrade to
  // no accent rather than 500ing every page under the org slug.
  let palette: AccentPalette | null = null;
  if (org.accentColor) {
    try {
      palette = deriveAccentPalette(org.accentColor);
    } catch {
      palette = null;
    }
  }

  return (
    <OrgThemeProvider value={{ logoUrl: org.logoUrl, name: org.name, slug }}>
      {palette && <InjectAccent palette={palette} />}
      {children}
    </OrgThemeProvider>
  );
}
