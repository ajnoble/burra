import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { BookingPaymentReminderEmail } from "../booking-payment-reminder";

describe("BookingPaymentReminderEmail", () => {
  it("renders with all props", async () => {
    const html = await render(
      BookingPaymentReminderEmail({
        orgName: "Alpine Ski Club",
        bookingReference: "BSKI-2027-0042",
        lodgeName: "Main Lodge",
        checkInDate: "2027-07-01",
        checkOutDate: "2027-07-05",
        totalAmountCents: 80000,
        balanceDueDate: "2027-06-15",
        daysRemaining: 7,
        payUrl: "https://snowgum.site/alpine/dashboard",
      })
    );

    expect(html).toContain("Payment Reminder");
    expect(html).toContain("BSKI-2027-0042");
    expect(html).toContain("Main Lodge");
    expect(html).toContain("$800.00");
    expect(html).toContain("7 days");
    expect(html).toContain("Pay Now");
  });
});
