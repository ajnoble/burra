/**
 * Hex → OKLCH conversion. Zero dependencies.
 * Pipeline: sRGB (0-255) → linear RGB → OKLab → OKLCH.
 *
 * Reference: https://bottosson.github.io/posts/oklab/
 */

export type Oklch = { l: number; c: number; h: number };

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearRgbToOklab(r: number, g: number, b: number) {
  const l_ = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m_ = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s_ = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l = Math.cbrt(l_);
  const m = Math.cbrt(m_);
  const s = Math.cbrt(s_);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function hexToOklch(hex: string): Oklch {
  const [rS, gS, bS] = parseHex(hex);
  const r = srgbToLinear(rS);
  const g = srgbToLinear(gS);
  const b = srgbToLinear(bS);

  const { L, a, b: lab_b } = linearRgbToOklab(r, g, b);
  const c = Math.sqrt(a * a + lab_b * lab_b);
  let h = (Math.atan2(lab_b, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l: L, c, h };
}

export function formatOklch(color: Oklch, alpha?: number): string {
  const l = color.l.toFixed(3);
  const c = color.c.toFixed(3);
  const h = color.h.toFixed(3);
  if (alpha !== undefined) {
    return `oklch(${l} ${c} ${h} / ${alpha.toFixed(3)})`;
  }
  return `oklch(${l} ${c} ${h})`;
}
