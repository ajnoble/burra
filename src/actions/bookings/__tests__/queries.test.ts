import { describe, it, expect } from "vitest";
import { formatBookingStatus } from "../queries";

describe("formatBookingStatus", () => {
  it("formats PENDING", async () => {
    expect(await formatBookingStatus("PENDING")).toBe("Pending Approval");
  });

  it("formats CONFIRMED", async () => {
    expect(await formatBookingStatus("CONFIRMED")).toBe("Confirmed");
  });

  it("formats CANCELLED", async () => {
    expect(await formatBookingStatus("CANCELLED")).toBe("Cancelled");
  });

  it("formats COMPLETED", async () => {
    expect(await formatBookingStatus("COMPLETED")).toBe("Completed");
  });

  it("formats WAITLISTED", async () => {
    expect(await formatBookingStatus("WAITLISTED")).toBe("Waitlisted");
  });

  it("returns the raw status for unknown values", async () => {
    expect(await formatBookingStatus("UNKNOWN")).toBe("UNKNOWN");
  });
});
