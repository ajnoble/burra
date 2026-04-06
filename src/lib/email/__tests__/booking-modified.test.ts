import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { BookingModifiedEmail } from "../templates/booking-modified";

describe("BookingModifiedEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    bookingReference: "BK-2024-004",
    lodgeName: "Bogong Lodge",
    checkInDate: "2024-07-10",
    checkOutDate: "2024-07-17",
    totalAmountCents: 98000,
    changes: "Dates changed from 5–12 July to 10–17 July",
  };

  it("renders booking reference", async () => {
    const html = await render(React.createElement(BookingModifiedEmail, baseProps));
    expect(html).toContain("BK-2024-004");
  });

  it("renders changes description", async () => {
    const html = await render(React.createElement(BookingModifiedEmail, baseProps));
    expect(html).toContain("Dates changed from 5–12 July to 10–17 July");
  });

  it("renders updated total formatted", async () => {
    const html = await render(React.createElement(BookingModifiedEmail, baseProps));
    expect(html).toContain("$980.00");
  });
});
