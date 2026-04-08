import { Text, Section, Hr } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "../format";

type LineItem = {
  description: string;
  memberName: string;
  amountCents: number;
};

type ConsolidatedPaymentReceivedEmailProps = {
  orgName: string;
  lineItems: LineItem[];
  totalAmountCents: number;
  paidDate: string;
  logoUrl?: string;
  gstEnabled?: boolean;
  totalGstAmountCents?: number;
  abnNumber?: string;
};

export function ConsolidatedPaymentReceivedEmail({
  orgName,
  lineItems,
  totalAmountCents,
  paidDate,
  logoUrl,
  gstEnabled,
  totalGstAmountCents,
  abnNumber,
}: ConsolidatedPaymentReceivedEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Payment Received</Text>
      <Text style={paragraph}>
        Thank you! We have received your payment. Please find a summary of your payment below.
      </Text>
      <Section style={detailsBox}>
        {lineItems.map((item, index) => (
          <Text key={index} style={paragraph}>
            {item.description} ({item.memberName}) — {formatCurrency(item.amountCents)}
          </Text>
        ))}
        <Hr />
        {gstEnabled && totalGstAmountCents ? (
          <>
            <Text style={paragraph}>
              <strong>Subtotal (excl. GST):</strong>{" "}
              {formatCurrency(totalAmountCents - totalGstAmountCents)}
            </Text>
            <Text style={paragraph}>
              <strong>GST (10%):</strong> {formatCurrency(totalGstAmountCents)}
            </Text>
            <Text style={paragraph}>
              <strong>Total:</strong> {formatCurrency(totalAmountCents)}
            </Text>
          </>
        ) : (
          <Text style={paragraph}>
            <strong>Total paid:</strong> {formatCurrency(totalAmountCents)}
          </Text>
        )}
        <Text style={paragraph}>
          <strong>Payment date:</strong> {formatDate(paidDate)}
        </Text>
        {gstEnabled && abnNumber && (
          <Text style={paragraph}>
            <strong>ABN:</strong> {abnNumber}
          </Text>
        )}
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
