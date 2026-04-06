import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { PaymentReceivedEmail } from "../templates/payment-received";

describe("PaymentReceivedEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    bookingReference: "BK-2024-006",
    amountCents: 84000,
    paidDate: "2024-05-15",
  };

  it("renders booking reference", async () => {
    const html = await render(React.createElement(PaymentReceivedEmail, baseProps));
    expect(html).toContain("BK-2024-006");
  });

  it("renders formatted amount", async () => {
    const html = await render(React.createElement(PaymentReceivedEmail, baseProps));
    expect(html).toContain("$840.00");
  });

  it("renders paid date", async () => {
    const html = await render(React.createElement(PaymentReceivedEmail, baseProps));
    expect(html).toContain("2024");
  });
});
