// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

vi.mock("@/actions/organisations/updateBranding", () => ({
  updateBranding: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Stub UI components to plain HTML so we can query the DOM easily
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) =>
    React.createElement("button", props, children),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => React.createElement("input", props),
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.ComponentProps<"label">) =>
    React.createElement("label", props, children),
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.ComponentProps<"div">) =>
    React.createElement("div", props, children),
  CardContent: ({ children, ...props }: React.ComponentProps<"div">) =>
    React.createElement("div", props, children),
  CardHeader: ({ children, ...props }: React.ComponentProps<"div">) =>
    React.createElement("div", props, children),
  CardTitle: ({ children, ...props }: React.ComponentProps<"h3">) =>
    React.createElement("h3", props, children),
}));

import { updateBranding } from "@/actions/organisations/updateBranding";
import { toast } from "sonner";
import { BrandingSettingsForm } from "./branding-settings-form";

const mockUpdateBranding = vi.mocked(updateBranding);
const mockToast = vi.mocked(toast);

const DEFAULT_ORG_ID = "org-123";

function renderComponent(props: React.ComponentProps<typeof BrandingSettingsForm>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(BrandingSettingsForm, props));
  });
  return container;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.textContent = "";
});

describe("BrandingSettingsForm", () => {
  describe("(a) toggling 'Use Snow Gum default' checkbox", () => {
    it("starts unchecked when an accentColor is provided", () => {
      const container = renderComponent({
        organisationId: DEFAULT_ORG_ID,
        initial: { accentColor: "#ff0000", logoUrl: null },
      });
      const checkbox = container.querySelector<HTMLInputElement>(
        'input[type="checkbox"]'
      )!;
      expect(checkbox.checked).toBe(false);
    });

    it("starts checked when accentColor is null (use default)", () => {
      const container = renderComponent({
        organisationId: DEFAULT_ORG_ID,
        initial: { accentColor: null, logoUrl: null },
      });
      const checkbox = container.querySelector<HTMLInputElement>(
        'input[type="checkbox"]'
      )!;
      expect(checkbox.checked).toBe(true);
    });

    it("checking the box disables the color inputs and shows 'Default' preview text", () => {
      const container = renderComponent({
        organisationId: DEFAULT_ORG_ID,
        initial: { accentColor: "#ff0000", logoUrl: null },
      });
      const checkbox = container.querySelector<HTMLInputElement>(
        'input[type="checkbox"]'
      )!;
      act(() => {
        checkbox.click();
      });
      const colorPicker = container.querySelector<HTMLInputElement>(
        'input[type="color"]'
      )!;
      expect(colorPicker.disabled).toBe(true);
      const previewBtn = container.querySelector<HTMLButtonElement>(
        'button[disabled]'
      )!;
      expect(previewBtn.textContent).toBe("Default");
    });

    it("unchecking the box re-enables the color inputs and shows 'Your color' preview text", () => {
      const container = renderComponent({
        organisationId: DEFAULT_ORG_ID,
        initial: { accentColor: null, logoUrl: null },
      });
      const checkbox = container.querySelector<HTMLInputElement>(
        'input[type="checkbox"]'
      )!;
      // Uncheck (currently checked because accentColor is null)
      act(() => {
        checkbox.click();
      });
      const colorPicker = container.querySelector<HTMLInputElement>(
        'input[type="color"]'
      )!;
      expect(colorPicker.disabled).toBe(false);
      const previewBtn = container.querySelector<HTMLButtonElement>(
        'button[disabled]'
      )!;
      expect(previewBtn.textContent).toBe("Your color");
    });
  });

  describe("(b) choosing a file sets logoFile state", () => {
    it("file input is present with the correct accept attribute", () => {
      const container = renderComponent({
        organisationId: DEFAULT_ORG_ID,
        initial: { accentColor: null, logoUrl: null },
      });
      const fileInput = container.querySelector<HTMLInputElement>(
        'input[type="file"]'
      )!;
      expect(fileInput).not.toBeNull();
      expect(fileInput.accept).toBe("image/png,image/svg+xml,image/jpeg");
    });

    it("submitting after choosing a file passes the File to updateBranding", async () => {
      mockUpdateBranding.mockResolvedValue({ success: true });
      const container = renderComponent({
        organisationId: DEFAULT_ORG_ID,
        initial: { accentColor: "#38694a", logoUrl: null },
      });
      const fileInput = container.querySelector<HTMLInputElement>(
        'input[type="file"]'
      )!;
      const fakeFile = new File(["data"], "logo.png", { type: "image/png" });
      // Simulate onChange with a file
      act(() => {
        Object.defineProperty(fileInput, "files", {
          value: { 0: fakeFile, length: 1 },
          configurable: true,
        });
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const form = container.querySelector("form")!;
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(mockUpdateBranding).toHaveBeenCalledWith(
        DEFAULT_ORG_ID,
        expect.objectContaining({ accentColor: "#38694a", removeLogo: false }),
        fakeFile
      );
    });
  });

  describe("(c) removeLogo toggle shows/hides undo affordance", () => {
    it("shows 'Remove logo' button when a logoUrl is set and removeLogo is false", () => {
      const container = renderComponent({
        organisationId: DEFAULT_ORG_ID,
        initial: { accentColor: null, logoUrl: "https://example.com/logo.png" },
      });
      const buttons = Array.from(container.querySelectorAll("button"));
      const removeBtn = buttons.find((b) => b.textContent === "Remove logo");
      expect(removeBtn).toBeDefined();
    });

    it("clicking 'Remove logo' shows the undo affordance", () => {
      const container = renderComponent({
        organisationId: DEFAULT_ORG_ID,
        initial: { accentColor: null, logoUrl: "https://example.com/logo.png" },
      });
      const buttons = Array.from(container.querySelectorAll("button"));
      const removeBtn = buttons.find((b) => b.textContent === "Remove logo")!;
      act(() => {
        removeBtn.click();
      });
      const undoBtn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Undo"
      );
      expect(undoBtn).toBeDefined();
    });

    it("clicking 'Undo' hides the undo affordance and shows Remove logo again", () => {
      const container = renderComponent({
        organisationId: DEFAULT_ORG_ID,
        initial: { accentColor: null, logoUrl: "https://example.com/logo.png" },
      });
      act(() => {
        const removeBtn = Array.from(container.querySelectorAll("button")).find(
          (b) => b.textContent === "Remove logo"
        )!;
        removeBtn.click();
      });
      act(() => {
        const undoBtn = Array.from(container.querySelectorAll("button")).find(
          (b) => b.textContent === "Undo"
        )!;
        undoBtn.click();
      });
      const undoBtnAfter = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Undo"
      );
      expect(undoBtnAfter).toBeUndefined();
      const removeBtnAfter = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Remove logo"
      );
      expect(removeBtnAfter).toBeDefined();
    });
  });

  describe("(d) submitting calls updateBranding with expected args and shows success toast", () => {
    it("calls updateBranding with organisationId, accentColor, removeLogo=false and shows success toast", async () => {
      mockUpdateBranding.mockResolvedValue({ success: true });
      const container = renderComponent({
        organisationId: DEFAULT_ORG_ID,
        initial: { accentColor: "#38694a", logoUrl: null },
      });
      const form = container.querySelector("form")!;
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(mockUpdateBranding).toHaveBeenCalledWith(
        DEFAULT_ORG_ID,
        expect.objectContaining({ accentColor: "#38694a", removeLogo: false }),
        null
      );
      expect(mockToast.success).toHaveBeenCalledWith("Branding updated");
    });

    it("sends accentColor=null when useDefault is checked", async () => {
      mockUpdateBranding.mockResolvedValue({ success: true });
      const container = renderComponent({
        organisationId: DEFAULT_ORG_ID,
        initial: { accentColor: null, logoUrl: null },
      });
      const form = container.querySelector("form")!;
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(mockUpdateBranding).toHaveBeenCalledWith(
        DEFAULT_ORG_ID,
        expect.objectContaining({ accentColor: null, removeLogo: false }),
        null
      );
    });

    it("sends removeLogo=true when Remove logo was clicked", async () => {
      mockUpdateBranding.mockResolvedValue({ success: true });
      const container = renderComponent({
        organisationId: DEFAULT_ORG_ID,
        initial: { accentColor: null, logoUrl: "https://example.com/logo.png" },
      });
      act(() => {
        const removeBtn = Array.from(container.querySelectorAll("button")).find(
          (b) => b.textContent === "Remove logo"
        )!;
        removeBtn.click();
      });
      const form = container.querySelector("form")!;
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(mockUpdateBranding).toHaveBeenCalledWith(
        DEFAULT_ORG_ID,
        expect.objectContaining({ removeLogo: true }),
        null
      );
    });
  });

  describe("(e) failure shows an error toast", () => {
    it("shows toast.error with the action's error message on failure", async () => {
      mockUpdateBranding.mockResolvedValue({
        success: false,
        error: "Upload failed: bucket not found",
      });
      const container = renderComponent({
        organisationId: DEFAULT_ORG_ID,
        initial: { accentColor: "#38694a", logoUrl: null },
      });
      const form = container.querySelector("form")!;
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(mockToast.error).toHaveBeenCalledWith("Upload failed: bucket not found");
      expect(mockToast.success).not.toHaveBeenCalled();
    });
  });
});
