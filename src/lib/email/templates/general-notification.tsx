import { Text } from "@react-email/components";
import { EmailLayout } from "./layout";

type GeneralNotificationEmailProps = {
  orgName: string;
  subject: string;
  body: string;
  logoUrl?: string;
};

export function GeneralNotificationEmail({
  orgName,
  subject,
  body,
  logoUrl,
}: GeneralNotificationEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>{subject}</Text>
      <Text style={paragraph}>{body}</Text>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "bold" as const,
  margin: "0 0 16px",
};

const paragraph = {
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 12px",
};
