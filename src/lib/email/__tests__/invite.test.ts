import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { InviteEmail } from "../templates/invite";

describe("InviteEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    firstName: "Alice",
    inviteUrl: "https://snowgum.site/api/auth/callback?code=abc123",
  };

  it("renders first name", async () => {
    const html = await render(React.createElement(InviteEmail, baseProps));
    expect(html).toContain("Alice");
  });

  it("renders org name", async () => {
    const html = await render(React.createElement(InviteEmail, baseProps));
    expect(html).toContain("Bogong Ski Club");
  });

  it("renders invite link", async () => {
    const html = await render(React.createElement(InviteEmail, baseProps));
    expect(html).toContain("https://snowgum.site/api/auth/callback?code=abc123");
  });

  it("renders member number when provided", async () => {
    const html = await render(
      React.createElement(InviteEmail, { ...baseProps, memberNumber: "SKI-001" })
    );
    expect(html).toContain("SKI-001");
  });

  it("omits member number when not provided", async () => {
    const html = await render(React.createElement(InviteEmail, baseProps));
    expect(html).not.toContain("Member number");
  });
});
