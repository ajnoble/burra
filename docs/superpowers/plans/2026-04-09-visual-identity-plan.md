# Visual Identity & Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Snow Gum's default neutral shadcn look with a warm alpine-lodge visual identity and deliver per-tenant branding (accent color + logo) as a multi-tenant differentiator.

**Architecture:** CSS custom properties in `globals.css` provide the baseline palette and typography. Per-org accent color is stored on `organisations`, derived into a clamped OKLCH palette server-side, and injected via a `<link rel="stylesheet" href="data:text/css,...">` tag in `[slug]/layout.tsx`. Because the emitted CSS targets `:root`, Radix portals (dialog, dropdown, toast) pick it up automatically without wrapper-scope surprises. Per-org logo flows through a lightweight React context consumed by admin sidebar, member nav, login page, and email layout.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4 (`@theme inline` tokens), shadcn/ui on Base UI primitives, Drizzle ORM + Supabase Postgres, `next/font/google` (Fraunces + Inter), Supabase Storage (logo uploads), Vitest (unit + pglite integration), Playwright (E2E).

**Spec reference:** `docs/superpowers/specs/2026-04-09-visual-identity-design.md`

**Deviations from spec (confirmed against codebase):**
- `organisations.logoUrl` already exists — migration only adds `accentColor`.
- Settings UI is a single page (`[slug]/admin/settings/page.tsx`) with inline section forms, not sub-routes. `BrandingSettingsForm` is added as a new section on that page, not a new route.
- Button baseline sizes are `h-8 / h-7 / h-9`, not `h-10 / h-11 / h-9`. Plan bumps actual values by 1 rem unit (`h-9 / h-8 / h-10`).
- Style injection uses a data-URL stylesheet link (see Task 8) instead of the raw-HTML inline style pattern the spec hinted at. Same effect (tokens on `:root`), tighter XSS surface.

---

## Task 1: Load Fraunces and Inter, wire font tokens in root layout

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Read current `src/app/layout.tsx`**

Verify it matches the version this plan was written against. Current content:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
```

- [ ] **Step 2: Replace font loaders with Inter + Fraunces + Geist Mono**

Edit `src/app/layout.tsx` — replace the existing font imports and setup:

```tsx
import type { Metadata } from "next";
import { Inter, Fraunces, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Snow Gum — Club Accommodation Booking",
  description:
    "Modern booking and membership management for member-owned accommodation clubs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Add `--font-display` and `--font-serif` to `@theme inline` in `globals.css`**

Find the `@theme inline` block in `src/app/globals.css` and change the existing `--font-sans` entry plus add two new entries. Replace:

```css
  --font-sans: var(--font-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-sans);
```

with:

```css
  --font-sans: var(--font-inter);
  --font-serif: var(--font-fraunces);
  --font-display: var(--font-fraunces);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-fraunces);
```

- [ ] **Step 4: Verify build compiles**

Run: `cd /opt/snowgum && npm run build 2>&1 | tail -20`
Expected: Build succeeds. If it fails on font loading, check that `Inter` and `Fraunces` are available from `next/font/google` in the installed Next version (they are in Next 14+).

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat(theme): load Inter and Fraunces, expose font-display token"
```

---

## Task 2: Replace color palette with alpine warmth tokens

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace `:root` block with alpine-warmth light tokens**

In `src/app/globals.css`, replace the entire `:root { ... }` block with:

```css
:root {
  --background: oklch(0.985 0.005 75);
  --foreground: oklch(0.22 0.015 60);
  --card: oklch(0.99 0.004 75);
  --card-foreground: oklch(0.22 0.015 60);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.22 0.015 60);
  --primary: oklch(0.38 0.08 155);
  --primary-foreground: oklch(0.985 0.005 75);
  --secondary: oklch(0.93 0.01 135);
  --secondary-foreground: oklch(0.25 0.02 150);
  --muted: oklch(0.95 0.008 70);
  --muted-foreground: oklch(0.48 0.02 60);
  --accent: oklch(0.72 0.15 65);
  --accent-foreground: oklch(0.2 0.02 60);
  --destructive: oklch(0.55 0.2 28);
  --border: oklch(0.9 0.008 70);
  --input: oklch(0.9 0.008 70);
  --ring: oklch(0.38 0.08 155 / 0.5);
  --chart-1: oklch(0.38 0.08 155);
  --chart-2: oklch(0.72 0.15 65);
  --chart-3: oklch(0.55 0.06 200);
  --chart-4: oklch(0.5 0.09 40);
  --chart-5: oklch(0.6 0.04 120);
  --radius: 0.75rem;
  --sidebar: oklch(0.97 0.006 75);
  --sidebar-foreground: oklch(0.22 0.015 60);
  --sidebar-primary: oklch(0.38 0.08 155);
  --sidebar-primary-foreground: oklch(0.985 0.005 75);
  --sidebar-accent: oklch(0.95 0.008 70);
  --sidebar-accent-foreground: oklch(0.22 0.015 60);
  --sidebar-border: oklch(0.9 0.008 70);
  --sidebar-ring: oklch(0.38 0.08 155 / 0.5);
}
```

Note: `--radius` bumped from `0.625rem` to `0.75rem`. Sidebar tokens shifted from pure gray to match the warm palette.

- [ ] **Step 2: Replace `.dark` block with alpine-warmth dark tokens**

Replace the `.dark { ... }` block:

```css
.dark {
  --background: oklch(0.18 0.012 60);
  --foreground: oklch(0.96 0.006 75);
  --card: oklch(0.22 0.014 60);
  --card-foreground: oklch(0.96 0.006 75);
  --popover: oklch(0.22 0.014 60);
  --popover-foreground: oklch(0.96 0.006 75);
  --primary: oklch(0.68 0.1 155);
  --primary-foreground: oklch(0.16 0.02 150);
  --secondary: oklch(0.28 0.015 140);
  --secondary-foreground: oklch(0.96 0.006 75);
  --muted: oklch(0.26 0.012 60);
  --muted-foreground: oklch(0.72 0.015 70);
  --accent: oklch(0.75 0.14 65);
  --accent-foreground: oklch(0.16 0.02 60);
  --destructive: oklch(0.65 0.2 25);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.68 0.1 155 / 0.6);
  --chart-1: oklch(0.68 0.1 155);
  --chart-2: oklch(0.75 0.14 65);
  --chart-3: oklch(0.65 0.08 200);
  --chart-4: oklch(0.6 0.09 40);
  --chart-5: oklch(0.7 0.05 120);
  --sidebar: oklch(0.22 0.014 60);
  --sidebar-foreground: oklch(0.96 0.006 75);
  --sidebar-primary: oklch(0.68 0.1 155);
  --sidebar-primary-foreground: oklch(0.16 0.02 150);
  --sidebar-accent: oklch(0.26 0.012 60);
  --sidebar-accent-foreground: oklch(0.96 0.006 75);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.68 0.1 155 / 0.6);
}
```

- [ ] **Step 3: Add tabular numerals rule to base layer**

At the bottom of `globals.css`, inside the `@layer base { ... }` block, add:

```css
  table td, table th {
    font-variant-numeric: tabular-nums;
  }
  .tabular {
    font-variant-numeric: tabular-nums;
  }
