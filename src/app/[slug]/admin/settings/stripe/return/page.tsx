import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { verifyOnboardingStatus } from "@/actions/stripe/onboarding";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function StripeReturnPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const onboarding = await verifyOnboardingStatus(org.id);

  if (onboarding.status === "complete") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
          <span className="text-green-600 dark:text-green-400 text-2xl">✓</span>
        </div>
        <h1 className="text-2xl font-bold">Stripe Connected</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Your Stripe account is now connected. Members can pay booking invoices
          directly from their dashboard.
        </p>
        <Button render={<Link href={`/${slug}/admin/settings`} />}>
          Back to Settings
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center">
        <span className="text-yellow-600 dark:text-yellow-400 text-2xl">!</span>
      </div>
      <h1 className="text-2xl font-bold">Setup Incomplete</h1>
      <p className="text-muted-foreground text-center max-w-md">
        Your Stripe account setup is not yet complete. Please return to settings
        to continue the onboarding process.
      </p>
      <Button render={<Link href={`/${slug}/admin/settings`} />}>
        Back to Settings
      </Button>
    </div>
  );
}
