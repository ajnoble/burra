"use server";

import { db } from "@/db/index";
import {
  communications,
  communicationRecipients,
  organisations,
  members,
  organisationMembers,
  membershipClasses,
} from "@/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { sendEmailTracked } from "@/lib/email/send";
import { sendSMS } from "@/lib/sms/send";
import { renderMarkdown } from "@/lib/markdown";
import { BulkCommunicationEmail } from "@/lib/email/templates/bulk-communication";
import React from "react";
import type { CommunicationFilters } from "@/db/schema/communications";

type SendCommunicationInput = {
  communicationId: string;
  organisationId: string;
  slug: string;
};

const BATCH_SIZE = 50;

export async function sendCommunication(input: SendCommunicationInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  // Fetch the communication (must be DRAFT)
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
    return { success: false, error: "Communication not found" };
  }

  if (communication.status !== "DRAFT") {
    return { success: false, error: "Communication must be in DRAFT status to send" };
  }

  // Fetch org details
  const [org] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  if (!org) {
    return { success: false, error: "Organisation not found" };
  }

  // Resolve recipients
  const filters = (communication.filters ?? {}) as CommunicationFilters;
  const conditions = [
    eq(members.organisationId, input.organisationId),
    eq(organisationMembers.isActive, true),
  ];

  if (filters.membershipClassIds && filters.membershipClassIds.length > 0) {
    conditions.push(inArray(members.membershipClassId, filters.membershipClassIds));
  }

  if (filters.isFinancial !== undefined) {
    conditions.push(eq(members.isFinancial, filters.isFinancial));
  }

  if (filters.role) {
    conditions.push(
      eq(
        organisationMembers.role,
        filters.role as "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN"
      )
    );
  }

  const rows = await db
    .select()
    .from(members)
    .innerJoin(
      organisationMembers,
      and(
        eq(organisationMembers.memberId, members.id),
        eq(organisationMembers.organisationId, members.organisationId)
      )
    )
    .leftJoin(membershipClasses, eq(membershipClasses.id, members.membershipClassId))
    .where(and(...conditions))
    .orderBy(asc(members.lastName), asc(members.firstName));

  const excludeSet = new Set(filters.manualExclude ?? []);
  const resolvedMembers = rows.filter((r) => !excludeSet.has(r.members.id));

  // Set status to SENDING
  await db
    .update(communications)
    .set({ status: "SENDING", updatedAt: new Date() })
    .where(eq(communications.id, input.communicationId));

  // Build recipient rows
  const recipientRows: {
    communicationId: string;
    memberId: string;
    channel: "EMAIL" | "SMS";
    status: "PENDING";
  }[] = [];

  for (const row of resolvedMembers) {
    const m = row.members;
    if (
      (communication.channel === "EMAIL" || communication.channel === "BOTH") &&
      m.email
    ) {
      recipientRows.push({
        communicationId: input.communicationId,
        memberId: m.id,
        channel: "EMAIL",
        status: "PENDING",
      });
    }
    if (
      (communication.channel === "SMS" || communication.channel === "BOTH") &&
      m.phone
    ) {
      recipientRows.push({
        communicationId: input.communicationId,
        memberId: m.id,
        channel: "SMS",
        status: "PENDING",
      });
    }
  }

  // Insert all recipient rows
  if (recipientRows.length > 0) {
    await db.insert(communicationRecipients).values(recipientRows);
  }

  // Render markdown to HTML for email
  const bodyHtml = renderMarkdown(communication.bodyMarkdown);

  // Strip markdown for SMS plain text fallback
  const smsText =
    communication.smsBody ||
    communication.bodyMarkdown.replace(/[*_#`~\[\]()>]/g, "");

  // Process in batches
  let sentCount = 0;
  let failedCount = 0;

  // Build a lookup of members by id for quick access
  const memberLookup = new Map(
    resolvedMembers.map((r) => [r.members.id, r.members])
  );

  for (let i = 0; i < recipientRows.length; i += BATCH_SIZE) {
    const batch = recipientRows.slice(i, i + BATCH_SIZE);

    for (const recipient of batch) {
      const member = memberLookup.get(recipient.memberId);
      if (!member) continue;

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
            failedCount++;
            await db
              .update(communicationRecipients)
              .set({ status: "FAILED", error: result.error })
              .where(
                and(
                  eq(communicationRecipients.communicationId, input.communicationId),
                  eq(communicationRecipients.memberId, member.id),
                  eq(communicationRecipients.channel, "EMAIL")
                )
              );
          } else {
            sentCount++;
            await db
              .update(communicationRecipients)
              .set({
                status: "SENT",
                externalId: result.messageId,
                sentAt: new Date(),
              })
              .where(
                and(
                  eq(communicationRecipients.communicationId, input.communicationId),
                  eq(communicationRecipients.memberId, member.id),
                  eq(communicationRecipients.channel, "EMAIL")
                )
              );
          }
        } else if (recipient.channel === "SMS" && member.phone) {
          const result = await sendSMS({
            to: member.phone,
            body: smsText,
            from: org.smsFromNumber || "",
          });

          if (result.error) {
            failedCount++;
            await db
              .update(communicationRecipients)
              .set({ status: "FAILED", error: result.error })
              .where(
                and(
                  eq(communicationRecipients.communicationId, input.communicationId),
                  eq(communicationRecipients.memberId, member.id),
                  eq(communicationRecipients.channel, "SMS")
                )
              );
          } else {
            sentCount++;
            await db
              .update(communicationRecipients)
              .set({
                status: "SENT",
                externalId: result.messageId,
                sentAt: new Date(),
              })
              .where(
                and(
                  eq(communicationRecipients.communicationId, input.communicationId),
                  eq(communicationRecipients.memberId, member.id),
                  eq(communicationRecipients.channel, "SMS")
                )
              );
          }
        }
      } catch (err) {
        failedCount++;
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        await db
          .update(communicationRecipients)
          .set({ status: "FAILED", error: errorMessage })
          .where(
            and(
              eq(communicationRecipients.communicationId, input.communicationId),
              eq(communicationRecipients.memberId, recipient.memberId),
              eq(communicationRecipients.channel, recipient.channel)
            )
          );
      }
    }
  }

  // Determine final status
  let finalStatus: "SENT" | "PARTIAL_FAILURE" | "FAILED";
  if (failedCount === 0) {
    finalStatus = "SENT";
  } else if (sentCount === 0) {
    finalStatus = "FAILED";
  } else {
    finalStatus = "PARTIAL_FAILURE";
  }

  // Update communication with final status
  await db
    .update(communications)
    .set({
      status: finalStatus,
      recipientCount: sentCount + failedCount,
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(communications.id, input.communicationId));

  revalidatePath(`/${input.slug}/admin/communications`);

  return { success: true, status: finalStatus, sentCount, failedCount };
}
