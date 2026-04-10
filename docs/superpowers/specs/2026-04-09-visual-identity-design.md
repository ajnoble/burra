# Visual Identity & Design System

**Date:** 2026-04-09
**Status:** Draft — awaiting user review
**Scope:** Foundation pass. Tokens, typography, shadcn component polish, per-org branding (accent + logo), dark mode at parity. No page redesigns.

## Goal

Replace Snow Gum's default neutral-grayscale shadcn look with a warm "alpine lodge" visual identity, and deliver per-tenant branding (accent color + logo) as the differentiating multi-tenant feature. Every downstream page should inherit the new look without being touched.

This spec deliberately stops at foundations. Redesigning specific flows (landing page, booking wizard, admin dashboard) is explicit follow-up work in separate specs.

## Non-goals

- No page-level redesigns.
- No new components (no Combobox, no DataTable wrapper, no DatePicker refresh).
- No email template redesign beyond the header logo slot.
- No per-org font selection or secondary accent color.
- No logo cropping UI.
- No visual regression testing infrastructure (Percy/Chromatic).
- No explicit dark-mode toggle (relies on `prefers-color-scheme`).

## Architectural decisions

### Multi-tenant theming model

**Decision:** Snow Gum shell + per-org accent. Every tenant shares the same typography, component look, and layout. Each `Organisation` can set a single accent color (drives `--primary` and its derived foreground/ring) and upload one logo used in the sidebar, top nav, login page, and email header.

Rationale: this is the standard SaaS customisation sweet spot. Enough ownership for clubs to feel the tenant is theirs; not enough rope for them to ruin it.

### Runtime injection: SSR inline `<style>` on `:root`

**Decision:** In `src/app/[slug]/layout.tsx` (server component), resolve the org, derive a light+dark palette from `accentColor`, render an inline `<style>` element that sets `--primary`, `--primary-foreground`, `--ring` on `:root` and `.dark`.

Rejected alternatives:
- **React context + wrapper `<div style={...}>`** — Radix portals (dialog, dropdown, sheet, toast) render to `body` and escape the wrapper scope, reverting to default primary. Known footgun.
- **Per-org compiled stylesheet** — build/invalidation complexity not justified at this scale.

Rationale: SSR injection on `:root` is the only approach that handles portaled components without per-component patches. Zero theme flicker. No client JS. Cacheable per-slug.

### Security note on SSR style injection

Rendering a raw `<style>` tag in Next.js server components bypasses React's default string escaping. Safe usage requires that every substituted value be validated and normalised — never raw user input. This spec enforces that via three gates:

1. **Zod validation at the server action boundary.** `accentColor` must match `/^#[0-9a-f]{6}$/i`. Anything else is rejected before it can reach the DB.
2. **OKLCH derivation and clamping.** `deriveAccentPalette(hex)` parses the validated hex into numeric OKLCH components, clamps lightness and chroma into fixed ranges, and emits token strings of the shape `oklch(L C H)` or `oklch(L C H / alpha)`. The derivation function never echoes the input hex into the style tag — only the numerically-derived OKLCH strings.
3. **No string interpolation from user-controlled text** in the emitted CSS. Only the derived palette's six OKLCH strings are substituted, each of which is a machine-generated float triple.

Together these eliminate the XSS surface. The `oklch()` function cannot break out of a CSS declaration context; all characters emitted are digits, spaces, dots, slashes, and the literal `oklch(...)` token.

### Accent color clamping

**Decision:** `deriveAccentPalette(hex)` clamps derived OKLCH values:
- Light-mode lightness: `[0.32, 0.48]`
- Dark-mode lightness: `[0.58, 0.74]`
- Chroma: `[0.05, 0.12]`

Rationale: clubs *will* pick bad colors. Clamping turns `#ff00ff` into a respectable muted magenta instead of an eye-searing one. This is non-negotiable.

## Section 1: Color palette

