import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { OrgSettingsForm } from "./org-settings-form";
import { MembershipClassManager } from "./membership-class-manager";
import { CancellationPolicyManager } from "./cancellation-policy-manager";
import { StripeConnectCard } from "./stripe-connect-card";
import { Separator } from "@/components/ui/separator";
import { db } from "@/db/index";
import { membershipClasses, cancellationPolicies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyOnboardingStatus } from "@/actions/stripe/onboarding";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const classes = await db
    .select()
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, org.id))
    .orderBy(membershipClasses.sortOrder);

  const policies = await db
    .select()
    .from(cancellationPolicies)
    .where(eq(cancellationPolicies.organisationId, org.id));

  const onboarding = await verifyOnboardingStatus(org.id);

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Organisation Settings</h1>

      <OrgSettingsForm org={org} />

      <Separator className="my-8" />

      <h2 className="text-xl font-bold mb-4">Payments</h2>
      <StripeConnectCard
        organisationId={org.id}
        slug={slug}
        status={onboarding.status}
        accountId={onboarding.accountId}
        platformFeeBps={org.platformFeeBps}
      />

      <Separator className="my-8" />

      <h2 className="text-xl font-bold mb-4">Membership Classes</h2>
      <MembershipClassManager
        organisationId={org.id}
        initialClasses={classes}
      />

      <Separator className="my-8" />

      <h2 className="text-xl font-bold mb-4">Cancellation Policy</h2>
      <CancellationPolicyManager
        organisationId={org.id}
        initialPolicies={policies}
      />
    </div>
  );
}
