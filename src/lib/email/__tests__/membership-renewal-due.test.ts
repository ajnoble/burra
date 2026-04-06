import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { MembershipRenewalDueEmail } from "../templates/membership-renewal-due";

describe("MembershipRenewalDueEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    seasonName: "2024 Winter Season",
    amountCents: 55000,
    dueDate: "2024-04-01",
    payUrl: "https://app.snowgum.site/renew",
  };

  it("renders season name", async () => {
    const html = await render(React.createElement(MembershipRenewalDueEmail, baseProps));
    expect(html).toContain("2024 Winter Season");
  });

  it("renders formatted amount", async () => {
    const html = await render(React.createElement(MembershipRenewalDueEmail, baseProps));
    expect(html).toContain("$550.00");
  });

  it("renders due date", async () => {
    const html = await render(React.createElement(MembershipRenewalDueEmail, baseProps));
    expect(html).toContain("2024");
  });

  it("renders pay link", async () => {
    const html = await render(React.createElement(MembershipRenewalDueEmail, baseProps));
    expect(html).toContain("https://app.snowgum.site/renew");
  });
});
