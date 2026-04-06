import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { generateOnboardingLink } from "@/actions/stripe/onboarding";
import { redirect } from "next/navigation";

export default async function StripeRefreshPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const result = await generateOnboardingLink(org.id, slug);

  if (result.success && result.url) {
    redirect(result.url);
  }

  redirect(`/${slug}/admin/settings`);
}
