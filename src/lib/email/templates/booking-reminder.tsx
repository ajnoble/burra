import { Text, Section } from "@react-email/components";
import { EmailLayout } from "./layout";

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type Guest = { firstName: string; lastName: string };

type BookingReminderEmailProps = {
  orgName: string;
  bookingReference: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  guests: Guest[];
  logoUrl?: string;
};

export function BookingReminderEmail({
  orgName,
  bookingReference,
  lodgeName,
  checkInDate,
  checkOutDate,
  guests,
  logoUrl,
}: BookingReminderEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Your Stay is Coming Up!</Text>
      <Text style={paragraph}>
        This is a reminder that your stay at {lodgeName} is coming up soon.
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
          <strong>Guests:</strong>{" "}
          {guests.map((g) => `${g.firstName} ${g.lastName}`).join(", ")}
        </Text>
      </Section>
      <Text style={paragraph}>We look forward to seeing you. Have a great trip!</Text>
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
