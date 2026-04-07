import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";

type InviteEmailProps = {
  orgName: string;
  firstName: string;
  inviteUrl: string;
  memberNumber?: string;
  logoUrl?: string;
};

export function InviteEmail({
  orgName,
  firstName,
  inviteUrl,
  memberNumber,
  logoUrl,
}: InviteEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>You&apos;re invited to {orgName}</Text>
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>
        An account has been created for you. Click the button below to set your
        password and get started.
      </Text>
      {memberNumber && (
        <Section style={detailsBox}>
          <Text style={paragraph}>
            <strong>Member number:</strong> {memberNumber}
          </Text>
        </Section>
      )}
      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Link href={inviteUrl} style={button}>
          Set up your account
        </Link>
      </Section>
      <Text style={paragraph}>
        This link will expire in 24 hours. If you have any questions, contact
        your club administrator.
      </Text>
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

const detailsBox = {
  backgroundColor: "#f9f9f9",
  borderRadius: "8px",
  padding: "16px",
  margin: "16px 0",
};

const button = {
  backgroundColor: "#111111",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  textDecoration: "none",
  fontWeight: "bold" as const,
  fontSize: "14px",
};