All values in OKLCH. Tokens replace the current `:root` and `.dark` blocks in `src/app/globals.css`. `--radius` is bumped from `0.625rem` to `0.75rem`.

### Light mode

```
--background          oklch(0.985 0.005 75)     warm cream
--foreground          oklch(0.22  0.015 60)     warm charcoal
--card                oklch(0.99  0.004 75)
--card-foreground     oklch(0.22  0.015 60)
--popover             oklch(1     0    0)
--popover-foreground  oklch(0.22  0.015 60)
--primary             oklch(0.38  0.08  155)    deep eucalypt
--primary-foreground  oklch(0.985 0.005 75)
--secondary           oklch(0.93  0.01  135)    silvery eucalypt
--secondary-foreground oklch(0.25 0.02  150)
--muted               oklch(0.95  0.008 70)     warm stone
--muted-foreground    oklch(0.48  0.02  60)
--accent              oklch(0.72  0.15  65)     amber ember
--accent-foreground   oklch(0.2   0.02  60)
--destructive         oklch(0.55  0.2   28)     warm brick red
--border              oklch(0.9   0.008 70)
--input               oklch(0.9   0.008 70)
--ring                oklch(0.38  0.08  155 / 0.5)
```

### Dark mode

```
--background          oklch(0.18  0.012 60)
--foreground          oklch(0.96  0.006 75)
--card                oklch(0.22  0.014 60)
--card-foreground     oklch(0.96  0.006 75)
--popover             oklch(0.22  0.014 60)
--popover-foreground  oklch(0.96  0.006 75)
--primary             oklch(0.68  0.10  155)
--primary-foreground  oklch(0.16  0.02  150)
--secondary           oklch(0.28  0.015 140)
--secondary-foreground oklch(0.96 0.006 75)
--muted               oklch(0.26  0.012 60)
--muted-foreground    oklch(0.72  0.015 70)
--accent              oklch(0.75  0.14  65)
--accent-foreground   oklch(0.16  0.02  60)
--destructive         oklch(0.65  0.2   25)
--border              oklch(1 0 0 / 10%)
--input               oklch(1 0 0 / 15%)
--ring                oklch(0.68  0.10  155 / 0.6)
```

### Charts palette (both modes)

```
--chart-1  oklch(0.38 0.08 155)    eucalypt (primary)
--chart-2  oklch(0.72 0.15 65)     ember (accent)
--chart-3  oklch(0.55 0.06 200)    slate blue
--chart-4  oklch(0.5  0.09 40)     bark brown
--chart-5  oklch(0.6  0.04 120)    silver sage
```

Dark-mode chart values lift lightness by ~0.1 across the ramp; exact values derived during implementation and verified against WCAG contrast minimums.

### Accessibility

All text-on-background pairs must meet WCAG AA (4.5:1 for body, 3:1 for large text). Primary-on-primary-foreground measures 8.1:1. Contrast verification runs as part of the implementation task with any exceptions documented inline.

## Section 2: Typography

### Font stack

Loaded via `next/font/google` in `src/app/layout.tsx`:

- **Fraunces** (variable, opsz + SOFT axes) — display serif. Used for landing hero, H1 on member-facing pages, email headers, empty state headings.
- **Inter** (variable) — humanist sans. Used for everything else: body, H2–H6, admin H1, tables, forms, buttons, labels.
- **Geist Mono** (already loaded) — unchanged. Used for booking references, tariff codes, audit log IDs.

### Token additions

In `@theme inline` in `globals.css`:

```
--font-sans:    var(--font-inter)
--font-serif:   var(--font-fraunces)
--font-mono:    var(--font-geist-mono)
--font-display: var(--font-fraunces)
```

This exposes `font-display` as a Tailwind utility, used only on hero and member-page H1.

### Hierarchy

