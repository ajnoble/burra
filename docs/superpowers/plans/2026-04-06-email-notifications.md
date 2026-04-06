# Phase 8: Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 transactional email templates using Resend + React Email, with fire-and-forget delivery wired into existing booking, payment, and member actions.

**Architecture:** Monolithic email module at `src/lib/email/` with a Resend client singleton, a shared React Email layout component, 12 template components, and a `sendEmail()` fire-and-forget helper. Emails are triggered inline from existing server actions without awaiting. Schema adds `bookingReminderHours` to organisations.

**Tech Stack:** Resend, @react-email/components, React 19, Vitest

---

## File Structure

```
src/lib/email/
  client.ts              — Resend client singleton (lazy-init, reads RESEND_API_KEY)
  send.ts                — sendEmail() fire-and-forget helper
  types.ts               — shared types for template props
  templates/
    layout.tsx           — shared base layout (logo, footer, typography)
    welcome.tsx
    booking-confirmation.tsx
    booking-cancelled.tsx
    booking-approved.tsx
    booking-modified.tsx
    booking-reminder.tsx
    payment-received.tsx
    payment-expired.tsx
    membership-renewal-due.tsx
    financial-status-changed.tsx
    admin-booking-notification.tsx
    general-notification.tsx
  __tests__/
    send.test.ts
    layout.test.ts
    welcome.test.ts
    booking-confirmation.test.ts
    booking-cancelled.test.ts
    booking-approved.test.ts
    booking-modified.test.ts
    booking-reminder.test.ts
    payment-received.test.ts
    payment-expired.test.ts
    membership-renewal-due.test.ts
    financial-status-changed.test.ts
    admin-booking-notification.test.ts
    general-notification.test.ts
```

**Modified files:**
- `src/db/schema/organisations.ts` — add `bookingReminderHours` column
- `src/actions/members/create.ts` — add Welcome email after member insert
- `src/actions/members/financial.ts` — add Financial Status Changed email
- `src/actions/bookings/create.ts` — add Booking Confirmation + Admin Notification emails
- `src/actions/stripe/webhook-handlers.ts` — add Payment Received email, add expired handler
- `src/app/api/webhooks/stripe/route.ts` — wire up expired handler

---

### Task 1: Install packages and add schema column

**Files:**
- Modify: `package.json`
- Modify: `src/db/schema/organisations.ts:1-27`

- [ ] **Step 1: Install Resend and React Email**

```bash
cd /opt/snowgum && npm install resend @react-email/components
```

- [ ] **Step 2: Add bookingReminderHours to organisations schema**

In `src/db/schema/organisations.ts`, add after the `platformFeeBps` line:

```ts
bookingReminderHours: integer("booking_reminder_hours").notNull().default(48),
```

- [ ] **Step 3: Generate and apply migration**

```bash
npm run db:generate
npm run db:migrate
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/db/schema/organisations.ts drizzle/
git commit -m "feat: install Resend + React Email, add bookingReminderHours column"
```

---

### Task 2: Resend client and sendEmail helper

**Files:**
- Create: `src/lib/email/client.ts`
- Create: `src/lib/email/send.ts`
- Create: `src/lib/email/types.ts`
- Create: `src/lib/email/__tests__/send.test.ts`

- [ ] **Step 1: Write failing tests for sendEmail**

Create `src/lib/email/__tests__/send.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("../client", () => ({
  getResendClient: () => ({
    emails: { send: mockSend },
  }),
}));

// Must import after mock
import { sendEmail } from "../send";
import React from "react";

describe("sendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  it("calls resend with correct from, to, subject, and react component", async () => {
    const template = React.createElement("div", null, "Hello");

    sendEmail({
      to: "member@example.com",
      subject: "Test Subject",
      template,
      orgName: "Polski Ski Club",
    });

    // Allow microtask to run
    await new Promise((r) => setTimeout(r, 0));

    expect(mockSend).toHaveBeenCalledWith({
      from: "Polski Ski Club via Snow Gum <noreply@snowgum.site>",
      to: "member@example.com",
      subject: "Test Subject",
      react: template,
      replyTo: undefined,
    });
  });

  it("uses replyTo when provided", async () => {
    const template = React.createElement("div", null, "Hello");

    sendEmail({
      to: "member@example.com",
      subject: "Test",
      template,
      orgName: "Alpine Club",
      replyTo: "admin@alpineclub.com.au",
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: "admin@alpineclub.com.au",
      })
    );
  });

  it("falls back to 'Snow Gum' when orgName not provided", async () => {
    const template = React.createElement("div", null, "Hello");

    sendEmail({
      to: "member@example.com",
      subject: "Test",
      template,
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Snow Gum <noreply@snowgum.site>",
      })
    );
  });

  it("catches errors without throwing", async () => {
    mockSend.mockRejectedValue(new Error("API down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const template = React.createElement("div", null, "Hello");

    sendEmail({
      to: "member@example.com",
      subject: "Test",
      template,
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(consoleSpy).toHaveBeenCalledWith(
      "[email] Failed to send:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("accepts an array of recipients", async () => {
    const template = React.createElement("div", null, "Hello");

    sendEmail({
      to: ["a@example.com", "b@example.com"],
      subject: "Test",
      template,
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["a@example.com", "b@example.com"],
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/send.test.ts
```

Expected: FAIL — modules not found

- [ ] **Step 3: Create types file**

Create `src/lib/email/types.ts`:

```ts
import type { ReactElement } from "react";

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  template: ReactElement;
  replyTo?: string;
  orgName?: string;
};
```

- [ ] **Step 4: Create Resend client singleton**

Create `src/lib/email/client.ts`:

```ts
import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}
```

- [ ] **Step 5: Create sendEmail helper**

Create `src/lib/email/send.ts`:

```ts
import { getResendClient } from "./client";
import type { SendEmailOptions } from "./types";

export function sendEmail(options: SendEmailOptions): void {
  const { to, subject, template, replyTo, orgName } = options;
  const displayName = orgName ? `${orgName} via Snow Gum` : "Snow Gum";
  const from = `${displayName} <noreply@snowgum.site>`;

  const resend = getResendClient();

  resend.emails
    .send({
      from,
      to,
      subject,
      react: template,
      replyTo,
    })
    .catch((error) => {
      console.error("[email] Failed to send:", error);
    });
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/send.test.ts
```

Expected: all 5 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/email/
git commit -m "feat: add Resend client singleton and sendEmail fire-and-forget helper"
```

---

### Task 3: Base layout component

**Files:**
- Create: `src/lib/email/templates/layout.tsx`
- Create: `src/lib/email/__tests__/layout.test.ts`

- [ ] **Step 1: Write failing tests for layout**

Create `src/lib/email/__tests__/layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { EmailLayout } from "../templates/layout";

