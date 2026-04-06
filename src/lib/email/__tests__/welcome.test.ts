import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { WelcomeEmail } from "../templates/welcome";

describe("WelcomeEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    firstName: "Alice",
    loginUrl: "https://app.snowgum.site/login",
  };

  it("renders first name", async () => {
    const html = await render(React.createElement(WelcomeEmail, baseProps));
    expect(html).toContain("Alice");
  });

  it("renders org name", async () => {
    const html = await render(React.createElement(WelcomeEmail, baseProps));
    expect(html).toContain("Bogong Ski Club");
  });

  it("renders login link", async () => {
    const html = await render(React.createElement(WelcomeEmail, baseProps));
    expect(html).toContain("https://app.snowgum.site/login");
  });

  it("renders member number when provided", async () => {
    const html = await render(
      React.createElement(WelcomeEmail, { ...baseProps, memberNumber: "SKI-001" })
    );
    expect(html).toContain("SKI-001");
  });

  it("omits member number when not provided", async () => {
    const html = await render(React.createElement(WelcomeEmail, baseProps));
    expect(html).not.toContain("Member number");
  });
});
