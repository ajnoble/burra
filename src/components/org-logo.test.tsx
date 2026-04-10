import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { OrgLogo } from "./org-logo";

// Mock next/image so we can inspect props without a DOM renderer
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => React.createElement("img", props),
}));

// Mock useOrgTheme so tests control the returned values
vi.mock("@/lib/theme/org-theme-context", () => ({
  useOrgTheme: vi.fn(),
}));

import { useOrgTheme } from "@/lib/theme/org-theme-context";

const mockUseOrgTheme = vi.mocked(useOrgTheme);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OrgLogo", () => {
  describe("when logoUrl is set (image branch)", () => {
    const logoUrl = "https://example.com/logo.png";
    const name = "Alpine Ski Club";

    beforeEach(() => {
      mockUseOrgTheme.mockReturnValue({ logoUrl, name, slug: "alpine" });
    });

    it("renders a div wrapper with flex items-center and an Image with correct alt and src", () => {
      const element = OrgLogo({});
      // Outer element is a div
      expect(element.type).toBe("div");
      expect(element.props.className).toContain("flex");
      expect(element.props.className).toContain("items-center");

      // Child is the Image (mocked as img)
      const img = element.props.children;
      expect(img.props.src).toBe(logoUrl);
      expect(img.props.alt).toBe(name);
    });

    it("applies className to the outer div", () => {
      const element = OrgLogo({ className: "custom" });
      expect(element.props.className).toContain("custom");
    });

    it("applies imageClassName to the Image element", () => {
      const element = OrgLogo({ imageClassName: "small" });
      const img = element.props.children;
      expect(img.props.className).toContain("small");
    });

    it("passes priority=true to the Image element", () => {
      const element = OrgLogo({ priority: true });
      const img = element.props.children;
      expect(img.props.priority).toBe(true);
    });

    it("defaults priority to false", () => {
      const element = OrgLogo({});
      const img = element.props.children;
      expect(img.props.priority).toBe(false);
    });
  });

  describe("when logoUrl is null (wordmark branch)", () => {
    const name = "Mountain Hut";

    beforeEach(() => {
      mockUseOrgTheme.mockReturnValue({ logoUrl: null, name, slug: "mhut" });
    });

    it("renders a span containing the org name", () => {
      const element = OrgLogo({});
      expect(element.type).toBe("span");
      expect(element.props.children).toBe(name);
    });

    it("applies className to the span", () => {
      const element = OrgLogo({ className: "custom" });
      expect(element.props.className).toContain("custom");
    });

    it("applies wordmarkClassName to the span", () => {
      const element = OrgLogo({ wordmarkClassName: "big" });
      expect(element.props.className).toContain("big");
    });

    it("does not apply imageClassName in the wordmark branch", () => {
      const element = OrgLogo({ imageClassName: "small" });
      // The span's className should not contain imageClassName
      expect(element.props.className).not.toContain("small");
    });
  });
});
