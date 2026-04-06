import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { BookingReminderEmail } from "../templates/booking-reminder";

describe("BookingReminderEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    bookingReference: "BK-2024-005",
    lodgeName: "Bogong Lodge",
    checkInDate: "2024-07-05",
    checkOutDate: "2024-07-12",
    guests: [
      { firstName: "Alice", lastName: "Smith" },
      { firstName: "Bob", lastName: "Jones" },
    ],
  };

  it("renders booking reference", async () => {
    const html = await render(React.createElement(BookingReminderEmail, baseProps));
    expect(html).toContain("BK-2024-005");
  });

  it("renders lodge name", async () => {
    const html = await render(React.createElement(BookingReminderEmail, baseProps));
    expect(html).toContain("Bogong Lodge");
  });

  it("renders dates", async () => {
    const html = await render(React.createElement(BookingReminderEmail, baseProps));
    expect(html).toContain("2024");
  });

  it("renders guest names", async () => {
    const html = await render(React.createElement(BookingReminderEmail, baseProps));
    expect(html).toContain("Alice Smith");
    expect(html).toContain("Bob Jones");
  });

  it("renders coming up text", async () => {
    const html = await render(React.createElement(BookingReminderEmail, baseProps));
    expect(html).toContain("coming up");
  });
});
