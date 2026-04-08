import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("../client", () => ({
  getResendClient: () => ({
    emails: { send: mockSend },
  }),
}));

// Must import after mock
import { sendEmail, sendEmailTracked } from "../send";
import React from "react";

describe("sendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  it("calls resend with correct from, to, subject, and react component", async () => {
    const template = React.createElement("div", null, "Hello");

    sendEmail({
      to: "member@example.com",
      subject: "Test Subject",
      template,
      orgName: "Polski Ski Club",
    });

    // Allow microtask to run
    await new Promise((r) => setTimeout(r, 0));

    expect(mockSend).toHaveBeenCalledWith({
      from: "Polski Ski Club via Snow Gum <noreply@snowgum.site>",
      to: "member@example.com",
      subject: "Test Subject",
      react: template,
      replyTo: undefined,
    });
  });

  it("uses replyTo when provided", async () => {
    const template = React.createElement("div", null, "Hello");

    sendEmail({
      to: "member@example.com",
      subject: "Test",
      template,
      orgName: "Alpine Club",
      replyTo: "admin@alpineclub.com.au",
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: "admin@alpineclub.com.au",
      })
    );
  });

  it("falls back to 'Snow Gum' when orgName not provided", async () => {
    const template = React.createElement("div", null, "Hello");

    sendEmail({
      to: "member@example.com",
      subject: "Test",
      template,
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Snow Gum <noreply@snowgum.site>",
      })
    );
  });

  it("catches errors without throwing", async () => {
    mockSend.mockRejectedValue(new Error("API down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const template = React.createElement("div", null, "Hello");

    sendEmail({
      to: "member@example.com",
      subject: "Test",
      template,
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(consoleSpy).toHaveBeenCalledWith(
      "[email] Failed to send:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("accepts an array of recipients", async () => {
    const template = React.createElement("div", null, "Hello");

    sendEmail({
      to: ["a@example.com", "b@example.com"],
      subject: "Test",
      template,
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["a@example.com", "b@example.com"],
      })
    );
  });
});

describe("sendEmailTracked", () => {
  const baseOptions = {
    to: "user@example.com",
    subject: "Test Subject",
    template: React.createElement("div", null, "Hello"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns messageId on success", async () => {
    mockSend.mockResolvedValue({ data: { id: "msg_abc123" }, error: null });

    const result = await sendEmailTracked(baseOptions);

    expect(result).toEqual({ messageId: "msg_abc123" });
    expect(mockSend).toHaveBeenCalledWith({
      from: "Snow Gum <noreply@snowgum.site>",
      to: "user@example.com",
      subject: "Test Subject",
      react: baseOptions.template,
      replyTo: undefined,
    });
  });

  it("returns messageId with orgName", async () => {
    mockSend.mockResolvedValue({ data: { id: "msg_def456" }, error: null });

    const result = await sendEmailTracked({ ...baseOptions, orgName: "Alpine Club" });

    expect(result).toEqual({ messageId: "msg_def456" });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Alpine Club via Snow Gum <noreply@snowgum.site>",
      })
    );
  });

  it("returns error when Resend returns error", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "Rate limited" } });

    const result = await sendEmailTracked(baseOptions);

    expect(result).toEqual({ messageId: null, error: "Rate limited" });
  });

  it("returns error when send throws", async () => {
    mockSend.mockRejectedValue(new Error("Network failure"));

    const result = await sendEmailTracked(baseOptions);

    expect(result).toEqual({ messageId: null, error: "Network failure" });
  });
});
