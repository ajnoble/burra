import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { BookingApprovedEmail } from "../templates/booking-approved";

describe("BookingApprovedEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    bookingReference: "BK-2024-003",
    lodgeName: "Bogong Lodge",
    checkInDate: "2024-07-05",
    checkOutDate: "2024-07-12",
    payUrl: "https://app.snowgum.site/pay/BK-2024-003",
  };

  it("renders booking reference", async () => {
    const html = await render(React.createElement(BookingApprovedEmail, baseProps));
    expect(html).toContain("BK-2024-003");
  });

  it("renders approved message", async () => {
    const html = await render(React.createElement(BookingApprovedEmail, baseProps));
    expect(html).toContain("approved");
  });

  it("renders pay link", async () => {
    const html = await render(React.createElement(BookingApprovedEmail, baseProps));
    expect(html).toContain("https://app.snowgum.site/pay/BK-2024-003");
  });
});
