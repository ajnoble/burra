import type { AccentPalette } from "./derive-accent";

const SAFE = /^oklch\([0-9. ]+(?: \/ [0-9.]+)?\)$/;

function assertSafe(palette: AccentPalette): void {
  for (const [key, value] of Object.entries(palette)) {
    if (!SAFE.test(value)) {
      throw new Error(`Unsafe OKLCH string on ${key}: ${value}`);
    }
  }
}

/**
 * Emits a per-tenant accent palette as a data-URL stylesheet.
 *
 * - Every substituted value has already been produced by `formatOklch`,
 *   which only emits the pattern `oklch(L C H)` or `oklch(L C H / a)`
 *   with numeric components.
 * - `assertSafe` re-validates that shape before the value leaves the
 *   function (second line of defence).
 * - The CSS body is URI-encoded, and the resulting href is passed via
 *   a normal React prop — React escapes attribute values automatically.
 *
 * Because the CSS targets `:root`, Radix portals (dialog, dropdown,
 * toast) pick up the per-tenant variables without any wrapper-scope
 * workarounds.
 */
export function InjectAccent({ palette }: { palette: AccentPalette }) {
  assertSafe(palette);
  const css =
    `:root{` +
    `--primary:${palette.primary};` +
    `--primary-foreground:${palette.primaryForeground};` +
    `--ring:${palette.ring};` +
    `}` +
    `.dark{` +
    `--primary:${palette.primaryDark};` +
    `--primary-foreground:${palette.primaryForegroundDark};` +
    `--ring:${palette.ringDark};` +
    `}`;
  const href = `data:text/css;charset=utf-8,${encodeURIComponent(css)}`;
  return <link rel="stylesheet" href={href} />;
}
