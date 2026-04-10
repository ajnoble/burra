import { hexToOklch, formatOklch, type Oklch } from "./oklch";

export type AccentPalette = {
  primary: string;
  primaryForeground: string;
  ring: string;
  primaryDark: string;
  primaryForegroundDark: string;
  ringDark: string;
};

const LIGHT_L_MIN = 0.32;
const LIGHT_L_MAX = 0.48;
const DARK_L_MIN = 0.58;
const DARK_L_MAX = 0.74;
const C_MIN = 0.05;
const C_MAX = 0.12;

const CREAM: Oklch = { l: 0.985, c: 0.005, h: 75 };
const WARM_DARK: Oklch = { l: 0.16, c: 0.02, h: 150 };

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function deriveAccentPalette(hex: string): AccentPalette {
  const base = hexToOklch(hex);

  const primary: Oklch = {
    l: clamp(base.l, LIGHT_L_MIN, LIGHT_L_MAX),
    c: clamp(base.c, C_MIN, C_MAX),
    h: base.h,
  };

  const primaryDark: Oklch = {
    l: clamp(
      base.l < DARK_L_MIN ? DARK_L_MIN + (DARK_L_MAX - DARK_L_MIN) / 2 : base.l,
      DARK_L_MIN,
      DARK_L_MAX
    ),
    c: clamp(base.c, C_MIN, C_MAX),
    h: base.h,
  };

  const fgForLight = primary.l < 0.6 ? CREAM : WARM_DARK;
  const fgForDark = primaryDark.l > 0.5 ? WARM_DARK : CREAM;

  return {
    primary: formatOklch(primary),
    primaryForeground: formatOklch(fgForLight),
    ring: formatOklch(primary, 0.5),
    primaryDark: formatOklch(primaryDark),
    primaryForegroundDark: formatOklch(fgForDark),
    ringDark: formatOklch(primaryDark, 0.6),
  };
}
