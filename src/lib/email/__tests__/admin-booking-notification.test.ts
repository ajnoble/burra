import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { AdminBookingNotificationEmail } from "../templates/admin-booking-notification";

describe("AdminBookingNotificationEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    bookingReference: "BK-2024-008",
    memberName: "Alice Smith",
    lodgeName: "Bogong Lodge",
    checkInDate: "2024-07-05",
    checkOutDate: "2024-07-12",
    action: "created" as const,
    adminUrl: "https://app.snowgum.site/admin/bookings/BK-2024-008",
  };

  it("renders booking reference", async () => {
    const html = await render(React.createElement(AdminBookingNotificationEmail, baseProps));
    expect(html).toContain("BK-2024-008");
  });

  it("renders member name", async () => {
    const html = await render(React.createElement(AdminBookingNotificationEmail, baseProps));
    expect(html).toContain("Alice Smith");
  });

  it("renders action", async () => {
    const html = await render(React.createElement(AdminBookingNotificationEmail, baseProps));
    expect(html).toContain("created");
  });

  it("renders admin link", async () => {
    const html = await render(React.createElement(AdminBookingNotificationEmail, baseProps));
    expect(html).toContain("https://app.snowgum.site/admin/bookings/BK-2024-008");
  });

  it("renders cancelled action variant", async () => {
    const html = await render(
      React.createElement(AdminBookingNotificationEmail, { ...baseProps, action: "cancelled" })
    );
    expect(html).toContain("cancelled");
  });
});
