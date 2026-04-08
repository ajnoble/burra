import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "../format";

type MembershipRenewalDueEmailProps = {
  orgName: string;
  seasonName: string;
  amountCents: number;
  dueDate: string;
  payUrl: string;
  logoUrl?: string;
  gstEnabled?: boolean;
};

export function MembershipRenewalDueEmail({
  orgName,
  seasonName,
  amountCents,
  dueDate,
  payUrl,
  logoUrl,
  gstEnabled,
}: MembershipRenewalDueEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Membership Renewal Due</Text>
      <Text style={paragraph}>
        It is time to renew your membership for the upcoming season. Please complete your renewal
        to continue enjoying access to club facilities and bookings.
      </Text>
      <Section style={detailsBox}>
        <Text style={paragraph}>
          <strong>Season:</strong> {seasonName}
        </Text>
        <Text style={paragraph}>
          <strong>Amount due:</strong> {formatCurrency(amountCents)}{gstEnabled ? " (incl. GST)" : ""}
        </Text>
        <Text style={paragraph}>
          <strong>Due date:</strong> {formatDate(dueDate)}
        </Text>
      </Section>
      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Link href={payUrl} style={button}>
          Renew now
        </Link>
      </Section>
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
