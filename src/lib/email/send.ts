import { getResendClient } from "./client";
import type { SendEmailOptions } from "./types";

type SendEmailTrackedResult = {
  messageId: string | null;
  error?: string;
};

export function sendEmail(options: SendEmailOptions): void {
  const { to, subject, template, replyTo, orgName } = options;
  const displayName = orgName ? `${orgName} via Snow Gum` : "Snow Gum";
  const from = `${displayName} <noreply@snowgum.site>`;

  const resend = getResendClient();

  resend.emails
    .send({
      from,
      to,
      subject,
      react: template,
      replyTo,
    })
    .catch((error) => {
      console.error("[email] Failed to send:", error);
    });
}

export async function sendEmailTracked(
  options: SendEmailOptions
): Promise<SendEmailTrackedResult> {
  const { to, subject, template, replyTo, orgName } = options;
  const displayName = orgName ? `${orgName} via Snow Gum` : "Snow Gum";
  const from = `${displayName} <noreply@snowgum.site>`;

  const resend = getResendClient();

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      react: template,
      replyTo,
    });

    if (error) {
      return { messageId: null, error: error.message };
    }

    return { messageId: data?.id ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { messageId: null, error: message };
  }
}
