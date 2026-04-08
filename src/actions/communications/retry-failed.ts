"use server";

import { db } from "@/db/index";
import {
  communications,
  communicationRecipients,
  organisations,
  members,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { sendEmailTracked } from "@/lib/email/send";
import { sendSMS } from "@/lib/sms/send";
import { renderMarkdown } from "@/lib/markdown";
import { BulkCommunicationEmail } from "@/lib/email/templates/bulk-communication";
import React from "react";

type RetryFailedInput = {
  communicationId: string;
  organisationId: string;
  slug: string;
  recipientId?: string;
};

export async function retryFailed(input: RetryFailedInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized", retried: 0 };
  }

  // Fetch communication
  const [communication] = await db
    .select()
    .from(communications)
    .where(
      and(
        eq(communications.id, input.communicationId),
        eq(communications.organisationId, input.organisationId)
      )
    );

  if (!communication) {
    return { success: false, error: "Communication not found", retried: 0 };
  }

  // Fetch org details
  const [org] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  if (!org) {
    return { success: false, error: "Organisation not found", retried: 0 };
  }

  // Query failed recipients
  const conditions = [
    eq(communicationRecipients.communicationId, input.communicationId),
    eq(communicationRecipients.status, "FAILED"),
  ];

  if (input.recipientId) {
    conditions.push(eq(communicationRecipients.id, input.recipientId));
  }

  const failedRows = await db
    .select()
    .from(communicationRecipients)
    .innerJoin(members, eq(members.id, communicationRecipients.memberId))
    .where(and(...conditions));

  if (failedRows.length === 0) {
    return { success: true, retried: 0 };
  }

  // Render content
  const bodyHtml = renderMarkdown(communication.bodyMarkdown);
  const smsText =
    communication.smsBody ||
    communication.bodyMarkdown.replace(/[*_#`~\[\]()>]/g, "");

  let retried = 0;

  for (const row of failedRows) {
    const recipient = row.communication_recipients;
    const member = row.members;

    try {
      if (recipient.channel === "EMAIL" && member.email) {
        const template = React.createElement(BulkCommunicationEmail, {
          orgName: org.name,
          bodyHtml,
          logoUrl: org.logoUrl ?? undefined,
        });

        const result = await sendEmailTracked({
          to: member.email,
          subject: communication.subject || "Communication from " + org.name,
          template,
          replyTo: org.contactEmail ?? undefined,
          orgName: org.name,
        });

        if (result.error) {
          await db
            .update(communicationRecipients)
            .set({ error: result.error })
            .where(eq(communicationRecipients.id, recipient.id));
        } else {
          retried++;
          await db
            .update(communicationRecipients)
            .set({
              status: "SENT",
              externalId: result.messageId,
              sentAt: new Date(),
              error: null,
            })
            .where(eq(communicationRecipients.id, recipient.id));
        }
      } else if (recipient.channel === "SMS" && member.phone) {
        const result = await sendSMS({
          to: member.phone,
          body: smsText,
          from: org.smsFromNumber || "",
        });

        if (result.error) {
          await db
            .update(communicationRecipients)
            .set({ error: result.error })
            .where(eq(communicationRecipients.id, recipient.id));
        } else {
          retried++;
          await db
            .update(communicationRecipients)
            .set({
              status: "SENT",
              externalId: result.messageId,
              sentAt: new Date(),
              error: null,
            })
            .where(eq(communicationRecipients.id, recipient.id));
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      await db
        .update(communicationRecipients)
        .set({ error: errorMessage })
        .where(eq(communicationRecipients.id, recipient.id));
    }
  }

  revalidatePath(`/${input.slug}/admin/communications`);

  return { success: true, retried };
}
