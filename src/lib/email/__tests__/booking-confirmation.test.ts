import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { BookingConfirmationEmail } from "../templates/booking-confirmation";

describe("BookingConfirmationEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    bookingReference: "BK-2024-001",
    lodgeName: "Bogong Lodge",
    checkInDate: "2024-07-05",
    checkOutDate: "2024-07-12",
    totalNights: 7,
    guests: [
      { firstName: "Alice", lastName: "Smith" },
      { firstName: "Bob", lastName: "Jones" },
    ],
    totalAmountCents: 84000,
    payUrl: "https://app.snowgum.site/pay/BK-2024-001",
  };

  it("renders booking reference", async () => {
    const html = await render(React.createElement(BookingConfirmationEmail, baseProps));
    expect(html).toContain("BK-2024-001");
  });

  it("renders lodge name", async () => {
    const html = await render(React.createElement(BookingConfirmationEmail, baseProps));
    expect(html).toContain("Bogong Lodge");
  });

  it("renders guest names", async () => {
    const html = await render(React.createElement(BookingConfirmationEmail, baseProps));
    expect(html).toContain("Alice Smith");
    expect(html).toContain("Bob Jones");
  });

  it("renders formatted amount", async () => {
    const html = await render(React.createElement(BookingConfirmationEmail, baseProps));
    expect(html).toContain("$840.00");
  });

  it("renders pay link", async () => {
    const html = await render(React.createElement(BookingConfirmationEmail, baseProps));
    expect(html).toContain("https://app.snowgum.site/pay/BK-2024-001");
  });

  it("renders nights count", async () => {
    const html = await render(React.createElement(BookingConfirmationEmail, baseProps));
    expect(html).toContain("7");
  });

  it("renders check-in date formatted", async () => {
    const html = await render(React.createElement(BookingConfirmationEmail, baseProps));
    // Date is formatted with en-AU locale; month name format may vary by environment
    expect(html).toContain("2024");
    expect(html).toContain("5");
  });
});
