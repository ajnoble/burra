import { Text, Section, Link } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatDate } from "../format";

type WaitlistSpotAvailableEmailProps = {
  orgName: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfGuests: number;
  bookingUrl: string;
  expiresAt: string;
  logoUrl?: string;
};

export function WaitlistSpotAvailableEmail({
  orgName,
  lodgeName,
  checkInDate,
  checkOutDate,
  numberOfGuests,
  bookingUrl,
  expiresAt,
  logoUrl,
}: WaitlistSpotAvailableEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>A Spot Has Opened Up!</Text>
      <Text style={paragraph}>
        Great news! A spot has become available for your waitlisted dates. You
        have until <strong>{expiresAt}</strong> to complete your booking before
        this offer expires.
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
      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Link href={bookingUrl} style={button}>
          Book now
        </Link>
      </Section>
      <Text style={warningText}>
        This offer expires on {expiresAt}. If you do not book by then, the spot
        will be offered to the next person on the waitlist.
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

const warningText = {
  fontSize: "12px",
  color: "#666666",
  lineHeight: "20px",
  margin: "16px 0 0",
};
