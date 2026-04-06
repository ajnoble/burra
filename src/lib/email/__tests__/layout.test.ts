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