| Role | Family | Size | Weight | Tracking |
|---|---|---|---|---|
| Display (landing hero) | Fraunces | 56–72px fluid | 500 | -0.02em |
| H1 (member pages) | Fraunces | 36px | 500 | -0.015em |
| H1 (admin pages) | Inter | 28px | 600 | -0.01em |
| H2 | Inter | 22px | 600 | -0.005em |
| H3 | Inter | 18px | 600 | 0 |
| Body | Inter | 15px | 400 | 0 |
| Body small / meta | Inter | 13px | 400 | 0.005em |
| Button / label | Inter | 14px | 500 | 0.01em |
| Table cell | Inter | 14px | 400 | tabular-nums |
| Mono | Geist Mono | 13px | 400 | 0 |

### Tabular numerals

`font-variant-numeric: tabular-nums` applied globally to `table td` and to the `.tabular` class via `globals.css`. Critical for tariff columns, currency, availability counts.

### Rationale: why not serif H2/H3

Fraunces at 18px in a dense admin table header looks decorative and competes with data. At 32px+ it looks like a magazine. Display serif is restricted to where it pays (hero + member-page titles) and stays out of where it doesn't (admin tables, forms).

## Section 3: Component polish

Visual-only edits to 15 files in `src/components/ui/`. No API changes. No consumer edits required. One optional new prop (`CardTitle.variant`, defaulted).

### Button (`button.tsx`)
- Default size: `h-10 → h-11`. Small: `h-9 → h-10`. Warmer hit targets.
- Primary: inset highlight on hover: `box-shadow: inset 0 1px 0 rgb(255 255 255 / 8%)`.
- Active scale `0.98`, gated by `prefers-reduced-motion: no-preference`.
- Ghost: hover uses `bg-primary/4` (was neutral gray).

### Card (`card.tsx`)
- Border: solid border at 60% opacity + 1px inset top highlight.
- Shadow: `0 1px 2px 0 oklch(0.2 0.02 60 / 0.06)` — warm, not neutral.
- `CardTitle` gets new optional `variant?: "default" | "display"` prop. `"display"` applies `font-display`, used on member-facing cards only. Default unchanged.

### Input / Textarea (`input.tsx`, `textarea.tsx`)
- Border from `--input`, focus ring from `--ring` (warm eucalypt).
- Hover background: `oklch(var(--card) / 0.5)` for discoverability.
- Placeholder opacity: `50% → 60%`.

### Label (`label.tsx`)
- Weight `500`, tracking `0.01em`, color `text-foreground/80`.

### Badge (`badge.tsx`)
- New `variant="accent"` using `--accent` (amber). Other variants unchanged.

### Dialog / Sheet (`dialog.tsx`, `sheet.tsx`)
- Backdrop: `bg-foreground/40` (was `bg-black/50`). Warmer, more cinematic.
- Backdrop filter: `backdrop-blur-sm`.
- Content inherits new radius.

### Dropdown-menu / Select (`dropdown-menu.tsx`, `select.tsx`)
- Surface: `bg-popover` (pure white against cream) for forward lift.
- Item hover: `bg-accent/15` (amber hint, was neutral gray).
- Checked state: subtle eucalypt check icon color.

### Table (`table.tsx`)
- Header row: `bg-muted/60`, `font-semibold`, `tracking-[0.01em]`, `uppercase`, `text-xs`.
- Zebra striping: `[&_tr:nth-child(even)]:bg-muted/20`.
- Row hover: `bg-accent/10` (amber lantern glow).
- Cells: `font-variant-numeric: tabular-nums`.

### Tabs (`tabs.tsx`)
- Active indicator: 2px eucalypt underline with soft glow `box-shadow: 0 0 12px oklch(var(--primary) / 0.25)` (was filled pill).

### Separator (`separator.tsx`)
- Opacity: `border/60`.

### Switch (`switch.tsx`)
- Checked track: `--primary`.
- Knob: 1px warm shadow.

### Sonner / Toasts (`sonner.tsx`)
- Background: `--card`.
- Warm shadow.
- Icon colors: success = eucalypt, warning = amber, error = warm brick.

