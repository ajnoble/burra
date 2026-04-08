import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { BulkCommunicationEmail } from "../bulk-communication";

describe("BulkCommunicationEmail", () => {
  it("renders with org name and body HTML", async () => {
    const html = await render(
      BulkCommunicationEmail({
        orgName: "Alpine Ski Club",
        bodyHtml: "<p>Hello members, the season starts next week!</p>",
      })
    );

    expect(html).toContain("Alpine Ski Club");
    expect(html).toContain("Hello members, the season starts next week!");
  });

  it("renders with logo URL", async () => {
    const html = await render(
      BulkCommunicationEmail({
        orgName: "Mountain Lodge",
        bodyHtml: "<h2>Update</h2><p>New rules apply.</p>",
        logoUrl: "https://example.com/logo.png",
      })
    );

    expect(html).toContain("Mountain Lodge");
    expect(html).toContain("https://example.com/logo.png");
    expect(html).toContain("New rules apply.");
  });

  it("includes Powered by Snow Gum footer", async () => {
    const html = await render(
      BulkCommunicationEmail({
        orgName: "Test Org",
        bodyHtml: "<p>Content</p>",
      })
    );

    expect(html).toContain("Powered by Snow Gum");
  });
});
