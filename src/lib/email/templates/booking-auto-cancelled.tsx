import { Text, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "../format";

type BookingAutoCancelledEmailProps = {
  orgName: string;
  bookingReference: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  totalAmountCents: number;
  refundAmountCents?: number;
  logoUrl?: string;
};

export function BookingAutoCancelledEmail({
  orgName,
  bookingReference,
  lodgeName,
  checkInDate,
  checkOutDate,
  totalAmountCents,
  refundAmountCents,
  logoUrl,
}: BookingAutoCancelledEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Booking Auto-Cancelled</Text>
      <Text style={paragraph}>
        Your booking has been automatically cancelled because payment was not
        received by the payment deadline.
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
          <strong>Amount:</strong> {formatCurrency(totalAmountCents)}
        </Text>
        {refundAmountCents !== undefined && refundAmountCents > 0 && (
          <Text style={paragraph}>
            <strong>Refund amount:</strong> {formatCurrency(refundAmountCents)}
          </Text>
        )}
      </Section>
      <Text style={paragraph}>
        If you believe this was in error, please contact your club administrator.
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