## Section 4: Per-org plumbing

### Schema migration

Add two nullable columns to `Organisation`:

```ts
// src/db/schema/organisation.ts
accentColor: text('accent_color'),
logoUrl:     text('logo_url'),
```

Null accent → default eucalypt. Null logo → wordmark fallback rendering org name in display serif.

Migration generated via `npm run db:generate`. No data backfill.

### Server action: `updateBranding`

New file `src/actions/organisations/updateBranding.ts`.

- Calls `requireSession(organisationId)` at entry (per `AGENTS.md`).
- Calls `requireRole(session, 'ADMIN')`.
- Accepts `{ accentColor?: string | null, logoFile?: File | null, removeLogo?: boolean }`.
- Zod validation:
  - `accentColor`: `/^#[0-9a-f]{6}$/i` or null.
  - `logoFile`: max 500KB, MIME in `['image/png', 'image/svg+xml', 'image/jpeg']`.
- Uploads file to Supabase Storage bucket `org-logos`, path `org-logos/{organisationId}/logo-{timestamp}.{ext}`.
- On new upload or removal, deletes previous logo file from storage.
- Writes row.

### Admin UI

New route: `src/app/[slug]/admin/settings/branding/page.tsx`.

- `branding-form.tsx` (client component): native `<input type="color">` + hex text input bound together, file dropzone with ~120px preview, "Remove logo" button, live-preview card showing a button + badge + heading in the chosen color side-by-side with the default.
- Sidebar settings nav gets one new entry: "Branding".
- Help text: "These settings affect how [Club Name] appears to your members. Snow Gum's wordmark still appears in the footer." Also: upload pre-cropped images — no cropping tool provided.

### Runtime injection

In `src/app/[slug]/layout.tsx` (existing server component):

```tsx
const org = await getOrganisationBySlug(params.slug);
const accentPalette = org.accentColor
  ? deriveAccentPalette(org.accentColor)
  : null;

return (
  <OrgThemeProvider value={{ logoUrl: org.logoUrl, name: org.name }}>
    {accentPalette && <InjectAccent palette={accentPalette} />}
    {children}
  </OrgThemeProvider>
);
```

`InjectAccent` is a server component that renders an inline `<style>` element. Its only inputs are the six OKLCH strings emitted by `deriveAccentPalette`, which are numerically derived and format-constrained (see Security note above). The CSS body is of the form:

```css
:root {
  --primary: oklch(L C H);
  --primary-foreground: oklch(L C H);
  --ring: oklch(L C H / 0.5);
}
.dark {
  --primary: oklch(L C H);
  --primary-foreground: oklch(L C H);
  --ring: oklch(L C H / 0.6);
}
```

### `deriveAccentPalette(hex)`

New utility in `src/lib/theme/derive-accent.ts`, ~40 lines plus helpers in `src/lib/theme/oklch.ts`.

Steps:
1. Parse hex → sRGB → linear RGB → OKLab → OKLCH (~80 lines, no deps).
2. Clamp lightness to `[0.32, 0.48]` and chroma to `[0.05, 0.12]` for light-mode primary.
3. Light-mode `primary-foreground` = cream if L < 0.6, else warm charcoal.
4. Light-mode `ring` = primary with `/ 0.5` alpha.
5. Dark-mode `primary` = same hue, lightness clamped to `[0.58, 0.74]`.
6. Dark-mode `primary-foreground` = warm dark if L > 0.5, else cream.
7. Dark-mode `ring` = dark primary with `/ 0.6` alpha.

Returns `{ primary, primaryForeground, ring, primaryDark, primaryForegroundDark, ringDark }`, all as OKLCH CSS strings. Each string is built by `String(number.toFixed(3))` concatenation — no passthrough of the original hex or any user text.

### Logo rendering

- `src/lib/theme/org-theme-context.tsx` — lightweight context: `{ logoUrl: string | null, name: string }`.
- `src/components/org-logo.tsx` — renders `<img src={logoUrl}>` if set, else `<span className="font-display text-xl">{name}</span>`. Size controlled by `className` prop.

