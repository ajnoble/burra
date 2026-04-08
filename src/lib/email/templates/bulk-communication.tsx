import { Section } from "@react-email/components";
import { EmailLayout } from "./layout";

type BulkCommunicationEmailProps = {
  orgName: string;
  /** HTML content - MUST be pre-sanitized via renderMarkdown() before passing here */
  bodyHtml: string;
  logoUrl?: string;
};

export function BulkCommunicationEmail({
  orgName,
  bodyHtml,
  logoUrl,
}: BulkCommunicationEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Section>
        {/* bodyHtml is always pre-sanitized via renderMarkdown() with DOMPurify */}
        <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      </Section>
    </EmailLayout>
  );
}
