import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "../format";

type BookingPaymentReminderEmailProps = {
  orgName: string;
  bookingReference: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  totalAmountCents: number;
  balanceDueDate: string;
  daysRemaining: number;
  payUrl: string;
  logoUrl?: string;
};

export function BookingPaymentReminderEmail({
  orgName,
  bookingReference,
  lodgeName,
  checkInDate,
  checkOutDate,
  totalAmountCents,
  balanceDueDate,
  daysRemaining,
  payUrl,
  logoUrl,
}: BookingPaymentReminderEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Payment Reminder</Text>
      <Text style={paragraph}>
        Your booking at {lodgeName} has a payment of{" "}
        {formatCurrency(totalAmountCents)} due on {formatDate(balanceDueDate)} ({`${daysRemaining} days`} remaining).
      </Text>
      <Section style={detailsBox}>
        <Text style={paragraph}>
          <strong>Booking reference:</strong> {bookingReference}
        </Text>
        <Text style={paragraph}>
          <strong>Lodge:</strong> {lodgeName}
        </Text>
        <Text style={paragraph}>
          <strong>Check-in:</strong> {formatDate(checkInDate)}
        </Text>
        <Text style={paragraph}>
          <strong>Check-out:</strong> {formatDate(checkOutDate)}
        </Text>
        <Text style={paragraph}>
          <strong>Amount due:</strong> {formatCurrency(totalAmountCents)}
        </Text>
        <Text style={paragraph}>
          <strong>Due date:</strong> {formatDate(balanceDueDate)}
        </Text>
      </Section>
      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Link href={payUrl} style={button}>
          Pay Now
        </Link>
      </Section>
      <Text style={paragraph}>
        If payment is not received by the due date, your booking may be
        automatically cancelled after the grace period.
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