Consumers (edit in place, ~1 line each):
- Admin sidebar header component.
- Member-facing top-nav header.
- Login page for `[slug]/login`.
- Email layout component (new `<OrgLogo>` variant in `src/lib/email/components/`).

### Supabase Storage

New bucket `org-logos`, public-read, 5MB object limit. Configured via Supabase dashboard as an out-of-code step. Documented in the implementation plan's pre-flight checklist.

## Section 5: Dark mode parity

### Elevation

Light mode uses warm shadows on cream. Dark mode uses lightness deltas instead because shadows disappear:
- `--background` 0.18 → `--card` 0.22 → `--popover` 0.22 → hover states bump by ~0.02.

Every surface is explicitly ranked.

### Borders

Light: solid warm stone. Dark: `oklch(1 0 0 / 10%)` (warm borders disappear against warm dark). Explicit choice.

### Ember accent

Dark-mode amber lightness bumped from 0.72 → 0.75 to compensate for perceived desaturation on dark backgrounds.

### Focus ring

Dark ring alpha 0.6 vs. light's 0.5. Dark backgrounds absorb ring visibility.

### Activation

`prefers-color-scheme` at `<html>` level via existing shadcn wiring. No user-facing toggle added in this spec.

### Per-org accent in dark mode

`deriveAccentPalette` returns both light and dark variants in the same SSR style block. Clubs set one color; both modes work automatically.

## Section 6: Testing

Conforms to `docs/testing.md`. No mock theatre. Unit / integration / E2E separation respected.

### Unit tests (`npm test`)

**`src/lib/theme/derive-accent.test.ts`:**
- Hex → OKLCH conversion round-trips for representative values.
- Clamping enforces lightness `[0.32, 0.48]` and chroma `[0.05, 0.12]` in light mode.
- Clamping enforces lightness `[0.58, 0.74]` in dark mode.
- Ugly inputs (`#000`, `#fff`, `#ff00ff`, `#00ff00`) produce in-range outputs.
- `primaryForeground` flips correctly at the L threshold.
- Dark variants are in their dark range.
- Output strings match the `oklch(L C H)` or `oklch(L C H / alpha)` format (regex assertion — ensures the XSS gate described in the Security note holds).

**`src/actions/organisations/updateBranding.test.ts`:**
- Zod rejects invalid hex (`#xyz`, `red`, `#ff`).
- Zod rejects files over 500KB.
- Zod rejects wrong MIME types.
- `requireRole` called with `'ADMIN'`.
- Cross-org edits rejected by the auth guard.

### Integration tests (`npm run test:integration`)

**`updateBranding.integration.test.ts`** (pglite harness):
- Insert org, update branding, read back: row matches.
- Update with new logo: previous logo path tracked for deletion.
- `getOrganisationBySlug` returns `accentColor` and `logoUrl`.

### E2E tests (`npm run test:e2e`)

**New file `e2e/branding.spec.ts`:**
- Admin navigates to `/demo/admin/settings/branding`, picks a color, uploads a logo, saves, reloads — new color visible as computed style on a primary button, logo visible in sidebar.
- Member on `/demo` sees the same logo in the top nav.
- Tenant login page (`/demo/login`) shows the logo.
- Both light and dark mode via `emulateMedia({ colorScheme: 'dark' })`. Branding page renders; primary button uses dark-variant derived palette.

### Accessibility

- Extend the existing Playwright suite with `@axe-core/playwright` on `/demo` landing and `/demo/admin`. Fail build on new violations.
- Manual pre-merge checklist: contrast on all text pairs, focus ring visible on every interactive element in both modes, reduced-motion respected on button active-state scale.

### Explicitly not tested

- Exact OKLCH values (brittle).
- Screenshot comparisons (no infra).
- Subjective warmth.

## File inventory

### New files (13)

