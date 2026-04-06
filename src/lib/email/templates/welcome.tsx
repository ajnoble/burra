import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";

type WelcomeEmailProps = {
  orgName: string;
  firstName: string;
  loginUrl: string;
  memberNumber?: string;
  logoUrl?: string;
};

export function WelcomeEmail({
  orgName,
  firstName,
  loginUrl,
  memberNumber,
  logoUrl,
}: WelcomeEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Welcome to {orgName}!</Text>
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>
        Your account has been created. You can now log in to manage your bookings and membership.
      </Text>
      {memberNumber && (
        <Section style={detailsBox}>
          <Text style={paragraph}>
            <strong>Member number:</strong> {memberNumber}
          </Text>
        </Section>
      )}
      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Link href={loginUrl} style={button}>
          Log in to your account
        </Link>
      </Section>
      <Text style={paragraph}>
        If you have any questions, please contact your club administrator.
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
