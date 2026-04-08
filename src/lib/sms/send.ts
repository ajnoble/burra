import { getTelnyxClient } from "./client";

type SendSMSOptions = {
  to: string;
  body: string;
  from: string;
};

type SendSMSResult = {
  messageId: string | null;
  error?: string;
};

export async function sendSMS(options: SendSMSOptions): Promise<SendSMSResult> {
  try {
    const telnyx = getTelnyxClient();
    const response = await telnyx.messages.send({
      from: options.from,
      to: options.to,
      text: options.body,
    });
    return { messageId: response.data?.id ?? null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown SMS error";
    console.error("[sms] Failed to send:", message);
    return { messageId: null, error: message };
  }
}