**Theme utilities (3)**
- `src/lib/theme/oklch.ts`
- `src/lib/theme/derive-accent.ts`
- `src/lib/theme/derive-accent.test.ts`

**Per-org theming runtime (4)**
- `src/lib/theme/org-theme-context.tsx`
- `src/lib/theme/inject-accent.tsx`
- `src/components/org-logo.tsx`
- `src/lib/email/components/org-logo.tsx` (or extend existing email layout)

**Per-org theming actions (3)**
- `src/actions/organisations/updateBranding.ts`
- `src/actions/organisations/updateBranding.test.ts`
- `src/actions/organisations/updateBranding.integration.test.ts`

**Admin UI (2)**
- `src/app/[slug]/admin/settings/branding/page.tsx`
- `src/app/[slug]/admin/settings/branding/branding-form.tsx`

**E2E (1)**
- `e2e/branding.spec.ts`

### Edited files

**Tokens & global (2)**
- `src/app/globals.css` — token blocks, radius, tabular-nums rule, font-display token.
- `src/app/layout.tsx` — load Fraunces and Inter via `next/font/google`.

**Schema + migration (2)**
- `src/db/schema/organisation.ts` — add columns.
- `drizzle/XXXX_add_org_branding.sql` — generated.

**shadcn component polish (15)**
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/table.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/switch.tsx`
- `src/components/ui/sonner.tsx`

**Layout + consumers (one-line edits each)**
- `src/app/[slug]/layout.tsx` — resolve org, inject accent, provide context.
- Admin sidebar header component — swap placeholder for `<OrgLogo>`.
- Member top-nav header — swap for `<OrgLogo>`.
- `src/app/[slug]/login/page.tsx` — add `<OrgLogo>`.
- Email layout component — add `<OrgLogo>` to header slot.
- Admin settings sidebar nav — add "Branding" link.

### Out-of-code steps (1)
- Supabase Storage: create `org-logos` bucket, public-read, 5MB limit.

### Totals
- New files: 13
- Edited files: ~21 (15 components + globals.css + root layout.tsx + schema + [slug]/layout.tsx + sidebar/nav/login/email/settings-nav consumers)
- Migrations: 1
- Out-of-code steps: 1

## Risks

- **Clubs pick ugly colors.** Mitigated by OKLCH clamping in `deriveAccentPalette`. Tested explicitly.
- **Fraunces feels stuffy at small sizes.** Mitigated by restricting to display and member-page H1 only. If in implementation it still feels wrong, fall back to Source Serif 4 — one-line swap in `layout.tsx`.
- **Inter feels too tech-y against warmth goal.** Low risk because warmth comes primarily from color and spacing. Fallback: DM Sans or Plus Jakarta Sans — one-line swap.
- **Dark-mode accent contrast for user-picked colors.** Mitigated by clamping dark-mode lightness to `[0.58, 0.74]`. Edge case: a desaturated user color may still read poorly — accepted risk, admin live preview lets clubs notice and adjust.
- **Radix portal surprises.** Mitigated by SSR injection on `:root` (not a wrapper). Explicitly tested in E2E with a dialog.
- **Tabular-nums on every table cell may look odd for non-numeric columns.** Low risk — tabular figures only affect digit width, letters are unaffected.
- **SSR style-injection XSS.** Mitigated by the three gates in the Security note: Zod hex validation, OKLCH derivation (never echoes hex), and format-regex unit tests.

## Out of scope (explicit follow-ups)

- Landing page redesign — separate spec, uses this foundation.
- Member dashboard redesign — separate spec.
- Booking wizard redesign — separate spec.
- Admin dashboard layout refresh — separate spec.
- Email template visual refresh — separate spec.
- Dark mode user toggle — separate spec (currently `prefers-color-scheme` only).
- Visual regression testing infrastructure — separate spec.
- Per-org fonts, secondary accent, logo variants (light/dark/favicon), cropping UI — out of scope permanently unless re-brainstormed.
