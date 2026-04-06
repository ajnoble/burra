import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Img,
  Hr,
} from "@react-email/components";
import type { ReactNode } from "react";

type EmailLayoutProps = {
  orgName: string;
  logoUrl?: string;
  children: ReactNode;
};

export function EmailLayout({ orgName, logoUrl, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            {logoUrl && (
              <Img src={logoUrl} alt={orgName} width={48} height={48} style={logo} />
            )}
            <Text style={orgNameStyle}>{orgName}</Text>
          </Section>
          <Hr style={divider} />
          <Section style={content}>{children}</Section>
          <Hr style={divider} />
          <Section style={footer}>
            <Text style={footerText}>
              {orgName} — Powered by Snow Gum
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#ffffff",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  color: "#111111",
};

const container = {
  maxWidth: "600px",
  margin: "0 auto",
  padding: "24px",
};

const header = {
  textAlign: "center" as const,
  marginBottom: "8px",
};

const logo = {
  margin: "0 auto 8px",
  borderRadius: "8px",
};

const orgNameStyle = {
  fontSize: "18px",
  fontWeight: "600" as const,
  margin: "0",
};

const content = {
  padding: "16px 0",
};

const divider = {
  borderColor: "#e5e5e5",
  margin: "0",
};

const footer = {
  textAlign: "center" as const,
  marginTop: "8px",
};

const footerText = {
  fontSize: "12px",
  color: "#666666",
  margin: "0",
};
