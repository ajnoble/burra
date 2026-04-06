import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildBedAvailabilityMap } from "../beds";

describe("buildBedAvailabilityMap", () => {
  it("marks all beds as available when none are booked or held", () => {
    const beds = [
      { id: "bed-1", label: "Bed 1", roomId: "room-1", sortOrder: 0 },
      { id: "bed-2", label: "Bed 2", roomId: "room-1", sortOrder: 1 },
    ];
    const result = buildBedAvailabilityMap(beds, new Set(), new Set(), null);
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe("available");
    expect(result[1].status).toBe("available");
  });

  it("marks booked beds as booked", () => {
    const beds = [
      { id: "bed-1", label: "Bed 1", roomId: "room-1", sortOrder: 0 },
      { id: "bed-2", label: "Bed 2", roomId: "room-1", sortOrder: 1 },
    ];
    const result = buildBedAvailabilityMap(beds, new Set(["bed-1"]), new Set(), null);
    expect(result[0].status).toBe("booked");
    expect(result[1].status).toBe("available");
  });

  it("marks held beds as held", () => {
    const beds = [
      { id: "bed-1", label: "Bed 1", roomId: "room-1", sortOrder: 0 },
      { id: "bed-2", label: "Bed 2", roomId: "room-1", sortOrder: 1 },
    ];
    const result = buildBedAvailabilityMap(beds, new Set(), new Set(["bed-2"]), null);
    expect(result[0].status).toBe("available");
    expect(result[1].status).toBe("held");
  });

  it("marks beds held by current member as held-by-you", () => {
    const beds = [{ id: "bed-1", label: "Bed 1", roomId: "room-1", sortOrder: 0 }];
    const result = buildBedAvailabilityMap(beds, new Set(), new Set(), new Set(["bed-1"]));
    expect(result[0].status).toBe("held-by-you");
  });

  it("booked status takes priority over held", () => {
    const beds = [{ id: "bed-1", label: "Bed 1", roomId: "room-1", sortOrder: 0 }];
    const result = buildBedAvailabilityMap(beds, new Set(["bed-1"]), new Set(["bed-1"]), null);
    expect(result[0].status).toBe("booked");
  });
});
