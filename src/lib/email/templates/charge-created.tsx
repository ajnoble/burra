import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "../format";

type ChargeCreatedEmailProps = {
  orgName: string;
  categoryName: string;
  description?: string;
  amountCents: number;
  dueDate?: string;
  payUrl: string;
  logoUrl?: string;
};

export function ChargeCreatedEmail({
  orgName,
  categoryName,
  description,
  amountCents,
  dueDate,
  payUrl,
  logoUrl,
}: ChargeCreatedEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>New Charge</Text>
      <Text style={paragraph}>
        A new charge has been added to your account. Please review the details below and complete
        your payment at your earliest convenience.
      </Text>
      <Section style={detailsBox}>
        <Text style={paragraph}>
          <strong>Category:</strong> {categoryName}
        </Text>
        {description && (
          <Text style={paragraph}>
            <strong>Description:</strong> {description}
          </Text>
        )}
        <Text style={paragraph}>
          <strong>Amount due:</strong> {formatCurrency(amountCents)}
        </Text>
        {dueDate && (
          <Text style={paragraph}>
            <strong>Due date:</strong> {formatDate(dueDate)}
          </Text>
        )}
      </Section>
      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Link href={payUrl} style={button}>
          Pay now
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
