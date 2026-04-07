import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { BookingAutoCancelledEmail } from "../booking-auto-cancelled";

describe("BookingAutoCancelledEmail", () => {
  it("renders with refund", async () => {
    const html = await render(
      BookingAutoCancelledEmail({
        orgName: "Alpine Ski Club",
        bookingReference: "BSKI-2027-0042",
        lodgeName: "Main Lodge",
        checkInDate: "2027-07-01",
        checkOutDate: "2027-07-05",
        totalAmountCents: 80000,
        refundAmountCents: 60000,
      })
    );

    expect(html).toContain("Booking Auto-Cancelled");
    expect(html).toContain("BSKI-2027-0042");
    expect(html).toContain("payment deadline");
    expect(html).toContain("$600.00");
  });

  it("renders without refund", async () => {
    const html = await render(
      BookingAutoCancelledEmail({
        orgName: "Alpine Ski Club",
        bookingReference: "BSKI-2027-0042",
        lodgeName: "Main Lodge",
        checkInDate: "2027-07-01",
        checkOutDate: "2027-07-05",
        totalAmountCents: 80000,
      })
    );

    expect(html).toContain("Booking Auto-Cancelled");
    expect(html).not.toContain("Refund");
  });
});
