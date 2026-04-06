import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { BookingCancelledEmail } from "../templates/booking-cancelled";

describe("BookingCancelledEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    bookingReference: "BK-2024-002",
    lodgeName: "Bogong Lodge",
    checkInDate: "2024-07-05",
    checkOutDate: "2024-07-12",
  };

  it("renders booking reference", async () => {
    const html = await render(React.createElement(BookingCancelledEmail, baseProps));
    expect(html).toContain("BK-2024-002");
  });

  it("renders lodge name", async () => {
    const html = await render(React.createElement(BookingCancelledEmail, baseProps));
    expect(html).toContain("Bogong Lodge");
  });

  it("renders check-in and check-out dates", async () => {
    const html = await render(React.createElement(BookingCancelledEmail, baseProps));
    expect(html).toContain("2024");
  });

  it("renders refund amount when provided", async () => {
    const html = await render(
      React.createElement(BookingCancelledEmail, { ...baseProps, refundAmountCents: 42000 })
    );
    expect(html).toContain("$420.00");
  });

  it("renders reason when provided", async () => {
    const html = await render(
      React.createElement(BookingCancelledEmail, { ...baseProps, reason: "Lodge unavailable" })
    );
    expect(html).toContain("Lodge unavailable");
  });

  it("omits refund section when not provided", async () => {
    const html = await render(React.createElement(BookingCancelledEmail, baseProps));
    expect(html).not.toContain("Refund");
  });
});
