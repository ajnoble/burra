import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("telnyx", () => ({
  Telnyx: class {
    messages = { send: mockSend };
  },
}));

import { sendSMS } from "../send";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELNYX_API_KEY = "test-key";
});

describe("sendSMS", () => {
  it("sends an SMS and returns the message ID", async () => {
    mockSend.mockResolvedValue({ data: { id: "msg-123" } });

    const result = await sendSMS({
      to: "+61412345678",
      body: "Hello from Snow Gum",
      from: "+61400000000",
    });

    expect(result).toEqual({ messageId: "msg-123" });
    expect(mockSend).toHaveBeenCalledWith({
      from: "+61400000000",
      to: "+61412345678",
      text: "Hello from Snow Gum",
    });
  });

  it("returns error when send fails", async () => {
    mockSend.mockRejectedValue(new Error("Network error"));

    const result = await sendSMS({
      to: "+61412345678",
      body: "Hello",
      from: "+61400000000",
    });

    expect(result).toEqual({ messageId: null, error: "Network error" });
  });
});