describe("EmailLayout", () => {
  it("renders org name in header", async () => {
    const html = await render(
      React.createElement(
        EmailLayout,
        { orgName: "Polski Ski Club" },
        React.createElement("p", null, "Content here")
      )
    );
    expect(html).toContain("Polski Ski Club");
  });

  it("renders children content", async () => {
    const html = await render(
      React.createElement(
        EmailLayout,
        { orgName: "Test Club" },
        React.createElement("p", null, "Unique test content XYZ")
      )
    );
    expect(html).toContain("Unique test content XYZ");
  });

  it("renders logo image when logoUrl is provided", async () => {
    const html = await render(
      React.createElement(
        EmailLayout,
        { orgName: "Test Club", logoUrl: "https://example.com/logo.png" },
        React.createElement("p", null, "Content")
      )
    );
    expect(html).toContain("https://example.com/logo.png");
  });

  it("omits logo image when logoUrl is not provided", async () => {
    const html = await render(
      React.createElement(
        EmailLayout,
        { orgName: "Test Club" },
        React.createElement("p", null, "Content")
      )
    );
    expect(html).not.toContain("<img");
  });

  it("renders footer with Powered by Snow Gum", async () => {
    const html = await render(
      React.createElement(
        EmailLayout,
        { orgName: "Test Club" },
        React.createElement("p", null, "Content")
      )
    );
    expect(html).toContain("Powered by Snow Gum");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/layout.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create layout component**

Create `src/lib/email/templates/layout.tsx`:

```tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/layout.test.ts
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/layout.tsx src/lib/email/__tests__/layout.test.ts
git commit -m "feat: add shared email layout component with logo, header, footer"
```

---

### Task 4: Welcome email template

**Files:**
- Create: `src/lib/email/templates/welcome.tsx`
- Create: `src/lib/email/__tests__/welcome.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/email/__tests__/welcome.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { WelcomeEmail } from "../templates/welcome";

describe("WelcomeEmail", () => {
  const defaultProps = {
    orgName: "Polski Ski Club",
    firstName: "Jan",
    loginUrl: "https://snowgum.site/polski/login",
  };

  it("renders welcome greeting with first name", async () => {
    const html = await render(React.createElement(WelcomeEmail, defaultProps));
    expect(html).toContain("Jan");
    expect(html).toContain("Welcome");
  });

  it("renders org name", async () => {
    const html = await render(React.createElement(WelcomeEmail, defaultProps));
    expect(html).toContain("Polski Ski Club");
  });

  it("renders login link", async () => {
    const html = await render(React.createElement(WelcomeEmail, defaultProps));
    expect(html).toContain("https://snowgum.site/polski/login");
  });

  it("renders member number when provided", async () => {
    const html = await render(
      React.createElement(WelcomeEmail, { ...defaultProps, memberNumber: "PSK-042" })
    );
    expect(html).toContain("PSK-042");
  });

  it("omits member number section when not provided", async () => {
    const html = await render(React.createElement(WelcomeEmail, defaultProps));
    expect(html).not.toContain("Member number");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/welcome.test.ts
```

- [ ] **Step 3: Create welcome template**

Create `src/lib/email/templates/welcome.tsx`:

```tsx
import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";

type WelcomeEmailProps = {
  orgName: string;
  firstName: string;
  loginUrl: string;
  memberNumber?: string;
  logoUrl?: string;
};

export function WelcomeEmail({
  orgName,
  firstName,
  loginUrl,
  memberNumber,
  logoUrl,
}: WelcomeEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Welcome, {firstName}!</Text>
      <Text style={paragraph}>
        You've been added as a member of {orgName}. You can now log in to view
        availability, make bookings, and manage your membership.
      </Text>
      {memberNumber && (
        <Text style={paragraph}>
          Member number: <strong>{memberNumber}</strong>
        </Text>
      )}
      <Section style={buttonContainer}>
        <Link href={loginUrl} style={button}>
          Log in to your account
        </Link>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "600" as const,
  margin: "0 0 16px",
};

const paragraph = {
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const buttonContainer = {
  margin: "24px 0",
};

const button = {
  backgroundColor: "#111111",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: "500" as const,
  textDecoration: "none",
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/welcome.test.ts
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/welcome.tsx src/lib/email/__tests__/welcome.test.ts
git commit -m "feat: add Welcome email template"
```

---

### Task 5: Booking Confirmation email template

**Files:**
- Create: `src/lib/email/templates/booking-confirmation.tsx`
- Create: `src/lib/email/__tests__/booking-confirmation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/email/__tests__/booking-confirmation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { BookingConfirmationEmail } from "../templates/booking-confirmation";

describe("BookingConfirmationEmail", () => {
  const defaultProps = {
    orgName: "Polski Ski Club",
    bookingReference: "PSKI-2027-0042",
    lodgeName: "Mount Buller Lodge",
    checkInDate: "2027-07-15",
    checkOutDate: "2027-07-18",
    totalNights: 3,
    guests: [
      { firstName: "Jan", lastName: "Kowalski" },
      { firstName: "Anna", lastName: "Kowalski" },
    ],
    totalAmountCents: 84000,
    payUrl: "https://snowgum.site/polski/dashboard",
  };

  it("renders booking reference", async () => {
    const html = await render(
      React.createElement(BookingConfirmationEmail, defaultProps)
    );
    expect(html).toContain("PSKI-2027-0042");
  });

  it("renders lodge name and dates", async () => {
    const html = await render(
      React.createElement(BookingConfirmationEmail, defaultProps)
    );
    expect(html).toContain("Mount Buller Lodge");
    expect(html).toContain("15 Jul 2027");
    expect(html).toContain("18 Jul 2027");
  });

  it("renders guest names", async () => {
    const html = await render(
      React.createElement(BookingConfirmationEmail, defaultProps)
    );
    expect(html).toContain("Jan Kowalski");
    expect(html).toContain("Anna Kowalski");
  });

  it("renders formatted total amount", async () => {
    const html = await render(
      React.createElement(BookingConfirmationEmail, defaultProps)
    );
    expect(html).toContain("$840.00");
  });

  it("renders pay link", async () => {
    const html = await render(
      React.createElement(BookingConfirmationEmail, defaultProps)
    );
    expect(html).toContain("https://snowgum.site/polski/dashboard");
  });

  it("renders number of nights", async () => {
    const html = await render(
      React.createElement(BookingConfirmationEmail, defaultProps)
    );
    expect(html).toContain("3 nights");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/booking-confirmation.test.ts
```

- [ ] **Step 3: Create booking confirmation template**

Create `src/lib/email/templates/booking-confirmation.tsx`:

```tsx
import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";

type Guest = {
  firstName: string;
  lastName: string;
};

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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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
      <Text style={heading}>Booking Confirmed</Text>
      <Text style={paragraph}>
        Your booking <strong>{bookingReference}</strong> has been confirmed.
      </Text>
      <Section style={detailsBox}>
        <Text style={detail}>
          <strong>Lodge:</strong> {lodgeName}
        </Text>
        <Text style={detail}>
          <strong>Check-in:</strong> {formatDate(checkInDate)}
        </Text>
        <Text style={detail}>
          <strong>Check-out:</strong> {formatDate(checkOutDate)}
        </Text>
        <Text style={detail}>
          <strong>Duration:</strong> {totalNights} night{totalNights !== 1 ? "s" : ""}
        </Text>
        <Text style={detail}>
          <strong>Guests:</strong>{" "}
          {guests.map((g) => `${g.firstName} ${g.lastName}`).join(", ")}
        </Text>
        <Text style={detail}>
          <strong>Total:</strong> {formatCurrency(totalAmountCents)}
        </Text>
      </Section>
      <Section style={buttonContainer}>
        <Link href={payUrl} style={button}>
          View booking &amp; pay
        </Link>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "600" as const,
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

const detail = {
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 8px",
};

const buttonContainer = {
  margin: "24px 0",
};

const button = {
  backgroundColor: "#111111",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: "500" as const,
  textDecoration: "none",
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/booking-confirmation.test.ts
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/booking-confirmation.tsx src/lib/email/__tests__/booking-confirmation.test.ts
git commit -m "feat: add Booking Confirmation email template"
```

---

### Task 6: Booking Cancelled, Approved, Modified email templates

**Files:**
- Create: `src/lib/email/templates/booking-cancelled.tsx`
- Create: `src/lib/email/templates/booking-approved.tsx`
- Create: `src/lib/email/templates/booking-modified.tsx`
- Create: `src/lib/email/__tests__/booking-cancelled.test.ts`
- Create: `src/lib/email/__tests__/booking-approved.test.ts`
- Create: `src/lib/email/__tests__/booking-modified.test.ts`

- [ ] **Step 1: Write failing tests for Booking Cancelled**

Create `src/lib/email/__tests__/booking-cancelled.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { BookingCancelledEmail } from "../templates/booking-cancelled";

describe("BookingCancelledEmail", () => {
  const defaultProps = {
    orgName: "Polski Ski Club",
    bookingReference: "PSKI-2027-0042",
    lodgeName: "Mount Buller Lodge",
    checkInDate: "2027-07-15",
    checkOutDate: "2027-07-18",
  };

  it("renders booking reference", async () => {
    const html = await render(
      React.createElement(BookingCancelledEmail, defaultProps)
    );
    expect(html).toContain("PSKI-2027-0042");
  });

  it("renders lodge and dates", async () => {
    const html = await render(
      React.createElement(BookingCancelledEmail, defaultProps)
    );
    expect(html).toContain("Mount Buller Lodge");
    expect(html).toContain("15 Jul 2027");
  });

  it("renders refund amount when provided", async () => {
    const html = await render(
      React.createElement(BookingCancelledEmail, {
        ...defaultProps,
        refundAmountCents: 42000,
      })
    );
    expect(html).toContain("$420.00");
  });

  it("renders cancellation reason when provided", async () => {
    const html = await render(
      React.createElement(BookingCancelledEmail, {
        ...defaultProps,
        reason: "Change of plans",
      })
    );
    expect(html).toContain("Change of plans");
  });

  it("omits refund section when no refund", async () => {
    const html = await render(
      React.createElement(BookingCancelledEmail, defaultProps)
    );
    expect(html).not.toContain("Refund");
  });
});
```

- [ ] **Step 2: Write failing tests for Booking Approved**

Create `src/lib/email/__tests__/booking-approved.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { BookingApprovedEmail } from "../templates/booking-approved";

describe("BookingApprovedEmail", () => {
  const defaultProps = {
    orgName: "Polski Ski Club",
    bookingReference: "PSKI-2027-0042",
    lodgeName: "Mount Buller Lodge",
    checkInDate: "2027-07-15",
    checkOutDate: "2027-07-18",
    payUrl: "https://snowgum.site/polski/dashboard",
  };

  it("renders booking reference", async () => {
    const html = await render(
      React.createElement(BookingApprovedEmail, defaultProps)
    );
    expect(html).toContain("PSKI-2027-0042");
  });

  it("renders approved message", async () => {
    const html = await render(
      React.createElement(BookingApprovedEmail, defaultProps)
    );
    expect(html).toContain("approved");
  });

  it("renders pay link", async () => {
    const html = await render(
      React.createElement(BookingApprovedEmail, defaultProps)
    );
    expect(html).toContain("https://snowgum.site/polski/dashboard");
  });
});
```

- [ ] **Step 3: Write failing tests for Booking Modified**

Create `src/lib/email/__tests__/booking-modified.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { BookingModifiedEmail } from "../templates/booking-modified";

describe("BookingModifiedEmail", () => {
  const defaultProps = {
    orgName: "Polski Ski Club",
    bookingReference: "PSKI-2027-0042",
    lodgeName: "Mount Buller Lodge",
    checkInDate: "2027-07-15",
    checkOutDate: "2027-07-20",
    totalAmountCents: 140000,
    changes: "Dates changed from 15–18 Jul to 15–20 Jul. Total updated.",
  };

  it("renders booking reference", async () => {
    const html = await render(
      React.createElement(BookingModifiedEmail, defaultProps)
    );
    expect(html).toContain("PSKI-2027-0042");
  });

  it("renders changes description", async () => {
    const html = await render(
      React.createElement(BookingModifiedEmail, defaultProps)
    );
    expect(html).toContain("Dates changed from");
  });

  it("renders updated total", async () => {
    const html = await render(
      React.createElement(BookingModifiedEmail, defaultProps)
    );
    expect(html).toContain("$1,400.00");
  });
});
```

- [ ] **Step 4: Run all three test files to verify they fail**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/booking-cancelled.test.ts src/lib/email/__tests__/booking-approved.test.ts src/lib/email/__tests__/booking-modified.test.ts
```

- [ ] **Step 5: Create Booking Cancelled template**

Create `src/lib/email/templates/booking-cancelled.tsx`:

```tsx
import { Text, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";

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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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
        Your booking <strong>{bookingReference}</strong> has been cancelled.
      </Text>
      <Section style={detailsBox}>
        <Text style={detail}>
          <strong>Lodge:</strong> {lodgeName}
        </Text>
        <Text style={detail}>
          <strong>Check-in:</strong> {formatDate(checkInDate)}
        </Text>
        <Text style={detail}>
          <strong>Check-out:</strong> {formatDate(checkOutDate)}
        </Text>
        {reason && (
          <Text style={detail}>
            <strong>Reason:</strong> {reason}
          </Text>
        )}
        {refundAmountCents !== undefined && refundAmountCents > 0 && (
          <Text style={detail}>
            <strong>Refund:</strong> {formatCurrency(refundAmountCents)}
          </Text>
        )}
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "600" as const,
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

const detail = {
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 8px",
};
```

- [ ] **Step 6: Create Booking Approved template**

Create `src/lib/email/templates/booking-approved.tsx`:

```tsx
import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";

type BookingApprovedEmailProps = {
  orgName: string;
  bookingReference: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  payUrl: string;
  logoUrl?: string;
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BookingApprovedEmail({
  orgName,
  bookingReference,
  lodgeName,
  checkInDate,
  checkOutDate,
  payUrl,
  logoUrl,
}: BookingApprovedEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Booking Approved</Text>
      <Text style={paragraph}>
        Your booking <strong>{bookingReference}</strong> has been approved.
      </Text>
      <Section style={detailsBox}>
        <Text style={detail}>
          <strong>Lodge:</strong> {lodgeName}
        </Text>
        <Text style={detail}>
          <strong>Check-in:</strong> {formatDate(checkInDate)}
        </Text>
        <Text style={detail}>
          <strong>Check-out:</strong> {formatDate(checkOutDate)}
        </Text>
      </Section>
      <Section style={buttonContainer}>
        <Link href={payUrl} style={button}>
          View booking &amp; pay
        </Link>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "600" as const,
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

const detail = {
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 8px",
};

const buttonContainer = {
  margin: "24px 0",
};

const button = {
  backgroundColor: "#111111",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: "500" as const,
  textDecoration: "none",
};
```

- [ ] **Step 7: Create Booking Modified template**

Create `src/lib/email/templates/booking-modified.tsx`:

```tsx
import { Text, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";

type BookingModifiedEmailProps = {
  orgName: string;
  bookingReference: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  totalAmountCents: number;
  changes: string;
  logoUrl?: string;
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BookingModifiedEmail({
  orgName,
  bookingReference,
  lodgeName,
  checkInDate,
  checkOutDate,
  totalAmountCents,
  changes,
  logoUrl,
}: BookingModifiedEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Booking Updated</Text>
      <Text style={paragraph}>
        Your booking <strong>{bookingReference}</strong> has been updated by an administrator.
      </Text>
      <Text style={paragraph}>{changes}</Text>
      <Section style={detailsBox}>
        <Text style={detail}>
          <strong>Lodge:</strong> {lodgeName}
        </Text>
        <Text style={detail}>
          <strong>Check-in:</strong> {formatDate(checkInDate)}
        </Text>
        <Text style={detail}>
          <strong>Check-out:</strong> {formatDate(checkOutDate)}
        </Text>
        <Text style={detail}>
          <strong>Updated total:</strong> {formatCurrency(totalAmountCents)}
        </Text>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "600" as const,
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

const detail = {
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 8px",
};
```

- [ ] **Step 8: Run all three test files to verify they pass**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/booking-cancelled.test.ts src/lib/email/__tests__/booking-approved.test.ts src/lib/email/__tests__/booking-modified.test.ts
```

Expected: all 11 tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/email/templates/booking-cancelled.tsx src/lib/email/templates/booking-approved.tsx src/lib/email/templates/booking-modified.tsx src/lib/email/__tests__/booking-cancelled.test.ts src/lib/email/__tests__/booking-approved.test.ts src/lib/email/__tests__/booking-modified.test.ts
git commit -m "feat: add Booking Cancelled, Approved, and Modified email templates"
```

---

### Task 7: Booking Reminder email template

**Files:**
- Create: `src/lib/email/templates/booking-reminder.tsx`
- Create: `src/lib/email/__tests__/booking-reminder.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/email/__tests__/booking-reminder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { BookingReminderEmail } from "../templates/booking-reminder";

describe("BookingReminderEmail", () => {
  const defaultProps = {
    orgName: "Polski Ski Club",
    bookingReference: "PSKI-2027-0042",
    lodgeName: "Mount Buller Lodge",
    checkInDate: "2027-07-15",
    checkOutDate: "2027-07-18",
    guests: [
      { firstName: "Jan", lastName: "Kowalski" },
      { firstName: "Anna", lastName: "Kowalski" },
    ],
  };

  it("renders booking reference", async () => {
    const html = await render(
      React.createElement(BookingReminderEmail, defaultProps)
    );
    expect(html).toContain("PSKI-2027-0042");
  });

  it("renders lodge name and dates", async () => {
    const html = await render(
      React.createElement(BookingReminderEmail, defaultProps)
    );
    expect(html).toContain("Mount Buller Lodge");
    expect(html).toContain("15 Jul 2027");
    expect(html).toContain("18 Jul 2027");
  });

  it("renders guest names", async () => {
    const html = await render(
      React.createElement(BookingReminderEmail, defaultProps)
    );
    expect(html).toContain("Jan Kowalski");
    expect(html).toContain("Anna Kowalski");
  });

  it("contains reminder language", async () => {
    const html = await render(
      React.createElement(BookingReminderEmail, defaultProps)
    );
    expect(html).toContain("coming up");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/booking-reminder.test.ts
```

- [ ] **Step 3: Create booking reminder template**

Create `src/lib/email/templates/booking-reminder.tsx`:

```tsx
import { Text, Section } from "@react-email/components";
import { EmailLayout } from "./layout";

type Guest = {
  firstName: string;
  lastName: string;
};

type BookingReminderEmailProps = {
  orgName: string;
  bookingReference: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  guests: Guest[];
  logoUrl?: string;
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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
      <Text style={heading}>Your stay is coming up</Text>
      <Text style={paragraph}>
        Just a reminder that your booking{" "}
        <strong>{bookingReference}</strong> at {lodgeName} is coming up soon.
      </Text>
      <Section style={detailsBox}>
        <Text style={detail}>
          <strong>Lodge:</strong> {lodgeName}
        </Text>
        <Text style={detail}>
          <strong>Check-in:</strong> {formatDate(checkInDate)}
        </Text>
        <Text style={detail}>
          <strong>Check-out:</strong> {formatDate(checkOutDate)}
        </Text>
        <Text style={detail}>
          <strong>Guests:</strong>{" "}
          {guests.map((g) => `${g.firstName} ${g.lastName}`).join(", ")}
        </Text>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "600" as const,
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

const detail = {
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 8px",
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/booking-reminder.test.ts
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/booking-reminder.tsx src/lib/email/__tests__/booking-reminder.test.ts
git commit -m "feat: add Booking Reminder email template"
```

---

### Task 8: Payment Received and Payment Expired email templates

**Files:**
- Create: `src/lib/email/templates/payment-received.tsx`
- Create: `src/lib/email/templates/payment-expired.tsx`
- Create: `src/lib/email/__tests__/payment-received.test.ts`
- Create: `src/lib/email/__tests__/payment-expired.test.ts`

- [ ] **Step 1: Write failing tests for Payment Received**

Create `src/lib/email/__tests__/payment-received.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { PaymentReceivedEmail } from "../templates/payment-received";

describe("PaymentReceivedEmail", () => {
  const defaultProps = {
    orgName: "Polski Ski Club",
    bookingReference: "PSKI-2027-0042",
    amountCents: 84000,
    paidDate: "2027-06-01",
  };

  it("renders booking reference", async () => {
    const html = await render(
      React.createElement(PaymentReceivedEmail, defaultProps)
    );
    expect(html).toContain("PSKI-2027-0042");
  });

  it("renders formatted amount", async () => {
    const html = await render(
      React.createElement(PaymentReceivedEmail, defaultProps)
    );
    expect(html).toContain("$840.00");
  });

  it("renders payment date", async () => {
    const html = await render(
      React.createElement(PaymentReceivedEmail, defaultProps)
    );
    expect(html).toContain("1 Jun 2027");
  });
});
```

- [ ] **Step 2: Write failing tests for Payment Expired**

Create `src/lib/email/__tests__/payment-expired.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { PaymentExpiredEmail } from "../templates/payment-expired";

describe("PaymentExpiredEmail", () => {
  const defaultProps = {
    orgName: "Polski Ski Club",
    bookingReference: "PSKI-2027-0042",
    amountCents: 84000,
    payUrl: "https://snowgum.site/polski/dashboard",
  };

  it("renders booking reference", async () => {
    const html = await render(
      React.createElement(PaymentExpiredEmail, defaultProps)
    );
    expect(html).toContain("PSKI-2027-0042");
  });

  it("renders amount due", async () => {
    const html = await render(
      React.createElement(PaymentExpiredEmail, defaultProps)
    );
    expect(html).toContain("$840.00");
  });

  it("renders pay link", async () => {
    const html = await render(
      React.createElement(PaymentExpiredEmail, defaultProps)
    );
    expect(html).toContain("https://snowgum.site/polski/dashboard");
  });

  it("contains expired language", async () => {
    const html = await render(
      React.createElement(PaymentExpiredEmail, defaultProps)
    );
    expect(html).toContain("expired");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/payment-received.test.ts src/lib/email/__tests__/payment-expired.test.ts
```

- [ ] **Step 4: Create Payment Received template**

Create `src/lib/email/templates/payment-received.tsx`:

```tsx
import { Text, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";

type PaymentReceivedEmailProps = {
  orgName: string;
  bookingReference: string;
  amountCents: number;
  paidDate: string;
  logoUrl?: string;
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PaymentReceivedEmail({
  orgName,
  bookingReference,
  amountCents,
  paidDate,
  logoUrl,
}: PaymentReceivedEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Payment Received</Text>
      <Text style={paragraph}>
        We've received your payment for booking{" "}
        <strong>{bookingReference}</strong>.
      </Text>
      <Section style={detailsBox}>
        <Text style={detail}>
          <strong>Amount:</strong> {formatCurrency(amountCents)}
        </Text>
        <Text style={detail}>
          <strong>Date:</strong> {formatDate(paidDate)}
        </Text>
        <Text style={detail}>
          <strong>Reference:</strong> {bookingReference}
        </Text>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "600" as const,
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

const detail = {
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 8px",
};
```

- [ ] **Step 5: Create Payment Expired template**

Create `src/lib/email/templates/payment-expired.tsx`:

```tsx
import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";

type PaymentExpiredEmailProps = {
  orgName: string;
  bookingReference: string;
  amountCents: number;
  payUrl: string;
  logoUrl?: string;
};

export function PaymentExpiredEmail({
  orgName,
  bookingReference,
  amountCents,
  payUrl,
  logoUrl,
}: PaymentExpiredEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Payment Session Expired</Text>
      <Text style={paragraph}>
        Your payment session for booking{" "}
        <strong>{bookingReference}</strong> has expired. Don't worry — you can
        start a new payment at any time.
      </Text>
      <Section style={detailsBox}>
        <Text style={detail}>
          <strong>Amount due:</strong> {formatCurrency(amountCents)}
        </Text>
        <Text style={detail}>
          <strong>Reference:</strong> {bookingReference}
        </Text>
      </Section>
      <Section style={buttonContainer}>
        <Link href={payUrl} style={button}>
          Pay now
        </Link>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "600" as const,
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

const detail = {
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 8px",
};

const buttonContainer = {
  margin: "24px 0",
};

const button = {
  backgroundColor: "#111111",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: "500" as const,
  textDecoration: "none",
};
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/payment-received.test.ts src/lib/email/__tests__/payment-expired.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/email/templates/payment-received.tsx src/lib/email/templates/payment-expired.tsx src/lib/email/__tests__/payment-received.test.ts src/lib/email/__tests__/payment-expired.test.ts
git commit -m "feat: add Payment Received and Payment Expired email templates"
```

---

### Task 9: Membership Renewal Due, Financial Status Changed, Admin Booking Notification, and General Notification templates

**Files:**
- Create: `src/lib/email/templates/membership-renewal-due.tsx`
- Create: `src/lib/email/templates/financial-status-changed.tsx`
- Create: `src/lib/email/templates/admin-booking-notification.tsx`
- Create: `src/lib/email/templates/general-notification.tsx`
- Create: `src/lib/email/__tests__/membership-renewal-due.test.ts`
- Create: `src/lib/email/__tests__/financial-status-changed.test.ts`
- Create: `src/lib/email/__tests__/admin-booking-notification.test.ts`
- Create: `src/lib/email/__tests__/general-notification.test.ts`

- [ ] **Step 1: Write failing tests for Membership Renewal Due**

Create `src/lib/email/__tests__/membership-renewal-due.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { MembershipRenewalDueEmail } from "../templates/membership-renewal-due";

describe("MembershipRenewalDueEmail", () => {
  const defaultProps = {
    orgName: "Polski Ski Club",
    seasonName: "2027 Winter Season",
    amountCents: 39900,
    dueDate: "2027-04-30",
    payUrl: "https://snowgum.site/polski/dashboard",
  };

  it("renders season name", async () => {
    const html = await render(
      React.createElement(MembershipRenewalDueEmail, defaultProps)
    );
    expect(html).toContain("2027 Winter Season");
  });

  it("renders formatted amount", async () => {
    const html = await render(
      React.createElement(MembershipRenewalDueEmail, defaultProps)
    );
    expect(html).toContain("$399.00");
  });

  it("renders due date", async () => {
    const html = await render(
      React.createElement(MembershipRenewalDueEmail, defaultProps)
    );
    expect(html).toContain("30 Apr 2027");
  });

  it("renders pay link", async () => {
    const html = await render(
      React.createElement(MembershipRenewalDueEmail, defaultProps)
    );
    expect(html).toContain("https://snowgum.site/polski/dashboard");
  });
});
```

- [ ] **Step 2: Write failing tests for Financial Status Changed**

Create `src/lib/email/__tests__/financial-status-changed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { FinancialStatusChangedEmail } from "../templates/financial-status-changed";

describe("FinancialStatusChangedEmail", () => {
  it("renders financial status when marked financial", async () => {
    const html = await render(
      React.createElement(FinancialStatusChangedEmail, {
        orgName: "Polski Ski Club",
        firstName: "Jan",
        isFinancial: true,
        reason: "Annual subscription paid",
      })
    );
    expect(html).toContain("financial");
    expect(html).toContain("Annual subscription paid");
  });

  it("renders unfinancial status", async () => {
    const html = await render(
      React.createElement(FinancialStatusChangedEmail, {
        orgName: "Polski Ski Club",
        firstName: "Jan",
        isFinancial: false,
        reason: "Subscription overdue",
      })
    );
    expect(html).toContain("unfinancial");
    expect(html).toContain("Subscription overdue");
  });

  it("renders first name", async () => {
    const html = await render(
      React.createElement(FinancialStatusChangedEmail, {
        orgName: "Polski Ski Club",
        firstName: "Jan",
        isFinancial: true,
        reason: "Paid",
      })
    );
    expect(html).toContain("Jan");
  });
});
```

- [ ] **Step 3: Write failing tests for Admin Booking Notification**

Create `src/lib/email/__tests__/admin-booking-notification.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { AdminBookingNotificationEmail } from "../templates/admin-booking-notification";

describe("AdminBookingNotificationEmail", () => {
  const defaultProps = {
    orgName: "Polski Ski Club",
    bookingReference: "PSKI-2027-0042",
    memberName: "Jan Kowalski",
    lodgeName: "Mount Buller Lodge",
    checkInDate: "2027-07-15",
    checkOutDate: "2027-07-18",
    action: "created" as const,
    adminUrl: "https://snowgum.site/polski/admin",
  };

  it("renders booking reference", async () => {
    const html = await render(
      React.createElement(AdminBookingNotificationEmail, defaultProps)
    );
    expect(html).toContain("PSKI-2027-0042");
  });

  it("renders member name", async () => {
    const html = await render(
      React.createElement(AdminBookingNotificationEmail, defaultProps)
    );
    expect(html).toContain("Jan Kowalski");
  });

  it("renders action taken", async () => {
    const html = await render(
      React.createElement(AdminBookingNotificationEmail, defaultProps)
    );
    expect(html).toContain("created");
  });

  it("renders admin link", async () => {
    const html = await render(
      React.createElement(AdminBookingNotificationEmail, defaultProps)
    );
    expect(html).toContain("https://snowgum.site/polski/admin");
  });

  it("renders cancelled action", async () => {
    const html = await render(
      React.createElement(AdminBookingNotificationEmail, {
        ...defaultProps,
        action: "cancelled",
      })
    );
    expect(html).toContain("cancelled");
  });
});
```

- [ ] **Step 4: Write failing tests for General Notification**

Create `src/lib/email/__tests__/general-notification.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { GeneralNotificationEmail } from "../templates/general-notification";

describe("GeneralNotificationEmail", () => {
  const defaultProps = {
    orgName: "Polski Ski Club",
    subject: "Lodge maintenance update",
    body: "The hot water system has been repaired and is now working normally.",
  };

  it("renders subject as heading", async () => {
    const html = await render(
      React.createElement(GeneralNotificationEmail, defaultProps)
    );
    expect(html).toContain("Lodge maintenance update");
  });

  it("renders body text", async () => {
    const html = await render(
      React.createElement(GeneralNotificationEmail, defaultProps)
    );
    expect(html).toContain("hot water system has been repaired");
  });

  it("renders org name in layout", async () => {
    const html = await render(
      React.createElement(GeneralNotificationEmail, defaultProps)
    );
    expect(html).toContain("Polski Ski Club");
  });
});
```

- [ ] **Step 5: Run all four test files to verify they fail**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/membership-renewal-due.test.ts src/lib/email/__tests__/financial-status-changed.test.ts src/lib/email/__tests__/admin-booking-notification.test.ts src/lib/email/__tests__/general-notification.test.ts
```

- [ ] **Step 6: Create Membership Renewal Due template**

Create `src/lib/email/templates/membership-renewal-due.tsx`:

```tsx
import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";

type MembershipRenewalDueEmailProps = {
  orgName: string;
  seasonName: string;
  amountCents: number;
  dueDate: string;
  payUrl: string;
  logoUrl?: string;
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MembershipRenewalDueEmail({
  orgName,
  seasonName,
  amountCents,
  dueDate,
  payUrl,
  logoUrl,
}: MembershipRenewalDueEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Membership Renewal Due</Text>
      <Text style={paragraph}>
        Your membership renewal for {orgName} is due.
      </Text>
      <Section style={detailsBox}>
        <Text style={detail}>
          <strong>Season:</strong> {seasonName}
        </Text>
        <Text style={detail}>
          <strong>Amount:</strong> {formatCurrency(amountCents)}
        </Text>
        <Text style={detail}>
          <strong>Due date:</strong> {formatDate(dueDate)}
        </Text>
      </Section>
      <Section style={buttonContainer}>
        <Link href={payUrl} style={button}>
          Pay now
        </Link>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "600" as const,
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

const detail = {
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 8px",
};

const buttonContainer = {
  margin: "24px 0",
};

const button = {
  backgroundColor: "#111111",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: "500" as const,
  textDecoration: "none",
};
```

- [ ] **Step 7: Create Financial Status Changed template**

Create `src/lib/email/templates/financial-status-changed.tsx`:

```tsx
import { Text, Section } from "@react-email/components";
import { EmailLayout } from "./layout";

type FinancialStatusChangedEmailProps = {
  orgName: string;
  firstName: string;
  isFinancial: boolean;
  reason: string;
  logoUrl?: string;
};

export function FinancialStatusChangedEmail({
  orgName,
  firstName,
  isFinancial,
  reason,
  logoUrl,
}: FinancialStatusChangedEmailProps) {
  const statusLabel = isFinancial ? "financial" : "unfinancial";

  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Membership Status Updated</Text>
      <Text style={paragraph}>
        Hi {firstName}, your membership status with {orgName} has been updated
        to <strong>{statusLabel}</strong>.
      </Text>
      <Section style={detailsBox}>
        <Text style={detail}>
          <strong>New status:</strong> {statusLabel}
        </Text>
        <Text style={detail}>
          <strong>Reason:</strong> {reason}
        </Text>
      </Section>
      {!isFinancial && (
        <Text style={paragraph}>
          While your membership is unfinancial, you may not be able to make new
          bookings. Please contact your club if you have any questions.
        </Text>
      )}
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "600" as const,
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

const detail = {
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 8px",
};
```

- [ ] **Step 8: Create Admin Booking Notification template**

Create `src/lib/email/templates/admin-booking-notification.tsx`:

```tsx
import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";

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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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
      <Text style={heading}>Booking {action}</Text>
      <Text style={paragraph}>
        A booking has been {action} by {memberName}.
      </Text>
      <Section style={detailsBox}>
        <Text style={detail}>
          <strong>Reference:</strong> {bookingReference}
        </Text>
        <Text style={detail}>
          <strong>Member:</strong> {memberName}
        </Text>
        <Text style={detail}>
          <strong>Lodge:</strong> {lodgeName}
        </Text>
        <Text style={detail}>
          <strong>Check-in:</strong> {formatDate(checkInDate)}
        </Text>
        <Text style={detail}>
          <strong>Check-out:</strong> {formatDate(checkOutDate)}
        </Text>
      </Section>
      <Section style={buttonContainer}>
        <Link href={adminUrl} style={button}>
          View in admin
        </Link>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "600" as const,
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

const detail = {
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 8px",
};

const buttonContainer = {
  margin: "24px 0",
};

const button = {
  backgroundColor: "#111111",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: "500" as const,
  textDecoration: "none",
};
```

- [ ] **Step 9: Create General Notification template**

Create `src/lib/email/templates/general-notification.tsx`:

```tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "./layout";

type GeneralNotificationEmailProps = {
  orgName: string;
  subject: string;
  body: string;
  logoUrl?: string;
};

export function GeneralNotificationEmail({
  orgName,
  subject,
  body,
  logoUrl,
}: GeneralNotificationEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>{subject}</Text>
      <Text style={paragraph}>{body}</Text>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "600" as const,
  margin: "0 0 16px",
};

const paragraph = {
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 12px",
  whiteSpace: "pre-wrap" as const,
};
```

- [ ] **Step 10: Run all four test files to verify they pass**

```bash
cd /opt/snowgum && npx vitest run src/lib/email/__tests__/membership-renewal-due.test.ts src/lib/email/__tests__/financial-status-changed.test.ts src/lib/email/__tests__/admin-booking-notification.test.ts src/lib/email/__tests__/general-notification.test.ts
```

Expected: all 15 tests PASS

- [ ] **Step 11: Commit**

```bash
git add src/lib/email/templates/membership-renewal-due.tsx src/lib/email/templates/financial-status-changed.tsx src/lib/email/templates/admin-booking-notification.tsx src/lib/email/templates/general-notification.tsx src/lib/email/__tests__/membership-renewal-due.test.ts src/lib/email/__tests__/financial-status-changed.test.ts src/lib/email/__tests__/admin-booking-notification.test.ts src/lib/email/__tests__/general-notification.test.ts
git commit -m "feat: add Membership Renewal, Financial Status, Admin Notification, and General email templates"
```

---

### Task 10: Wire Welcome email into member creation

**Files:**
- Modify: `src/actions/members/create.ts:1-74`
- Modify: `src/actions/members/__tests__/create.test.ts`

- [ ] **Step 1: Write failing test for Welcome email integration**

Add the following test to the existing `src/actions/members/__tests__/create.test.ts`. First, add the mock at the top level (after existing mocks):

```ts
const mockSendEmail = vi.fn();

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
```

Then add this test case inside the existing describe block:

```ts
it("sends Welcome email after successful member creation", async () => {
  // ... set up mocks for successful creation (member insert returns, orgMember insert succeeds)
  // The exact mock setup depends on the existing test patterns in this file.
  // After the createMember call succeeds:
  expect(mockSendEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "jan@example.com",
      subject: "Welcome to Polski Ski Club",
    })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/members/__tests__/create.test.ts
```

Expected: FAIL — sendEmail not called

- [ ] **Step 3: Add Welcome email to createMember action**

In `src/actions/members/create.ts`, add import at the top:

```ts
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { WelcomeEmail } from "@/lib/email/templates/welcome";
```

After the `organisationMembers` insert (line 66-70), before `revalidatePath`, add:

```ts
  // Send welcome email (fire-and-forget)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  sendEmail({
    to: data.email,
    subject: `Welcome to ${input.slug}`,
    template: React.createElement(WelcomeEmail, {
      orgName: input.slug,
      firstName: data.firstName,
      loginUrl: `${appUrl}/${input.slug}/login`,
      memberNumber: data.memberNumber || undefined,
    }),
  });
```

Note: We use `input.slug` as a stand-in for the org name here. The action doesn't currently query the org — we'll need to fetch the org name and contactEmail. Add this query before the email send:

```ts
  const [org] = await db
    .select({
      name: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));
```

And update the import to include `organisations`:

```ts
import { members, organisationMembers, organisations } from "@/db/schema";
```

Then use `org.name` in the email:

```ts
  sendEmail({
    to: data.email,
    subject: `Welcome to ${org?.name ?? input.slug}`,
    template: React.createElement(WelcomeEmail, {
      orgName: org?.name ?? input.slug,
      firstName: data.firstName,
      loginUrl: `${appUrl}/${input.slug}/login`,
      memberNumber: data.memberNumber || undefined,
      logoUrl: org?.logoUrl || undefined,
    }),
    replyTo: org?.contactEmail || undefined,
    orgName: org?.name ?? input.slug,
  });
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/members/__tests__/create.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/members/create.ts src/actions/members/__tests__/create.test.ts
git commit -m "feat: send Welcome email on member creation"
```

---

### Task 11: Wire Booking Confirmation + Admin Notification into booking creation

**Files:**
- Modify: `src/actions/bookings/create.ts:1-326`
- Modify: `src/actions/bookings/__tests__/create.test.ts`

- [ ] **Step 1: Write failing test for Booking Confirmation email**

In `src/actions/bookings/__tests__/create.test.ts`, add mock at top level:

```ts
const mockSendEmail = vi.fn();

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
```

Add test case:

```ts
it("sends Booking Confirmation and Admin Notification emails on success", async () => {
  // Set up mocks for a successful booking creation
  // After createBooking succeeds:
  expect(mockSendEmail).toHaveBeenCalledTimes(2);
  expect(mockSendEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      subject: expect.stringContaining("Booking confirmed"),
    })
  );
  expect(mockSendEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      subject: expect.stringContaining("[Admin]"),
    })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/bookings/__tests__/create.test.ts
```

- [ ] **Step 3: Add email sends to createBooking**

In `src/actions/bookings/create.ts`, add imports:

```ts
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { BookingConfirmationEmail } from "@/lib/email/templates/booking-confirmation";
import { AdminBookingNotificationEmail } from "@/lib/email/templates/admin-booking-notification";
import { organisations, lodges } from "@/db/schema";
```

After the successful transaction result (before `revalidatePath`), add an org + lodge query and email sends. The booking already has the data needed. Add after `const result = await db.transaction(...)`:

```ts
    // Fetch org and lodge details for email
    const [org] = await db
      .select({
        name: organisations.name,
        contactEmail: organisations.contactEmail,
        logoUrl: organisations.logoUrl,
      })
      .from(organisations)
      .where(eq(organisations.id, data.organisationId));

    const [lodge] = await db
      .select({ name: lodges.name })
      .from(lodges)
      .where(eq(lodges.id, data.lodgeId));

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Send booking confirmation to member
    sendEmail({
      to: session.email,
      subject: `Booking confirmed — ${result.bookingReference}`,
      template: React.createElement(BookingConfirmationEmail, {
        orgName: org?.name ?? slug,
        bookingReference: result.bookingReference,
        lodgeName: lodge?.name ?? "Lodge",
        checkInDate: data.checkInDate,
        checkOutDate: data.checkOutDate,
        totalNights: nights,
        guests: data.guests.map((g) => ({
          firstName: g.firstName ?? "",
          lastName: g.lastName ?? "",
        })),
        totalAmountCents: bookingTotal.totalAmountCents,
        payUrl: `${appUrl}/${slug}/dashboard`,
        logoUrl: org?.logoUrl || undefined,
      }),
      replyTo: org?.contactEmail || undefined,
      orgName: org?.name ?? slug,
    });

    // Send admin notification
    if (org?.contactEmail) {
      sendEmail({
        to: org.contactEmail,
        subject: `[Admin] Booking created — ${result.bookingReference}`,
        template: React.createElement(AdminBookingNotificationEmail, {
          orgName: org.name,
          bookingReference: result.bookingReference,
          memberName: `${session.firstName} ${session.lastName}`,
          lodgeName: lodge?.name ?? "Lodge",
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          action: "created",
          adminUrl: `${appUrl}/${slug}/admin`,
          logoUrl: org.logoUrl || undefined,
        }),
        orgName: org.name,
      });
    }
```

Note: The booking guests in `data.guests` have `memberId` and `bedId` but not names. We need to look up names. The simplest approach: query the member names for the guest memberIds after the transaction. Adjust the guest mapping accordingly:

```ts
    // Get guest names for email
    const guestMembers = await db
      .select({ firstName: members.firstName, lastName: members.lastName })
      .from(members)
      .where(
        sql`${members.id} IN (${sql.join(
          data.guests.map((g) => sql`${g.memberId}`),
          sql`, `
        )})`
      );
```

Then use `guestMembers` instead of `data.guests` in the template props.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/bookings/__tests__/create.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/create.ts src/actions/bookings/__tests__/create.test.ts
git commit -m "feat: send Booking Confirmation and Admin Notification on booking creation"
```

---

### Task 12: Wire Payment Received email into webhook handler

**Files:**
- Modify: `src/actions/stripe/webhook-handlers.ts:1-71`
- Modify: `src/actions/stripe/__tests__/webhook-handlers.test.ts`

- [ ] **Step 1: Write failing test for Payment Received email**

In `src/actions/stripe/__tests__/webhook-handlers.test.ts`, add mock:

```ts
const mockSendEmail = vi.fn();

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
```

Add test case:

```ts
it("sends Payment Received email after recording payment", async () => {
  // Set up mocks for successful payment processing (existing pattern)
  // Check for existing payment — none found
  mockDbSelect.mockReturnValueOnce({
    from: () => ({
      where: () => [],
    }),
  });
  // Get invoice transaction
  mockDbSelect.mockReturnValueOnce({
    from: () => ({
      where: () => [{
        id: "txn-invoice-1",
        organisationId: "org-1",
        memberId: "m-1",
        bookingId: "bkg-1",
        amountCents: 84000,
      }],
    }),
  });
  // Insert payment transaction
  mockDbInsert.mockReturnValue({
    values: () => ({ returning: () => [{ id: "txn-payment-1" }] }),
  });
  // Update booking
  mockDbUpdate.mockReturnValue({
    set: () => ({ where: () => ({}) }),
  });
  // Get booking reference + member email (new query for email)
  mockDbSelect.mockReturnValueOnce({
    from: () => ({
      innerJoin: () => ({
        where: () => [{
          bookingReference: "PSKI-2027-0042",
          email: "jan@example.com",
          orgName: "Polski Ski Club",
          contactEmail: "admin@polski.com",
          logoUrl: null,
        }],
      }),
    }),
  });

  const session = {
    id: "cs_test_123",
    payment_intent: "pi_test_456",
    metadata: {
      transactionId: "txn-invoice-1",
      bookingId: "bkg-1",
      organisationId: "org-1",
    },
    amount_total: 84000,
  };

  await handleCheckoutSessionCompleted(session as unknown as Stripe.Checkout.Session);

  expect(mockSendEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      subject: expect.stringContaining("Payment received"),
    })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/stripe/__tests__/webhook-handlers.test.ts
```

- [ ] **Step 3: Add Payment Received email to webhook handler**

In `src/actions/stripe/webhook-handlers.ts`, add imports:

```ts
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { PaymentReceivedEmail } from "@/lib/email/templates/payment-received";
import { members, organisations } from "@/db/schema";
```

After the booking update (line 70), add:

```ts
  // Get member email, booking ref, and org details for email
  const [emailData] = await db
    .select({
      bookingReference: bookings.bookingReference,
      email: members.email,
      orgName: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(bookings)
    .innerJoin(members, eq(members.id, invoice.memberId))
    .innerJoin(organisations, eq(organisations.id, invoice.organisationId))
    .where(eq(bookings.id, bookingId));

  if (emailData) {
    sendEmail({
      to: emailData.email,
      subject: `Payment received — ${emailData.bookingReference}`,
      template: React.createElement(PaymentReceivedEmail, {
        orgName: emailData.orgName,
        bookingReference: emailData.bookingReference,
        amountCents: amountCents,
        paidDate: new Date().toISOString().split("T")[0],
        logoUrl: emailData.logoUrl || undefined,
      }),
      replyTo: emailData.contactEmail || undefined,
      orgName: emailData.orgName,
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/stripe/__tests__/webhook-handlers.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/stripe/webhook-handlers.ts src/actions/stripe/__tests__/webhook-handlers.test.ts
git commit -m "feat: send Payment Received email from Stripe webhook"
```

---

### Task 13: Wire Payment Expired email into webhook handler

**Files:**
- Modify: `src/actions/stripe/webhook-handlers.ts`
- Modify: `src/app/api/webhooks/stripe/route.ts:1-44`
- Modify: `src/actions/stripe/__tests__/webhook-handlers.test.ts`

- [ ] **Step 1: Write failing test for Payment Expired handler and email**

In `src/actions/stripe/__tests__/webhook-handlers.test.ts`, add:

```ts
import { handleCheckoutSessionExpired } from "../webhook-handlers";

describe("handleCheckoutSessionExpired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends Payment Expired email with pay link", async () => {
    // Get booking + member + org data
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => [{
                bookingReference: "PSKI-2027-0042",
                email: "jan@example.com",
                orgName: "Polski Ski Club",
                contactEmail: "admin@polski.com",
                logoUrl: null,
                slug: "polski",
                amountCents: 84000,
              }],
            }),
          }),
        }),
      }),
    });

    const session = {
      id: "cs_test_expired",
      metadata: {
        transactionId: "txn-invoice-1",
        bookingId: "bkg-1",
        organisationId: "org-1",
      },
    };

    await handleCheckoutSessionExpired(session as unknown as Stripe.Checkout.Session);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("expired"),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/stripe/__tests__/webhook-handlers.test.ts
```

- [ ] **Step 3: Add handleCheckoutSessionExpired to webhook-handlers.ts**

In `src/actions/stripe/webhook-handlers.ts`, add import for PaymentExpiredEmail:

```ts
import { PaymentExpiredEmail } from "@/lib/email/templates/payment-expired";
```

Add the new handler function:

```ts
export async function handleCheckoutSessionExpired(
  session: Stripe.Checkout.Session
): Promise<void> {
  const { transactionId, bookingId, organisationId } = session.metadata ?? {};
  if (!transactionId || !bookingId || !organisationId) return;

  // Get booking, member, and org details for email
  const [data] = await db
    .select({
      bookingReference: bookings.bookingReference,
      email: members.email,
      orgName: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
      slug: organisations.slug,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .innerJoin(bookings, eq(bookings.id, transactions.bookingId))
    .innerJoin(members, eq(members.id, transactions.memberId))
    .innerJoin(organisations, eq(organisations.id, transactions.organisationId))
    .where(eq(transactions.id, transactionId));

  if (!data) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  sendEmail({
    to: data.email,
    subject: `Payment session expired — ${data.bookingReference}`,
    template: React.createElement(PaymentExpiredEmail, {
      orgName: data.orgName,
      bookingReference: data.bookingReference,
      amountCents: data.amountCents,
      payUrl: `${appUrl}/${data.slug}/dashboard`,
      logoUrl: data.logoUrl || undefined,
    }),
    replyTo: data.contactEmail || undefined,
    orgName: data.orgName,
  });
}
```

- [ ] **Step 4: Wire expired handler into webhook route**

In `src/app/api/webhooks/stripe/route.ts`, add import:

```ts
import { handleCheckoutSessionCompleted, handleCheckoutSessionExpired } from "@/actions/stripe/webhook-handlers";
```

Replace the `checkout.session.expired` case:

```ts
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutSessionExpired(session);
      break;
    }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/stripe/__tests__/webhook-handlers.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/actions/stripe/webhook-handlers.ts src/app/api/webhooks/stripe/route.ts src/actions/stripe/__tests__/webhook-handlers.test.ts
git commit -m "feat: send Payment Expired email on checkout session expiry"
```

---

### Task 14: Wire Financial Status Changed email into financial action

**Files:**
- Modify: `src/actions/members/financial.ts:1-51`
- Modify: `src/actions/members/__tests__/financial.test.ts`

- [ ] **Step 1: Write failing test for Financial Status Changed email**

In `src/actions/members/__tests__/financial.test.ts`, add mock:

```ts
const mockSendEmail = vi.fn();

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
```

Add test case:

```ts
it("sends Financial Status Changed email after successful update", async () => {
  // Set up mocks for successful financial status change
  // After updateFinancialStatus succeeds:
  expect(mockSendEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      subject: expect.stringContaining("Membership status updated"),
    })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/members/__tests__/financial.test.ts
```

- [ ] **Step 3: Add email send to updateFinancialStatus**

In `src/actions/members/financial.ts`, add imports:

```ts
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { FinancialStatusChangedEmail } from "@/lib/email/templates/financial-status-changed";
import { organisations } from "@/db/schema";
```

After the `financialStatusChanges` insert (line 41-47), before `revalidatePath`, add:

```ts
  // Fetch org and member details for email
  const [org] = await db
    .select({
      name: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  sendEmail({
    to: updated.email,
    subject: `Membership status updated — ${org?.name ?? input.slug}`,
    template: React.createElement(FinancialStatusChangedEmail, {
      orgName: org?.name ?? input.slug,
      firstName: updated.firstName,
      isFinancial: parsed.data.isFinancial,
      reason: parsed.data.reason,
      logoUrl: org?.logoUrl || undefined,
    }),
    replyTo: org?.contactEmail || undefined,
    orgName: org?.name ?? input.slug,
  });
```

Note: The current `update` returning only returns the row — we need `email` and `firstName` from the updated member. Update the `.returning()` to include these fields, or add them to the select. Since drizzle's `.returning()` returns all columns by default, `updated.email` and `updated.firstName` should already be available.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/members/__tests__/financial.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/members/financial.ts src/actions/members/__tests__/financial.test.ts
git commit -m "feat: send Financial Status Changed email on membership status update"
```

---

### Task 15: Run full quality checks and update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run full test suite**

```bash
cd /opt/snowgum && npm test
```

Expected: all tests PASS (should be ~250+ tests across 40+ files)

- [ ] **Step 2: Run lint**

```bash
cd /opt/snowgum && npm run lint
```

Expected: no errors

- [ ] **Step 3: Run build**

```bash
cd /opt/snowgum && npm run build
```

Expected: build succeeds

- [ ] **Step 4: Update README**

In `README.md`, update the Completed features table to add Phase 8:

```markdown
| 8 | Email Notifications | 12 templates via Resend + React Email, fire-and-forget delivery, admin copy on bookings |
```

Update the Test Coverage section to add email tests:

```markdown
- **Email templates** — all 12 template rendering tests, layout component, sendEmail helper
- **Email integrations** — Welcome on member create, Booking Confirmation on booking create, Payment Received/Expired on webhooks, Financial Status Changed on status update
```

Update the test count in the summary.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README with Phase 8 email notifications"
```

- [ ] **Step 6: Run full quality check one more time**

```bash
cd /opt/snowgum && npm run check
```

Expected: lint + test + build all PASS
