import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { OrgSettingsForm } from "./org-settings-form";
import { MembershipClassManager } from "./membership-class-manager";
import { CancellationPolicyManager } from "./cancellation-policy-manager";
import { ChargeCategoryManager } from "./charge-category-manager";
import { CustomFieldManager } from "./custom-field-manager";
import { StripeConnectCard } from "./stripe-connect-card";
import { GstSettingsForm } from "./gst-settings-form";
import { BrandingSettingsForm } from "./branding-settings-form";
import { Separator } from "@/components/ui/separator";
import { db } from "@/db/index";
import { membershipClasses, cancellationPolicies, chargeCategories, customFields } from "@/db/schema";
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

  const categories = await db
    .select()
    .from(chargeCategories)
    .where(eq(chargeCategories.organisationId, org.id))
    .orderBy(chargeCategories.sortOrder);

  const fields = await db
    .select()
    .from(customFields)
    .where(eq(customFields.organisationId, org.id))
    .orderBy(customFields.sortOrder);

  const onboarding = await verifyOnboardingStatus(org.id);

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Organisation Settings</h1>

      <OrgSettingsForm org={org} />

      <Separator className="my-8" />

      <BrandingSettingsForm
        organisationId={org.id}
        initial={{
          accentColor: org.accentColor ?? null,
          logoUrl: org.logoUrl ?? null,
        }}
      />

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

      <GstSettingsForm
        organisationId={org.id}
        slug={slug}
        gstEnabled={org.gstEnabled}
        gstRateBps={org.gstRateBps}
        abnNumber={org.abnNumber}
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

      <Separator className="my-8" />

      <h2 className="text-xl font-bold mb-4">Charge Categories</h2>
      <ChargeCategoryManager
        organisationId={org.id}
        initialCategories={categories}
      />

      <Separator className="my-8" />

      <h2 className="text-xl font-bold mb-4">Custom Member Fields</h2>
      <CustomFieldManager
        organisationId={org.id}
        initialFields={fields}
      />
    </div>
  );
}
