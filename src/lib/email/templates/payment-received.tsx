import { Text, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type PaymentReceivedEmailProps = {
  orgName: string;
  bookingReference: string;
  amountCents: number;
  paidDate: string;
  logoUrl?: string;
};

export function PaymentReceivedEmail({
  orgName,
  bookingReference,
  amountCents,
  paidDate,
  logoUrl,
}: PaymentReceivedEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Payment Received</Text>
      <Text style={paragraph}>
        Thank you! We have received your payment. Your booking is now confirmed.
      </Text>
      <Section style={detailsBox}>
        <Text style={paragraph}>
          <strong>Booking reference:</strong> {bookingReference}
        </Text>
        <Text style={paragraph}>
          <strong>Amount paid:</strong> {formatCurrency(amountCents)}
        </Text>
        <Text style={paragraph}>
          <strong>Payment date:</strong> {formatDate(paidDate)}
        </Text>
      </Section>
      <Text style={paragraph}>
        Please keep this email as your receipt. If you have any questions, contact your club administrator.
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
