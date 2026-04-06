import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { PaymentExpiredEmail } from "../templates/payment-expired";

describe("PaymentExpiredEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    bookingReference: "BK-2024-007",
    amountCents: 84000,
    payUrl: "https://app.snowgum.site/pay/BK-2024-007",
  };

  it("renders booking reference", async () => {
    const html = await render(React.createElement(PaymentExpiredEmail, baseProps));
    expect(html).toContain("BK-2024-007");
  });

  it("renders formatted amount", async () => {
    const html = await render(React.createElement(PaymentExpiredEmail, baseProps));
    expect(html).toContain("$840.00");
  });

  it("renders pay link", async () => {
    const html = await render(React.createElement(PaymentExpiredEmail, baseProps));
    expect(html).toContain("https://app.snowgum.site/pay/BK-2024-007");
  });

  it("renders expired text", async () => {
    const html = await render(React.createElement(PaymentExpiredEmail, baseProps));
    expect(html).toContain("expired");
  });
});
