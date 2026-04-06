import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";

type PaymentExpiredEmailProps = {
  orgName: string;
  bookingReference: string;
  amountCents: number;
  payUrl: string;
  logoUrl?: string;
};

export function PaymentExpiredEmail({
  orgName,
  bookingReference,
  amountCents,
  payUrl,
  logoUrl,
}: PaymentExpiredEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Payment Link Expired</Text>
      <Text style={paragraph}>
        Your payment link has expired. Please use the button below to generate a new payment link
        and complete your booking.
      </Text>
      <Section style={detailsBox}>
        <Text style={paragraph}>
          <strong>Booking reference:</strong> {bookingReference}
        </Text>
        <Text style={paragraph}>
          <strong>Amount due:</strong> {formatCurrency(amountCents)}
        </Text>
      </Section>
      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Link href={payUrl} style={button}>
          Pay now
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
