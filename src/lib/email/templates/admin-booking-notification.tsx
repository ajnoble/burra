import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatDate } from "../format";

type AdminBookingNotificationEmailProps = {
  orgName: string;
  bookingReference: string;
  memberName: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  action: "created" | "cancelled";
  adminUrl: string;
  logoUrl?: string;
};

export function AdminBookingNotificationEmail({
  orgName,
  bookingReference,
  memberName,
  lodgeName,
  checkInDate,
  checkOutDate,
  action,
  adminUrl,
  logoUrl,
}: AdminBookingNotificationEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Booking {action === "created" ? "Created" : "Cancelled"}</Text>
      <Text style={paragraph}>
        A booking has been {action} by a member. Details below:
      </Text>
      <Section style={detailsBox}>
        <Text style={paragraph}>
          <strong>Booking reference:</strong> {bookingReference}
        </Text>
        <Text style={paragraph}>
          <strong>Member:</strong> {memberName}
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
          <strong>Action:</strong> {action}
        </Text>
      </Section>
      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Link href={adminUrl} style={button}>
          View in admin
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
