import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { FinancialStatusChangedEmail } from "../templates/financial-status-changed";

describe("FinancialStatusChangedEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    firstName: "Alice",
    isFinancial: true,
    reason: "Membership fee paid for 2024 season",
  };

  it("renders first name", async () => {
    const html = await render(React.createElement(FinancialStatusChangedEmail, baseProps));
    expect(html).toContain("Alice");
  });

  it("renders reason", async () => {
    const html = await render(React.createElement(FinancialStatusChangedEmail, baseProps));
    expect(html).toContain("Membership fee paid for 2024 season");
  });

  it("renders financial when isFinancial is true", async () => {
    const html = await render(React.createElement(FinancialStatusChangedEmail, baseProps));
    expect(html).toContain("financial");
  });

  it("renders unfinancial when isFinancial is false", async () => {
    const html = await render(
      React.createElement(FinancialStatusChangedEmail, {
        ...baseProps,
        isFinancial: false,
        reason: "Membership fee overdue",
      })
    );
    expect(html).toContain("unfinancial");
  });
});