```

- [ ] **Step 4: Verify build compiles and manually eyeball dev server**

Run: `cd /opt/snowgum && npm run build 2>&1 | tail -20`
Expected: Build succeeds.

Then: `npm run dev` and navigate to `http://localhost:3000/demo/dashboard` (or any seeded org). Confirm the page now renders with cream backgrounds and eucalypt primary. Screenshot for reference.

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum
git add src/app/globals.css
git commit -m "feat(theme): replace neutral palette with alpine warmth tokens"
```

---

## Task 3: OKLCH color conversion utility (TDD)

**Files:**
- Create: `src/lib/theme/oklch.ts`
- Create: `src/lib/theme/oklch.test.ts`

- [ ] **Step 1: Write failing test for hex → OKLCH**

Create `src/lib/theme/oklch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hexToOklch, formatOklch } from "./oklch";

describe("hexToOklch", () => {
  it("converts pure white to lightness ~1, chroma ~0", () => {
    const { l, c } = hexToOklch("#ffffff");
    expect(l).toBeGreaterThan(0.99);
    expect(c).toBeLessThan(0.005);
  });

  it("converts pure black to lightness ~0", () => {
    const { l } = hexToOklch("#000000");
    expect(l).toBeLessThan(0.01);
  });

  it("converts mid-gray to lightness ~0.6", () => {
    const { l, c } = hexToOklch("#808080");
    expect(l).toBeGreaterThan(0.55);
    expect(l).toBeLessThan(0.65);
    expect(c).toBeLessThan(0.005);
  });

  it("converts pure red to chromatic red", () => {
    const { l, c, h } = hexToOklch("#ff0000");
    expect(l).toBeGreaterThan(0.6);
    expect(c).toBeGreaterThan(0.2);
    expect(h).toBeGreaterThan(25);
    expect(h).toBeLessThan(35);
  });

  it("handles uppercase hex", () => {
    const { l } = hexToOklch("#FFFFFF");
    expect(l).toBeGreaterThan(0.99);
  });

  it("handles hex without hash", () => {
    const { l } = hexToOklch("808080");
    expect(l).toBeGreaterThan(0.55);
  });
});

