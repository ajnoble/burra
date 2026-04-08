import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import {
  getCommunication,
  getRecipientStats,
  getRecipients,
} from "@/actions/communications/queries";
import { renderMarkdown } from "@/lib/markdown";
import { MessageDetail } from "./message-detail";

export default async function MessageDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session || !isCommitteeOrAbove(session.role)) notFound();

  const communication = await getCommunication(id, org.id);
  if (!communication) notFound();

  const [stats, recipientsResult] = await Promise.all([
    getRecipientStats(id),
    getRecipients(id),
  ]);

  // Pre-render markdown to sanitized HTML on the server
  const bodyHtml = renderMarkdown(communication.bodyMarkdown);

  return (
    <div className="p-6">
      <MessageDetail
        communication={{
          id: communication.id,
          subject: communication.subject,
          bodyMarkdown: communication.bodyMarkdown,
          bodyHtml,
          smsBody: communication.smsBody,
          channel: communication.channel,
          status: communication.status,
          recipientCount: communication.recipientCount,
          sentAt: communication.sentAt,
          createdAt: communication.createdAt,
        }}
        stats={stats}
        recipients={recipientsResult.recipients}
        organisationId={org.id}
        slug={slug}
      />
    </div>
  );
}
