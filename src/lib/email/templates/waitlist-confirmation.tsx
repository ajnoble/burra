import { Text, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatDate } from "../format";

type WaitlistConfirmationEmailProps = {
  orgName: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfGuests: number;
  logoUrl?: string;
};

export function WaitlistConfirmationEmail({
  orgName,
  lodgeName,
  checkInDate,
  checkOutDate,
  numberOfGuests,
  logoUrl,
}: WaitlistConfirmationEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Waitlist Confirmation</Text>
      <Text style={paragraph}>
        You have been added to the waitlist for your requested dates. We will
        notify you if a spot becomes available.
      </Text>
      <Section style={detailsBox}>
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
          <strong>Guests:</strong> {numberOfGuests}
        </Text>
      </Section>
      <Text style={paragraph}>
        No action is needed at this time. We will contact you if availability
        opens up for your requested dates.
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
