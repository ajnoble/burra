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

type BookingCancelledEmailProps = {
  orgName: string;
  bookingReference: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  reason?: string;
  refundAmountCents?: number;
  logoUrl?: string;
};

export function BookingCancelledEmail({
  orgName,
  bookingReference,
  lodgeName,
  checkInDate,
  checkOutDate,
  reason,
  refundAmountCents,
  logoUrl,
}: BookingCancelledEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Booking Cancelled</Text>
      <Text style={paragraph}>
        Your booking has been cancelled. Here are the details:
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
        {reason && (
          <Text style={paragraph}>
            <strong>Reason:</strong> {reason}
          </Text>
        )}
        {refundAmountCents !== undefined && (
          <Text style={paragraph}>
            <strong>Refund amount:</strong> {formatCurrency(refundAmountCents)}
          </Text>
        )}
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
