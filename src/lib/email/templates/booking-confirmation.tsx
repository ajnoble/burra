import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type Guest = { firstName: string; lastName: string };

type BookingConfirmationEmailProps = {
  orgName: string;
  bookingReference: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  guests: Guest[];
  totalAmountCents: number;
  payUrl: string;
  logoUrl?: string;
};

export function BookingConfirmationEmail({
  orgName,
  bookingReference,
  lodgeName,
  checkInDate,
  checkOutDate,
  totalNights,
  guests,
  totalAmountCents,
  payUrl,
  logoUrl,
}: BookingConfirmationEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Booking Confirmation</Text>
      <Text style={paragraph}>Your booking has been confirmed. Here are the details:</Text>
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
          <strong>Nights:</strong> {totalNights}
        </Text>
        <Text style={paragraph}>
          <strong>Guests:</strong>{" "}
          {guests.map((g) => `${g.firstName} ${g.lastName}`).join(", ")}
        </Text>
        <Text style={paragraph}>
          <strong>Total amount:</strong> {formatCurrency(totalAmountCents)}
        </Text>
      </Section>
      <Text style={paragraph}>
        Please complete your payment to confirm your stay.
      </Text>
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
