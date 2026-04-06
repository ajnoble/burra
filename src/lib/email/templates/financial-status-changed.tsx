import { Text, Section } from "@react-email/components";
import { EmailLayout } from "./layout";

type FinancialStatusChangedEmailProps = {
  orgName: string;
  firstName: string;
  isFinancial: boolean;
  reason: string;
  logoUrl?: string;
};

export function FinancialStatusChangedEmail({
  orgName,
  firstName,
  isFinancial,
  reason,
  logoUrl,
}: FinancialStatusChangedEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Membership Status Updated</Text>
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>
        Your membership status has been updated. You are now{" "}
        <strong>{isFinancial ? "financial" : "unfinancial"}</strong>.
      </Text>
      <Section style={detailsBox}>
        <Text style={paragraph}>
          <strong>Reason:</strong> {reason}
        </Text>
      </Section>
      {!isFinancial && (
        <Text style={paragraph}>
          Being unfinancial may affect your ability to make bookings. Please contact your club
          administrator if you have any questions.
        </Text>
      )}
      {isFinancial && (
        <Text style={paragraph}>
          You now have full access to make bookings and use club facilities.
        </Text>
      )}
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
