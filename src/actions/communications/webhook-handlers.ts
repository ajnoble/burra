"use server";

import { db } from "@/db/index";
import { communicationRecipients } from "@/db/schema";
import { eq } from "drizzle-orm";

type ResendWebhookPayload = {
  type: string;
  data: { email_id: string };
};

type TelnyxWebhookPayload = {
  data: {
    event_type: string;
    payload: { id: string };
  };
};

export async function processResendWebhook(
  payload: ResendWebhookPayload
): Promise<void> {
  const { type, data } = payload;
  const externalId = data.email_id;

  switch (type) {
    case "email.delivered":
      await db
        .update(communicationRecipients)
        .set({ status: "DELIVERED", deliveredAt: new Date() })
        .where(eq(communicationRecipients.externalId, externalId));
      break;
    case "email.opened":
      await db
        .update(communicationRecipients)
        .set({ status: "OPENED", openedAt: new Date() })
        .where(eq(communicationRecipients.externalId, externalId));
      break;
    case "email.clicked":
      await db
        .update(communicationRecipients)
        .set({ status: "CLICKED" })
        .where(eq(communicationRecipients.externalId, externalId));
      break;
    case "email.bounced":
    case "email.complaint":
      await db
        .update(communicationRecipients)
        .set({ status: "BOUNCED" })
        .where(eq(communicationRecipients.externalId, externalId));
      break;
    default:
      // Unknown event type — ignore
      break;
  }
}

export async function processTelnyxWebhook(
  payload: TelnyxWebhookPayload
): Promise<void> {
  const { event_type } = payload.data;
  const externalId = payload.data.payload.id;

  switch (event_type) {
    case "message.sent":
      await db
        .update(communicationRecipients)
        .set({ status: "SENT" })
        .where(eq(communicationRecipients.externalId, externalId));
      break;
    case "message.delivered":
      await db
        .update(communicationRecipients)
        .set({ status: "DELIVERED", deliveredAt: new Date() })
        .where(eq(communicationRecipients.externalId, externalId));
      break;
    case "message.failed":
      await db
        .update(communicationRecipients)
        .set({ status: "FAILED" })
        .where(eq(communicationRecipients.externalId, externalId));
      break;
    default:
      break;
  }
}
