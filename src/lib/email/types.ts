import type { ReactElement } from "react";

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  template: ReactElement;
  replyTo?: string;
  orgName?: string;
};
