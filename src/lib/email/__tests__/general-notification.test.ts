import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { GeneralNotificationEmail } from "../templates/general-notification";

describe("GeneralNotificationEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    subject: "Important Club Update",
    body: "The lodge will be closed for maintenance from 1–5 June.",
  };

  it("renders subject as heading", async () => {
    const html = await render(React.createElement(GeneralNotificationEmail, baseProps));
    expect(html).toContain("Important Club Update");
  });

  it("renders body text", async () => {
    const html = await render(React.createElement(GeneralNotificationEmail, baseProps));
    expect(html).toContain("The lodge will be closed for maintenance from 1–5 June.");
  });

  it("renders org name", async () => {
    const html = await render(React.createElement(GeneralNotificationEmail, baseProps));
    expect(html).toContain("Bogong Ski Club");
  });
});
