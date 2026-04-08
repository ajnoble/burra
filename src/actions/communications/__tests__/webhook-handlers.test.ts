import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock functions
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return { set: mockSet };
    },
  },
}));

mockSet.mockReturnValue({ where: mockWhere });
mockWhere.mockResolvedValue([]);

vi.mock("@/db/schema", () => ({
  communicationRecipients: { externalId: "externalId", status: "status" },
}));

import {
  processResendWebhook,
  processTelnyxWebhook,
} from "../webhook-handlers";

describe("processResendWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
  });

  it("updates status to DELIVERED on email.delivered", async () => {
    await processResendWebhook({
      type: "email.delivered",
      data: { email_id: "ext-123" },
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "DELIVERED", deliveredAt: expect.any(Date) })
    );
    expect(mockWhere).toHaveBeenCalledTimes(1);
  });

  it("updates status to OPENED with openedAt on email.opened", async () => {
    await processResendWebhook({
      type: "email.opened",
      data: { email_id: "ext-456" },
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "OPENED", openedAt: expect.any(Date) })
    );
  });

  it("updates status to CLICKED on email.clicked", async () => {
    await processResendWebhook({
      type: "email.clicked",
      data: { email_id: "ext-789" },
    });

    expect(mockSet).toHaveBeenCalledWith({ status: "CLICKED" });
  });

  it("updates status to BOUNCED on email.bounced", async () => {
    await processResendWebhook({
      type: "email.bounced",
      data: { email_id: "ext-bounce" },
    });

    expect(mockSet).toHaveBeenCalledWith({ status: "BOUNCED" });
  });

  it("updates status to BOUNCED on email.complaint", async () => {
    await processResendWebhook({
      type: "email.complaint",
      data: { email_id: "ext-complaint" },
    });

    expect(mockSet).toHaveBeenCalledWith({ status: "BOUNCED" });
  });

  it("ignores unknown event types", async () => {
    await processResendWebhook({
      type: "email.unknown_event",
      data: { email_id: "ext-999" },
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("processTelnyxWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
  });

  it("updates status to SENT on message.sent", async () => {
    await processTelnyxWebhook({
      data: { event_type: "message.sent", payload: { id: "telnyx-1" } },
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith({ status: "SENT" });
  });

  it("updates status to DELIVERED with deliveredAt on message.delivered", async () => {
    await processTelnyxWebhook({
      data: { event_type: "message.delivered", payload: { id: "telnyx-2" } },
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "DELIVERED", deliveredAt: expect.any(Date) })
    );
  });

  it("updates status to FAILED on message.failed", async () => {
    await processTelnyxWebhook({
      data: { event_type: "message.failed", payload: { id: "telnyx-3" } },
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith({ status: "FAILED" });
  });

  it("ignores unknown event types", async () => {
    await processTelnyxWebhook({
      data: { event_type: "message.unknown", payload: { id: "telnyx-4" } },
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
