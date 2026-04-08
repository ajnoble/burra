import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { getCommunication } from "@/actions/communications/queries";
import { db } from "@/db/index";
import { communicationTemplates, membershipClasses } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ComposeForm } from "./compose-form";
import type { CommunicationFilters } from "@/db/schema/communications";

export default async function ComposePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ draft?: string; template?: string }>;
}) {
  const { slug } = await params;
  const search = await searchParams;

  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session || !isCommitteeOrAbove(session.role)) notFound();

  // Load draft if specified
  let draft = null;
  if (search.draft) {
    const comm = await getCommunication(search.draft, org.id);
    if (comm && comm.status === "DRAFT") {
      draft = {
        id: comm.id,
        subject: comm.subject,
        bodyMarkdown: comm.bodyMarkdown,
        smsBody: comm.smsBody,
        channel: comm.channel,
        filters: (comm.filters ?? {}) as CommunicationFilters,
      };
    }
  }

  // Load template if specified
  let template = null;
  if (search.template && !draft) {
    const [tpl] = await db
      .select()
      .from(communicationTemplates)
      .where(
        and(
          eq(communicationTemplates.id, search.template),
          eq(communicationTemplates.organisationId, org.id)
        )
      );
    if (tpl) {
      template = {
        id: tpl.id,
        name: tpl.name,
        subject: tpl.subject,
        bodyMarkdown: tpl.bodyMarkdown,
        smsBody: tpl.smsBody,
        channel: tpl.channel,
      };
    }
  }

  // Fetch membership classes for filter dropdowns
  const classes = await db
    .select({ id: membershipClasses.id, name: membershipClasses.name })
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, org.id))
    .orderBy(membershipClasses.name);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Compose Message</h1>
      <ComposeForm
        organisationId={org.id}
        slug={slug}
        sessionMemberId={session.memberId}
        membershipClasses={classes}
        draft={draft}
        template={template}
      />
    </div>
  );
}
