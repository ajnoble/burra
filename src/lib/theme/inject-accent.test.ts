import { describe, it, expect } from "vitest";
import { InjectAccent } from "./inject-accent";
import { deriveAccentPalette } from "./derive-accent";
import type { AccentPalette } from "./derive-accent";

// A valid deterministic palette for happy-path tests
const VALID_PALETTE = deriveAccentPalette("#38694a");

describe("InjectAccent", () => {
  it("returns a link element with a data:text/css href", () => {
    const result = InjectAccent({ palette: VALID_PALETTE });
    expect(result.type).toBe("link");
    expect(result.props.rel).toBe("stylesheet");
    expect(result.props.href).toMatch(/^data:text\/css;charset=utf-8,/);
  });

  it("CSS body round-trips correctly — contains all palette values in correct variable slots", () => {
    const palette = deriveAccentPalette("#38694a");
    const result = InjectAccent({ palette });
    const href: string = result.props.href;
    const prefix = "data:text/css;charset=utf-8,";
    const decoded = decodeURIComponent(href.slice(prefix.length));

    // Each palette value must appear in the correct CSS variable slot
    expect(decoded).toContain(`--primary:${palette.primary};`);
    expect(decoded).toContain(`--primary-foreground:${palette.primaryForeground};`);
    expect(decoded).toContain(`--ring:${palette.ring};`);
    // Dark-mode block re-uses a different set of values
    expect(decoded).toContain(`--primary:${palette.primaryDark};`);
    expect(decoded).toContain(`--primary-foreground:${palette.primaryForegroundDark};`);
    expect(decoded).toContain(`--ring:${palette.ringDark};`);
  });

  it("rejects an unsafe primary value — error message names the field", () => {
    const bad: AccentPalette = {
      ...VALID_PALETTE,
      primary: "red; background: url(evil)",
    };
    expect(() => InjectAccent({ palette: bad })).toThrow(/primary/);
  });

  it("rejects an unsafe ring value — error message names the field", () => {
    const bad: AccentPalette = {
      ...VALID_PALETTE,
      ring: "red; background: url(evil)",
    };
    expect(() => InjectAccent({ palette: bad })).toThrow(/ring/);
  });

  it("rejects an empty oklch() body — oklch() is not a valid value", () => {
    const bad: AccentPalette = {
      ...VALID_PALETTE,
      primaryDark: "oklch()",
    };
    expect(() => InjectAccent({ palette: bad })).toThrow();
  });

  it("targets both :root and .dark selectors", () => {
    const result = InjectAccent({ palette: VALID_PALETTE });
    const href: string = result.props.href;
    const prefix = "data:text/css;charset=utf-8,";
    const decoded = decodeURIComponent(href.slice(prefix.length));

    expect(decoded).toContain(":root{");
    expect(decoded).toContain(".dark{");
  });
});
