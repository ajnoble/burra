import { getResendClient } from "./client";
import type { SendEmailOptions } from "./types";

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