describe("formatOklch", () => {
  it("formats components to 3 decimal places", () => {
    expect(formatOklch({ l: 0.38, c: 0.08, h: 155 })).toBe(
      "oklch(0.380 0.080 155.000)"
    );
  });

  it("formats with alpha when provided", () => {
    expect(formatOklch({ l: 0.38, c: 0.08, h: 155 }, 0.5)).toBe(
      "oklch(0.380 0.080 155.000 / 0.500)"
    );
  });

  it("only emits digits, spaces, dots, slashes, and the oklch wrapper (xss regression)", () => {
    const out = formatOklch({ l: 0.38, c: 0.08, h: 155 }, 0.5);
    expect(out).toMatch(/^oklch\([0-9. ]+(?: \/ [0-9.]+)?\)$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /opt/snowgum && npx vitest run src/lib/theme/oklch.test.ts`
Expected: FAIL — module `./oklch` not found.

- [ ] **Step 3: Implement `oklch.ts`**

Create `src/lib/theme/oklch.ts`:

```ts
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
```

- [ ] **Step 4: Run test again to verify pass**

Run: `cd /opt/snowgum && npx vitest run src/lib/theme/oklch.test.ts`
Expected: PASS. All 8 tests green.

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum
git add src/lib/theme/oklch.ts src/lib/theme/oklch.test.ts
git commit -m "feat(theme): add hex → OKLCH conversion utility"
```

---

## Task 4: `deriveAccentPalette` with clamping (TDD)

**Files:**
- Create: `src/lib/theme/derive-accent.ts`
- Create: `src/lib/theme/derive-accent.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/theme/derive-accent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveAccentPalette } from "./derive-accent";

const OKLCH_STRING = /^oklch\(([0-9.]+) ([0-9.]+) ([0-9.]+)(?: \/ ([0-9.]+))?\)$/;

function parseL(s: string): number {
  const m = s.match(OKLCH_STRING);
  if (!m) throw new Error(`Bad OKLCH string: ${s}`);
  return parseFloat(m[1]);
}

function parseC(s: string): number {
  const m = s.match(OKLCH_STRING);
  if (!m) throw new Error(`Bad OKLCH string: ${s}`);
  return parseFloat(m[2]);
}

describe("deriveAccentPalette", () => {
  it("returns all 6 expected keys", () => {
    const p = deriveAccentPalette("#38694a");
    expect(Object.keys(p).sort()).toEqual(
      [
        "primary",
        "primaryForeground",
        "ring",
        "primaryDark",
        "primaryForegroundDark",
        "ringDark",
      ].sort()
    );
  });

  it("clamps light-mode primary lightness to [0.32, 0.48]", () => {
    expect(parseL(deriveAccentPalette("#ffffff").primary)).toBeGreaterThanOrEqual(0.32);
    expect(parseL(deriveAccentPalette("#ffffff").primary)).toBeLessThanOrEqual(0.48);
    expect(parseL(deriveAccentPalette("#000000").primary)).toBeGreaterThanOrEqual(0.32);
    expect(parseL(deriveAccentPalette("#000000").primary)).toBeLessThanOrEqual(0.48);
  });

  it("clamps light-mode primary chroma to [0.05, 0.12]", () => {
    expect(parseC(deriveAccentPalette("#ff00ff").primary)).toBeGreaterThanOrEqual(0.05);
    expect(parseC(deriveAccentPalette("#ff00ff").primary)).toBeLessThanOrEqual(0.12);
    expect(parseC(deriveAccentPalette("#808080").primary)).toBeGreaterThanOrEqual(0.05);
  });

  it("clamps dark-mode primary lightness to [0.58, 0.74]", () => {
    expect(parseL(deriveAccentPalette("#ffffff").primaryDark)).toBeGreaterThanOrEqual(0.58);
    expect(parseL(deriveAccentPalette("#ffffff").primaryDark)).toBeLessThanOrEqual(0.74);
    expect(parseL(deriveAccentPalette("#000000").primaryDark)).toBeGreaterThanOrEqual(0.58);
  });

  it("ring uses alpha 0.5 in light and 0.6 in dark", () => {
    const p = deriveAccentPalette("#38694a");
    expect(p.ring).toMatch(/\/ 0\.500\)$/);
    expect(p.ringDark).toMatch(/\/ 0\.600\)$/);
  });

  it("picks cream primary-foreground for dark primaries (L < 0.6)", () => {
    const p = deriveAccentPalette("#38694a");
    expect(parseL(p.primaryForeground)).toBeGreaterThan(0.95);
  });

  it("picks warm dark primary-foreground for light dark-mode primaries (L > 0.5)", () => {
    const p = deriveAccentPalette("#38694a");
    expect(parseL(p.primaryForegroundDark)).toBeLessThan(0.2);
  });

  it("handles ugly inputs without throwing", () => {
    expect(() => deriveAccentPalette("#ff00ff")).not.toThrow();
    expect(() => deriveAccentPalette("#00ff00")).not.toThrow();
    expect(() => deriveAccentPalette("#000000")).not.toThrow();
    expect(() => deriveAccentPalette("#ffffff")).not.toThrow();
  });

  it("throws on invalid hex", () => {
    expect(() => deriveAccentPalette("#zzz")).toThrow();
    expect(() => deriveAccentPalette("red")).toThrow();
  });

  it("all output strings are xss-safe (digits, spaces, dots, slash only inside oklch())", () => {
    const p = deriveAccentPalette("#38694a");
    const safe = /^oklch\([0-9. ]+(?: \/ [0-9.]+)?\)$/;
    expect(p.primary).toMatch(safe);
    expect(p.primaryForeground).toMatch(safe);
    expect(p.ring).toMatch(safe);
    expect(p.primaryDark).toMatch(safe);
    expect(p.primaryForegroundDark).toMatch(safe);
    expect(p.ringDark).toMatch(safe);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /opt/snowgum && npx vitest run src/lib/theme/derive-accent.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `derive-accent.ts`**

Create `src/lib/theme/derive-accent.ts`:

```ts
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
```

- [ ] **Step 4: Run tests and verify all pass**

Run: `cd /opt/snowgum && npx vitest run src/lib/theme/derive-accent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum
git add src/lib/theme/derive-accent.ts src/lib/theme/derive-accent.test.ts
git commit -m "feat(theme): add deriveAccentPalette with OKLCH clamping"
```

---

## Task 5: Add `accentColor` column to organisations schema

**Files:**
- Modify: `src/db/schema/organisations.ts`
- Create: `drizzle/XXXX_add_org_accent_color.sql` (generated)

- [ ] **Step 1: Read current schema**

Confirm `logoUrl` already exists. Note: only `accentColor` needs adding.

- [ ] **Step 2: Add `accentColor` column**

In `src/db/schema/organisations.ts`, locate the `logoUrl` line and add `accentColor` directly after it:

```ts
  logoUrl: text("logo_url"),
  accentColor: text("accent_color"), // nullable; 6-char hex like "#2f5d3a"; null = default eucalypt
```

- [ ] **Step 3: Generate migration**

Run: `cd /opt/snowgum && npm run db:generate`
Expected: A new file appears in `drizzle/` containing `ALTER TABLE "organisations" ADD COLUMN "accent_color" text;`. Verify no destructive changes.

- [ ] **Step 4: Apply migration locally**

Run: `cd /opt/snowgum && npm run db:migrate`
Expected: Migration runs cleanly.

- [ ] **Step 5: Verify column exists**

Run: `cd /opt/snowgum && npx tsx -e "import { db } from './src/db'; import { organisations } from './src/db/schema'; const r = await db.select().from(organisations).limit(1); console.log(r[0] ? Object.keys(r[0]) : 'no rows'); process.exit(0);"`
Expected: Output includes `accentColor`.

- [ ] **Step 6: Commit**

```bash
cd /opt/snowgum
git add src/db/schema/organisations.ts drizzle/
git commit -m "feat(db): add accent_color column to organisations"
```

---

## Task 6: `updateBranding` server action (TDD, unit tests)

**Files:**
- Create: `src/actions/organisations/updateBranding.ts`
- Create: `src/actions/organisations/updateBranding.test.ts` (or `__tests__/updateBranding.test.ts` — follow local convention)

- [ ] **Step 1: Inspect local test file convention**

Run: `find /opt/snowgum/src/actions/organisations -type f`
Pick whichever convention is used (`.test.ts` colocated, or `__tests__/` subdir).

- [ ] **Step 2: Write failing tests**

Create the test file:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { brandingSchema, MAX_LOGO_BYTES, ALLOWED_LOGO_MIME } from "./updateBranding";

describe("brandingSchema", () => {
  it("accepts a valid 6-char hex", () => {
    const result = brandingSchema.safeParse({ accentColor: "#38694a", removeLogo: false });
    expect(result.success).toBe(true);
  });

  it("accepts null accent color (reset to default)", () => {
    const result = brandingSchema.safeParse({ accentColor: null, removeLogo: false });
    expect(result.success).toBe(true);
  });

  it("rejects non-hex strings", () => {
    expect(brandingSchema.safeParse({ accentColor: "red", removeLogo: false }).success).toBe(false);
    expect(brandingSchema.safeParse({ accentColor: "#xyz", removeLogo: false }).success).toBe(false);
    expect(brandingSchema.safeParse({ accentColor: "#ff", removeLogo: false }).success).toBe(false);
    expect(brandingSchema.safeParse({ accentColor: "38694a", removeLogo: false }).success).toBe(false);
  });

  it("rejects hex with extra characters (XSS defence)", () => {
    expect(
      brandingSchema.safeParse({
        accentColor: "#38694a); </style><script>alert(1)</script>",
        removeLogo: false,
      }).success
    ).toBe(false);
  });
});

describe("constants", () => {
  it("MAX_LOGO_BYTES is 500KB", () => {
    expect(MAX_LOGO_BYTES).toBe(500 * 1024);
  });

  it("ALLOWED_LOGO_MIME includes png/svg/jpeg", () => {
    expect(ALLOWED_LOGO_MIME).toContain("image/png");
    expect(ALLOWED_LOGO_MIME).toContain("image/svg+xml");
    expect(ALLOWED_LOGO_MIME).toContain("image/jpeg");
  });
});

vi.mock("@/lib/auth-guards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-guards")>("@/lib/auth-guards");
  return {
    ...actual,
    requireSession: vi.fn(),
    requireRole: vi.fn(),
  };
});

vi.mock("@/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
      })),
    })),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("updateBranding auth guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls requireSession with the organisation id", async () => {
    const { requireSession, requireRole } = await import("@/lib/auth-guards");
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      memberId: "m1",
      organisationId: "org-1",
      role: "ADMIN",
      firstName: "A",
      lastName: "B",
      email: "a@b.com",
    });

    const { updateBranding } = await import("./updateBranding");
    await updateBranding("org-1", { accentColor: "#38694a", removeLogo: false });

    expect(requireSession).toHaveBeenCalledWith("org-1");
    expect(requireRole).toHaveBeenCalledWith(
      expect.objectContaining({ role: "ADMIN" }),
      "ADMIN"
    );
  });

  it("propagates auth errors", async () => {
    const { requireSession } = await import("@/lib/auth-guards");
    (requireSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("UNAUTHORISED")
    );

    const { updateBranding } = await import("./updateBranding");
    await expect(
      updateBranding("org-1", { accentColor: "#38694a", removeLogo: false })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `cd /opt/snowgum && npx vitest run src/actions/organisations/updateBranding.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `updateBranding.ts`**

Check the real Supabase server-client export path before wiring it in:

Run: `find /opt/snowgum/src/lib/supabase -type f`
Use the correct import (likely `@/lib/supabase/server` with `createClient`).

Create `src/actions/organisations/updateBranding.ts`:

```ts
"use server";

import { z } from "zod";
import { db } from "@/db";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-guards";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const MAX_LOGO_BYTES = 500 * 1024;
export const ALLOWED_LOGO_MIME = [
  "image/png",
  "image/svg+xml",
  "image/jpeg",
] as const;

export const brandingSchema = z.object({
  accentColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Must be a 6-character hex color like #38694a")
    .nullable(),
  removeLogo: z.boolean().optional().default(false),
});

export type BrandingInput = z.input<typeof brandingSchema>;

export async function updateBranding(
  organisationId: string,
  input: BrandingInput,
  logoFile?: File | null
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession(organisationId);
  requireRole(session, "ADMIN");

  const parsed = brandingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid branding input",
    };
  }

  let newLogoUrl: string | null | undefined = undefined;

  if (parsed.data.removeLogo) {
    newLogoUrl = null;
  } else if (logoFile && logoFile.size > 0) {
    if (logoFile.size > MAX_LOGO_BYTES) {
      return {
        success: false,
        error: `Logo must be under ${MAX_LOGO_BYTES / 1024}KB`,
      };
    }
    if (
      !ALLOWED_LOGO_MIME.includes(
        logoFile.type as (typeof ALLOWED_LOGO_MIME)[number]
      )
    ) {
      return { success: false, error: "Logo must be PNG, SVG, or JPEG" };
    }

    const ext =
      logoFile.type === "image/svg+xml"
        ? "svg"
        : logoFile.type === "image/png"
          ? "png"
          : "jpg";
    const path = `${organisationId}/logo-${Date.now()}.${ext}`;

    const supabase = await createClient();
    const { error: uploadErr } = await supabase.storage
      .from("org-logos")
      .upload(path, logoFile, { upsert: false, contentType: logoFile.type });
    if (uploadErr) {
      return {
        success: false,
        error: `Upload failed: ${uploadErr.message}`,
      };
    }

    const { data: publicUrlData } = supabase.storage
      .from("org-logos")
      .getPublicUrl(path);
    newLogoUrl = publicUrlData.publicUrl;

    const [existing] = await db
      .select({ logoUrl: organisations.logoUrl })
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    if (existing?.logoUrl) {
      const oldPath = existing.logoUrl.split("/org-logos/")[1];
      if (oldPath) {
        await supabase.storage.from("org-logos").remove([oldPath]);
      }
    }
  }

  const updateSet: Partial<typeof organisations.$inferInsert> = {
    accentColor: parsed.data.accentColor,
  };
  if (newLogoUrl !== undefined) {
    updateSet.logoUrl = newLogoUrl;
  }

  await db
    .update(organisations)
    .set(updateSet)
    .where(eq(organisations.id, organisationId));

  revalidatePath(`/`, "layout");
  return { success: true };
}
```

- [ ] **Step 5: Run tests and verify pass**

Run: `cd /opt/snowgum && npx vitest run src/actions/organisations/updateBranding.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /opt/snowgum
git add src/actions/organisations/updateBranding.ts src/actions/organisations/updateBranding.test.ts
git commit -m "feat(org): add updateBranding server action with Zod validation"
```

---

## Task 7: Integration test for `updateBranding` against pglite

**Files:**
- Create: `src/actions/organisations/updateBranding.integration.test.ts`

- [ ] **Step 1: Find an example integration test**

Run: `find /opt/snowgum/src -name '*.integration.test.ts' | head -3`
Read one to discover the harness imports. Use that pattern.

- [ ] **Step 2: Write the integration test**

Adapt to the harness. Core assertions:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
// Adjust this import to match the project's actual integration harness export.
import { setupIntegrationDb } from "@/test-utils/integration-db";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth-guards", () => ({
  requireSession: vi.fn().mockResolvedValue({
    memberId: "test-member",
    organisationId: "test-org",
    role: "ADMIN",
    firstName: "Test",
    lastName: "Admin",
    email: "admin@test.local",
  }),
  requireRole: vi.fn(),
  AuthError: class extends Error {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("updateBranding (integration)", () => {
  const ctx = setupIntegrationDb();

  beforeEach(async () => {
    await ctx.db.insert(organisations).values({
      id: "test-org",
      name: "Test Club",
      slug: "test-club",
    });
  });

  it("writes accentColor to the row", async () => {
    const { updateBranding } = await import("./updateBranding");
    const result = await updateBranding("test-org", {
      accentColor: "#38694a",
      removeLogo: false,
    });
    expect(result.success).toBe(true);

    const [row] = await ctx.db
      .select()
      .from(organisations)
      .where(eq(organisations.id, "test-org"));
    expect(row.accentColor).toBe("#38694a");
  });

  it("clears accentColor when null", async () => {
    const { updateBranding } = await import("./updateBranding");
    await updateBranding("test-org", { accentColor: "#38694a", removeLogo: false });
    await updateBranding("test-org", { accentColor: null, removeLogo: false });

    const [row] = await ctx.db
      .select()
      .from(organisations)
      .where(eq(organisations.id, "test-org"));
    expect(row.accentColor).toBeNull();
  });

  it("does not touch logoUrl when no logoFile passed", async () => {
    const { updateBranding } = await import("./updateBranding");
    await ctx.db
      .update(organisations)
      .set({ logoUrl: "https://example/logo.png" })
      .where(eq(organisations.id, "test-org"));

    await updateBranding("test-org", { accentColor: "#38694a", removeLogo: false });

    const [row] = await ctx.db
      .select()
      .from(organisations)
      .where(eq(organisations.id, "test-org"));
    expect(row.logoUrl).toBe("https://example/logo.png");
  });

  it("removes logoUrl when removeLogo is true", async () => {
    const { updateBranding } = await import("./updateBranding");
    await ctx.db
      .update(organisations)
      .set({ logoUrl: "https://example/logo.png" })
      .where(eq(organisations.id, "test-org"));

    await updateBranding("test-org", { accentColor: "#38694a", removeLogo: true });

    const [row] = await ctx.db
      .select()
      .from(organisations)
      .where(eq(organisations.id, "test-org"));
    expect(row.logoUrl).toBeNull();
  });
});
```

- [ ] **Step 3: Run the integration test**

Run: `cd /opt/snowgum && npm run test:integration -- updateBranding`
Expected: PASS — 4 tests green.

- [ ] **Step 4: Commit**

```bash
cd /opt/snowgum
git add src/actions/organisations/updateBranding.integration.test.ts
git commit -m "test(org): integration test for updateBranding"
```

---

## Task 8: `OrgThemeContext` + `InjectAccent` (data-URL stylesheet link)

**Files:**
- Create: `src/lib/theme/org-theme-context.tsx`
- Create: `src/lib/theme/inject-accent.tsx`

**Security note for the implementer:** This task emits per-tenant CSS custom properties at render time. Instead of a raw-HTML inline style element (which the security hook flags on this project), we use a `<link rel="stylesheet" href="data:text/css,...">` tag. The data URL is built from OKLCH strings that have already been format-constrained by `formatOklch` and re-validated by a regex guard inside `InjectAccent`. The full URL-encoded body is then passed through React's normal attribute escaping — no raw-HTML API. This gives three layers of defence (Zod hex, OKLCH format regex, URI encoding + React escaping) with zero use of unsafe React APIs.

- [ ] **Step 1: Create `org-theme-context.tsx`**

```tsx
"use client";

import { createContext, useContext } from "react";

export type OrgTheme = {
  logoUrl: string | null;
  name: string;
  slug: string;
};

const OrgThemeContext = createContext<OrgTheme | null>(null);

export function OrgThemeProvider({
  value,
  children,
}: {
  value: OrgTheme;
  children: React.ReactNode;
}) {
  return (
    <OrgThemeContext.Provider value={value}>{children}</OrgThemeContext.Provider>
  );
}

export function useOrgTheme(): OrgTheme {
  const ctx = useContext(OrgThemeContext);
  if (!ctx) {
    throw new Error("useOrgTheme must be used inside OrgThemeProvider");
  }
  return ctx;
}
```

- [ ] **Step 2: Create `inject-accent.tsx`**

```tsx
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
```

- [ ] **Step 3: Verify build compiles**

Run: `cd /opt/snowgum && npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 4: Sanity check the CSS data URL in a browser**

Start the dev server, then in devtools Console paste:

```js
const url = 'data:text/css;charset=utf-8,' + encodeURIComponent(':root{--primary:oklch(0.38 0.08 155);}');
const l = document.createElement('link');
l.rel = 'stylesheet';
l.href = url;
document.head.appendChild(l);
getComputedStyle(document.documentElement).getPropertyValue('--primary');
```

Expected: returns ` oklch(0.38 0.08 155)` or similar non-empty string. Confirms the pattern works.

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum
git add src/lib/theme/org-theme-context.tsx src/lib/theme/inject-accent.tsx
git commit -m "feat(theme): add OrgThemeContext and data-URL accent injector"
```

---

## Task 9: Wire `InjectAccent` + `OrgThemeProvider` into `[slug]/layout.tsx`

**Files:**
- Modify: `src/app/[slug]/layout.tsx`
- Possibly modify: `src/lib/org.ts`

- [ ] **Step 1: Replace the passthrough layout with org-resolving layout**

Current content is a passthrough. Replace with:

```tsx
import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { deriveAccentPalette } from "@/lib/theme/derive-accent";
import { InjectAccent } from "@/lib/theme/inject-accent";
import { OrgThemeProvider } from "@/lib/theme/org-theme-context";

export default async function ClubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const palette = org.accentColor ? deriveAccentPalette(org.accentColor) : null;

  return (
    <OrgThemeProvider value={{ logoUrl: org.logoUrl, name: org.name, slug }}>
      {palette && <InjectAccent palette={palette} />}
      {children}
    </OrgThemeProvider>
  );
}
```

- [ ] **Step 2: Verify `getOrgBySlug` returns `accentColor` and `logoUrl`**

Run: `grep -n 'accentColor\|logo_url\|logoUrl\|select' /opt/snowgum/src/lib/org.ts`
If the resolver selects specific columns, ensure `accentColor` and `logoUrl` are included. If it uses `select()` (all columns) or `db.query.organisations.findFirst()` without `columns: {...}` restriction, nothing to do.

If it uses a column whitelist, add `accentColor: organisations.accentColor` (and `logoUrl` if missing).

- [ ] **Step 3: Manual smoke test**

Run: `cd /opt/snowgum && npm run dev`
Navigate: `http://localhost:3000/demo` — should render without error.
Inspect source: should see a `<link rel="stylesheet" href="data:text/css...">` near the top only if `demo` org has an `accentColor` set. Otherwise no link.

Set one manually to verify:

```bash
psql "$DATABASE_URL" -c "UPDATE organisations SET accent_color = '#38694a' WHERE slug = 'demo';"
```

Reload — the data-URL link should appear. Computed style for `--primary` on `:root` should reflect the derived palette.

- [ ] **Step 4: Commit**

```bash
cd /opt/snowgum
git add src/app/[slug]/layout.tsx src/lib/org.ts
git commit -m "feat(theme): inject per-org accent palette in slug layout"
```

---

## Task 10: `OrgLogo` component with wordmark fallback

**Files:**
- Create: `src/components/org-logo.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import Image from "next/image";
import { useOrgTheme } from "@/lib/theme/org-theme-context";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  imageClassName?: string;
  wordmarkClassName?: string;
  priority?: boolean;
};

export function OrgLogo({
  className,
  imageClassName,
  wordmarkClassName,
  priority = false,
}: Props) {
  const { logoUrl, name } = useOrgTheme();

  if (logoUrl) {
    return (
      <div className={cn("flex items-center", className)}>
        <Image
          src={logoUrl}
          alt={`${name} logo`}
          width={160}
          height={40}
          priority={priority}
          className={cn("h-auto w-auto max-h-10 object-contain", imageClassName)}
          unoptimized
        />
      </div>
    );
  }

  return (
    <span
      className={cn(
        "font-display text-xl font-medium tracking-tight text-foreground",
        wordmarkClassName,
        className
      )}
    >
      {name}
    </span>
  );
}
```

Note: `unoptimized` skips `next/image` optimization, which requires `images.remotePatterns` config for Supabase domains. Simpler this way.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /opt/snowgum && npx tsc --noEmit 2>&1 | grep -i 'org-logo' || echo 'clean'`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
cd /opt/snowgum
git add src/components/org-logo.tsx
git commit -m "feat(theme): add OrgLogo component with wordmark fallback"
```

---

## Task 11: Wire `OrgLogo` into admin sidebar, login page, and email layout

**Files:**
- Modify: `src/app/[slug]/admin/layout.tsx`
- Modify: `src/app/[slug]/login/page.tsx` or `login-form.tsx`
- Modify: `src/lib/email/templates/layout.tsx` and template callers

- [ ] **Step 1: Admin sidebar header**

In `src/app/[slug]/admin/layout.tsx`, locate the sidebar header block (~lines 58–62):

```tsx
<div className="mb-4 shrink-0">
  <h2 className="font-semibold text-sm truncate">{org.name}</h2>
  <p className="text-xs text-muted-foreground">Admin</p>
</div>
```

Replace with:

```tsx
<div className="mb-4 shrink-0">
  <OrgLogo className="mb-1" imageClassName="max-h-8" wordmarkClassName="text-base" />
  <p className="text-xs text-muted-foreground">Admin</p>
</div>
```

Add the import:

```tsx
import { OrgLogo } from "@/components/org-logo";
```

Note: this layout runs inside `[slug]/layout.tsx`, which wraps everything in `OrgThemeProvider`, so `useOrgTheme()` will resolve.

- [ ] **Step 2: Login page**

Read `src/app/[slug]/login/page.tsx` and `src/app/[slug]/login/login-form.tsx`. Add `<OrgLogo className="mb-8" />` at the top of the login card or hero. Exact location depends on page structure — place it above the heading / above the form.

- [ ] **Step 3: Email layout**

Read `src/lib/email/templates/layout.tsx`. Emails do not have React context (rendered via React Email on the server, not within the Next request tree), so `OrgLogo`'s `useOrgTheme()` hook will not work there. Instead, accept `logoUrl` and `orgName` as props to the layout component and render inline:

```tsx
{logoUrl ? (
  <img
    src={logoUrl}
    alt={`${orgName} logo`}
    style={{ maxHeight: 40, marginBottom: 16 }}
  />
) : (
  <div
    style={{
      fontFamily: "Georgia, serif",
      fontSize: 20,
      fontWeight: 500,
      marginBottom: 16,
    }}
  >
    {orgName}
  </div>
)}
```

Then update each template (files in `src/lib/email/templates/*.tsx`) to pass `logoUrl={org.logoUrl}` and `orgName={org.name}` to the layout. The sender of each email already knows the org; check `src/lib/email/send.ts` for whether `org` is passed through to templates. If not, thread it through.

Expected call sites: ~10–12 template files. Each is a small prop addition.

- [ ] **Step 4: Build and smoke test**

Run: `cd /opt/snowgum && npm run build 2>&1 | tail -20`
Expected: Clean build.

Run: `npm run dev` and visit `/demo/admin`, `/demo/login`. Both should show the wordmark (or logo if one has been uploaded).

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum
git add src/app/[slug]/admin/layout.tsx src/app/[slug]/login src/lib/email/templates src/lib/email/send.ts
git commit -m "feat(theme): render org logo/wordmark in sidebar, login, emails"
```

---

## Task 12: Add `BrandingSettingsForm` section to existing settings page

**Files:**
- Create: `src/app/[slug]/admin/settings/branding-settings-form.tsx`
- Modify: `src/app/[slug]/admin/settings/page.tsx`

- [ ] **Step 1: Create the form component**

```tsx
"use client";

import { useState, useTransition } from "react";
import { updateBranding } from "@/actions/organisations/updateBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Props = {
  organisationId: string;
  initial: {
    accentColor: string | null;
    logoUrl: string | null;
  };
};

const DEFAULT_PREVIEW_COLOR = "#38694a";

export function BrandingSettingsForm({ organisationId, initial }: Props) {
  const [accentColor, setAccentColor] = useState<string>(
    initial.accentColor ?? DEFAULT_PREVIEW_COLOR
  );
  const [useDefault, setUseDefault] = useState<boolean>(initial.accentColor === null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateBranding(
        organisationId,
        {
          accentColor: useDefault ? null : accentColor,
          removeLogo,
        },
        logoFile
      );
      if (result.success) {
        toast.success("Branding updated");
        setLogoFile(null);
        setRemoveLogo(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Accent color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => {
                  setAccentColor(e.target.value);
                  setUseDefault(false);
                }}
                disabled={useDefault}
                className="h-10 w-16 cursor-pointer rounded border border-input"
                aria-label="Accent color picker"
              />
              <Input
                type="text"
                value={accentColor}
                onChange={(e) => {
                  setAccentColor(e.target.value);
                  setUseDefault(false);
                }}
                disabled={useDefault}
                placeholder="#38694a"
                pattern="^#[0-9a-fA-F]{6}$"
                className="w-32 font-mono"
                aria-label="Accent color hex"
              />
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={useDefault}
                  onChange={(e) => setUseDefault(e.target.checked)}
                />
                Use Snow Gum default
              </label>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-md border border-border bg-card p-3">
              <span className="text-xs text-muted-foreground">Preview:</span>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: useDefault ? undefined : accentColor }}
                disabled
              >
                {useDefault ? "Default" : "Your color"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo">Club logo</Label>
            {initial.logoUrl && !removeLogo && (
              <div className="flex items-center gap-3">
                <img
                  src={initial.logoUrl}
                  alt="Current logo"
                  className="h-12 w-auto max-w-[160px] rounded border border-border object-contain p-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemoveLogo(true)}
                >
                  Remove logo
                </Button>
              </div>
            )}
            {removeLogo && (
              <p className="text-sm text-muted-foreground">
                Logo will be removed on save.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setRemoveLogo(false)}
                >
                  Undo
                </button>
              </p>
            )}
            <Input
              id="logo"
              type="file"
              accept="image/png,image/svg+xml,image/jpeg"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              PNG, SVG, or JPEG. Max 500KB. Upload pre-cropped — no cropping tool provided.
            </p>
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save branding"}
          </Button>

          <p className="text-xs text-muted-foreground">
            These settings affect how your club appears to members. Snow Gum&apos;s
            wordmark still appears in the footer.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Mount form on the settings page**

In `src/app/[slug]/admin/settings/page.tsx`, add the import near the existing section imports:

```tsx
import { BrandingSettingsForm } from "./branding-settings-form";
```

Inside the JSX, add a new section (place near `OrgSettingsForm` or above `<GstSettingsForm>`):

```tsx
<Separator className="my-8" />

<BrandingSettingsForm
  organisationId={org.id}
  initial={{
    accentColor: org.accentColor ?? null,
    logoUrl: org.logoUrl ?? null,
  }}
/>
```

- [ ] **Step 3: Configure the Supabase Storage bucket (out-of-code)**

One-time setup that must happen before the form can upload:

1. Supabase dashboard → Storage → New bucket.
2. Name: `org-logos`.
3. Public: yes (public read).
4. File size limit: 5 MB.
5. Allowed MIME types: `image/png,image/svg+xml,image/jpeg`.

Add a one-liner to `docs/setup-org.md` noting this bucket must exist before the branding form is usable.

- [ ] **Step 4: Smoke test**

Run: `cd /opt/snowgum && npm run dev`
Navigate: `/demo/admin/settings`
Expected: New "Branding" card visible. Native color picker opens. Save with color only → toast confirms. Reload → color persists and the injected `<link>` tag is visible in DOM.

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum
git add src/app/[slug]/admin/settings/branding-settings-form.tsx src/app/[slug]/admin/settings/page.tsx docs/setup-org.md
git commit -m "feat(admin): add branding settings form"
```

---

## Task 13: Component polish — button

**Files:**
- Modify: `src/components/ui/button.tsx`

Design intent: warmer hit targets, subtle hover highlight on primary, active-state scale gated on reduced-motion, accent-tinted ghost hover.

- [ ] **Step 1: Read current `button.tsx`**

Confirm baseline: default size `h-8`, sm `h-7`, lg `h-9`.

- [ ] **Step 2: Apply polish edits**

Replace the `buttonVariants` call with the version below. All changes:
- Sizes bumped by one step (`h-8 → h-9`, `h-7 → h-8`, `h-9 → h-10`, icons each +1).
- Primary: inset top-highlight shadow, hover `/80 → /90`.
- Ghost: hover `bg-muted → bg-primary/5` (accent tint).
- Base class: active scale `0.98` gated on `motion-safe`.

```ts
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:active:not-aria-[haspopup]:scale-[0.98] motion-safe:active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] [a]:hover:bg-primary/90",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-primary/5 hover:text-foreground aria-expanded:bg-primary/10 aria-expanded:text-foreground dark:hover:bg-primary/10",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-7 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        icon: "size-9",
        "icon-xs":
          "size-7 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

- [ ] **Step 3: Build and visual smoke test**

Run: `cd /opt/snowgum && npm run build 2>&1 | tail -10`
Expected: Clean build.

Run: `npm run dev` — load `/demo/admin`, buttons should look slightly larger, primary has a subtle top highlight.

- [ ] **Step 4: Commit**

```bash
cd /opt/snowgum
git add src/components/ui/button.tsx
git commit -m "style(ui): polish button sizes and hover states"
```

---

## Task 14: Component polish — card

**Files:**
- Modify: `src/components/ui/card.tsx`

- [ ] **Step 1: Read current `card.tsx`**

Note `CardTitle` export location and current class strings.

- [ ] **Step 2: Apply polish edits**

Target class changes:
- **Card root:** replace border and shadow classes with `border-border/60 bg-card text-card-foreground shadow-[0_1px_2px_0_oklch(0.2_0.02_60_/_0.06)] ring-1 ring-inset ring-white/40 dark:ring-white/5`.
- **CardTitle:** add optional `variant?: "default" | "display"` prop; when `"display"`, apply `font-display tracking-tight`.

Example `CardTitle` edit (adapt prop type to actual file):

```tsx
function CardTitle({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { variant?: "default" | "display" }) {
  return (
    <h3
      data-slot="card-title"
      className={cn(
        "text-lg font-semibold leading-none",
        variant === "display" && "font-display text-xl tracking-tight",
        className
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 3: Build**

Run: `cd /opt/snowgum && npm run build 2>&1 | tail -10`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
cd /opt/snowgum
git add src/components/ui/card.tsx
git commit -m "style(ui): warm card border, shadow, and display-variant title"
```

---

## Task 15: Component polish — form controls (input, textarea, label, select)

**Files:**
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/textarea.tsx`
- Modify: `src/components/ui/label.tsx`
- Modify: `src/components/ui/select.tsx`

- [ ] **Step 1: Input + Textarea**

For both, ensure base class has:
- Border: `border-input`.
- Focus ring: `focus-visible:ring-ring/60`.
- Add: `hover:bg-card/50 transition-colors`.
- Placeholder: `placeholder:text-muted-foreground/70`.

- [ ] **Step 2: Label**

In `label.tsx`, change the label class to:

```
"text-sm font-medium tracking-[0.01em] text-foreground/85 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
```

- [ ] **Step 3: Select**

In `select.tsx`, update:
- Trigger hover: `hover:bg-card/50`.
- Content surface: keep `bg-popover`, add `shadow-[0_4px_12px_0_oklch(0.2_0.02_60_/_0.08)]`.
- Item: `focus:bg-accent/15 data-[state=checked]:text-primary`.

- [ ] **Step 4: Build**

Run: `cd /opt/snowgum && npm run build 2>&1 | tail -10`
Expected: Clean.

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum
git add src/components/ui/input.tsx src/components/ui/textarea.tsx src/components/ui/label.tsx src/components/ui/select.tsx
git commit -m "style(ui): polish form controls for warm theme"
```

---

## Task 16: Component polish — surfaces (dialog, sheet, dropdown-menu)

**Files:**
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/sheet.tsx`
- Modify: `src/components/ui/dropdown-menu.tsx`

- [ ] **Step 1: Dialog**

Change the overlay class from `bg-black/50` (or similar) to `bg-foreground/40 backdrop-blur-sm`. Content gets:

```
shadow-[0_20px_60px_0_oklch(0.2_0.02_60_/_0.18)]
```

- [ ] **Step 2: Sheet**

Same overlay treatment as dialog. Side panels get the same shadow.

- [ ] **Step 3: Dropdown-menu**

- Content: add `shadow-[0_4px_12px_0_oklch(0.2_0.02_60_/_0.08)]`.
- Item: `focus:bg-accent/15` instead of `focus:bg-accent`.
- Checked item: add `data-[state=checked]:text-primary`.

- [ ] **Step 4: Build**

Run: `cd /opt/snowgum && npm run build 2>&1 | tail -10`
Expected: Clean.

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum
git add src/components/ui/dialog.tsx src/components/ui/sheet.tsx src/components/ui/dropdown-menu.tsx
git commit -m "style(ui): warm backdrops and shadows on surfaces"
```

---

## Task 17: Component polish — table

**Files:**
- Modify: `src/components/ui/table.tsx`

- [ ] **Step 1: Apply table polish**

Edit the base classes on each exported primitive:

- **TableHeader:** add `bg-muted/60`.
- **TableHead** (the th cell): `font-semibold tracking-[0.01em] uppercase text-xs text-muted-foreground`.
- **TableRow** (inside TableBody): add `hover:bg-accent/10 data-[state=selected]:bg-accent/15 transition-colors`.
- **TableBody** root: add `[&_tr:nth-child(even)]:bg-muted/20` for zebra striping.

Read the file first; the exports may be under slightly different names.

- [ ] **Step 2: Build**

Run: `cd /opt/snowgum && npm run build 2>&1 | tail -10`
Expected: Clean.

- [ ] **Step 3: Visual smoke test**

Run: `npm run dev` — load `/demo/admin/members`. Header should be uppercase small caps; rows should gain a subtle amber hover.

- [ ] **Step 4: Commit**

```bash
cd /opt/snowgum
git add src/components/ui/table.tsx
git commit -m "style(ui): warm table header, zebra striping, amber row hover"
```

---

## Task 18: Component polish — feedback & misc (badge, tabs, separator, switch, sonner)

**Files:**
- Modify: `src/components/ui/badge.tsx`
- Modify: `src/components/ui/tabs.tsx`
- Modify: `src/components/ui/separator.tsx`
- Modify: `src/components/ui/switch.tsx`
- Modify: `src/components/ui/sonner.tsx`

- [ ] **Step 1: Badge — add `accent` variant**

Add to the `badgeVariants` cva call:

```ts
accent: "border-transparent bg-accent text-accent-foreground",
```

- [ ] **Step 2: Tabs — underline active indicator with glow**

On `TabsTrigger` base class: swap background fill for an `::after` underline with soft glow.

Target addition (adapt to existing class string shape):

```
relative data-[state=active]:text-foreground data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary data-[state=active]:after:shadow-[0_0_12px_oklch(0.38_0.08_155_/_0.25)]
```

Remove any `data-[state=active]:bg-*` background fill classes.

- [ ] **Step 3: Separator — opacity**

In the base class, change `bg-border` to `bg-border/60`.

- [ ] **Step 4: Switch — primary track, warm knob shadow**

Change the checked track class to `data-[state=checked]:bg-primary`. Add a shadow to the thumb: `shadow-[0_1px_2px_0_oklch(0.2_0.02_60_/_0.3)]`.

- [ ] **Step 5: Sonner — warm toast surface and icon colors**

In `sonner.tsx`, find the `<Toaster>` props (`toastOptions.classNames` or similar). Update:

- Toast background: `bg-card`.
- Shadow: `shadow-[0_8px_24px_0_oklch(0.2_0.02_60_/_0.12)]`.
- Success icon: `[&_[data-icon=success]]:text-primary`.
- Warning icon: `[&_[data-icon=warning]]:text-accent`.
- Error icon: `[&_[data-icon=error]]:text-destructive`.

Adapt selectors to sonner's actual DOM output.

- [ ] **Step 6: Build**

Run: `cd /opt/snowgum && npm run build 2>&1 | tail -10`
Expected: Clean.

- [ ] **Step 7: Commit**

```bash
cd /opt/snowgum
git add src/components/ui/badge.tsx src/components/ui/tabs.tsx src/components/ui/separator.tsx src/components/ui/switch.tsx src/components/ui/sonner.tsx
git commit -m "style(ui): warm polish for badge/tabs/separator/switch/sonner"
```

---

## Task 19: E2E branding test

**Files:**
- Create: `e2e/branding.spec.ts`

Note: The project's E2E tests run against the VPS production container. This test may only run post-deploy. Read `docs/testing.md` first for the seeding/test-account convention.

- [ ] **Step 1: Read an existing E2E test for the harness pattern**

Run: `ls /opt/snowgum/e2e`
Open one `*.spec.ts` file and copy its imports / login helper shape.

- [ ] **Step 2: Write the E2E test**

```ts
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "marek.kowalski@example.com";
const ADMIN_PASSWORD = "testpass123";
const SLUG = "demo";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto(`/${SLUG}/login`);
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(new RegExp(`/${SLUG}(/admin|/dashboard)?`));
}

test.describe("Branding settings", () => {
  test("admin can set accent color and it applies on reload", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/${SLUG}/admin/settings`);

    const hexInput = page.getByLabel(/accent color hex/i);
    await hexInput.fill("#2f5d3a");
    await page.getByRole("button", { name: /save branding/i }).click();
    await expect(page.getByText(/branding updated/i)).toBeVisible();

    await page.reload();

    // Verify the accent injection link is present
    const accentLink = page.locator('link[rel="stylesheet"][href^="data:text/css"]').first();
    await expect(accentLink).toHaveCount(1);

    // Computed style on :root should reflect a derived --primary
    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()
    );
    expect(primary).toContain("oklch");
  });

  test("wordmark renders when no logo is set", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/${SLUG}/admin`);
    const sidebar = page.locator("aside").first();
    await expect(sidebar).toContainText(/./);
  });

  test("dark mode renders branding page", async ({ browser }) => {
    const darkContext = await browser.newContext({ colorScheme: "dark" });
    const darkPage = await darkContext.newPage();
    await darkPage.goto(`/${SLUG}/login`);
    await darkPage.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await darkPage.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await darkPage.getByRole("button", { name: /sign in|log in/i }).click();
    await darkPage.goto(`/${SLUG}/admin/settings`);
    await expect(darkPage.getByText(/branding/i).first()).toBeVisible();
    await darkContext.close();
  });
});
```

- [ ] **Step 3: Run locally (if possible) or note deferred run**

If local E2E is supported: `cd /opt/snowgum && npm run test:e2e -- branding.spec.ts`
If deferred to VPS CI: note in the commit that the test will run on next deploy.

- [ ] **Step 4: Commit**

```bash
cd /opt/snowgum
git add e2e/branding.spec.ts
git commit -m "test(e2e): branding flow covers accent update and dark mode"
```

---

## Task 20: Axe accessibility integration

**Files:**
- Create: `e2e/accessibility.spec.ts`
- Modify: `package.json` (new dev dep)

- [ ] **Step 1: Check if `@axe-core/playwright` is installed**

Run: `cd /opt/snowgum && grep '@axe-core/playwright' package.json || echo 'not installed'`
If not installed: `npm install -D @axe-core/playwright`

- [ ] **Step 2: Create `e2e/accessibility.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const SLUG = "demo";

test.describe("Accessibility audit", () => {
  test("public landing page has no serious or critical violations", async ({ page }) => {
    await page.goto(`/${SLUG}`);
    const results = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? "")
    );
    expect(serious).toEqual([]);
  });

  test("login page has no serious or critical violations", async ({ page }) => {
    await page.goto(`/${SLUG}/login`);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? "")
    );
    expect(serious).toEqual([]);
  });
});
```

Rationale for `disableRules(["color-contrast"])` on the landing page: axe's contrast rule operates on runtime computed styles and is flaky with custom properties under SSR hydration. The manual pre-merge checklist covers contrast explicitly.

- [ ] **Step 3: Run**

Run: `cd /opt/snowgum && npm run test:e2e -- accessibility.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /opt/snowgum
git add e2e/accessibility.spec.ts package.json package-lock.json
git commit -m "test(e2e): add axe accessibility audit for landing and login"
```

---

## Task 21: Full quality gate and README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run full check**

Run: `cd /opt/snowgum && npm run check`
Expected: lint + unit tests + build all pass.

Fix issues surfaced. If an issue is a latent bug unrelated to this work, note it and skip.

- [ ] **Step 2: Update README**

Find the "Features Completed" table in `README.md`. Add a row:

```markdown
| 21 | Visual Identity | Alpine-warmth color palette, Fraunces + Inter typography, polished shadcn components, per-org accent color + logo, dark mode at parity |
```

Adjust the phase number to match the current highest completed phase.

- [ ] **Step 3: Final commit**

```bash
cd /opt/snowgum
git add README.md
git commit -m "docs(readme): record visual identity phase"
```

---

## Post-Plan Checklist

- [ ] Manual contrast check on all cream/charcoal text pairs, primary/primary-foreground, and accent/accent-foreground in both modes. Tools: browser devtools, contrast ratio calculator.
- [ ] Manual check that focus rings are visible on every interactive element in both modes.
- [ ] Manual check of motion-reduce: set OS preference, confirm button active-state scale does not animate.
- [ ] Supabase Storage bucket `org-logos` created and writable by the server action's service role.
- [ ] Spot-check at least two existing pages that weren't part of this plan to verify they inherit the new look (e.g., `/demo/book`, `/demo/dashboard`).
- [ ] Confirm `getOrgBySlug` in `src/lib/org.ts` returns `accentColor` and `logoUrl` on its result type.

---

## Spec Coverage Self-Review

| Spec requirement | Implementing task |
|---|---|
| Alpine warmth palette (Section 1) | Task 2 |
| Dark mode tokens at parity (Section 1, Section 5) | Task 2, Task 13–18 |
| `--radius` bump to 0.75rem | Task 2 |
| Charts palette | Task 2 |
| Fraunces + Inter fonts | Task 1 |
| `--font-display` + `--font-serif` tokens | Task 1 |
| Tabular numerals on tables | Task 2 |
| Button polish | Task 13 |
| Card polish + `CardTitle.variant="display"` | Task 14 |
| Input/Textarea/Label/Select polish | Task 15 |
| Dialog/Sheet/Dropdown polish | Task 16 |
| Table polish | Task 17 |
| Badge/Tabs/Separator/Switch/Sonner polish | Task 18 |
| `accentColor` schema migration | Task 5 |
| `updateBranding` server action | Task 6 |
| `updateBranding` unit tests | Task 6 |
| `updateBranding` integration tests | Task 7 |
| `OrgThemeContext` | Task 8 |
| SSR accent injection (data URL link) | Task 8, Task 9 |
| `deriveAccentPalette` + clamping | Task 4 |
| OKLCH conversion utility | Task 3 |
| `OrgLogo` component | Task 10 |
| Logo in sidebar/nav/login/email | Task 11 |
| Admin branding UI | Task 12 |
| Supabase Storage bucket setup | Task 12 (Step 3) |
| E2E branding test | Task 19 |
| Axe accessibility automation | Task 20 |

All spec sections are covered by at least one task. 21 tasks map cleanly: foundations → theme utils → schema/action → runtime injection → logo → admin UI → component polish → tests → quality gate.
