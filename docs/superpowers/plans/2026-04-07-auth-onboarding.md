# Phase 11: Authentication & Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the auth experience production-ready: magic link login, password reset, invite-based member onboarding with password setup, logout, polished login page, multi-org support via a root org-picker page, and a CLI setup script for bootstrapping new organisations.

**Architecture:** Lean on Supabase Auth's built-in flows (OTP, password reset, invite links) with a single `/api/auth/callback` route handling all token exchanges. Invite emails go through our Resend + React Email pipeline for org branding. A new service-role admin client enables server-side user creation when admins add members.

**Tech Stack:** Next.js 16 (App Router), Supabase Auth (`@supabase/supabase-js` + `@supabase/ssr`), Resend + React Email, Vitest

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/lib/supabase/admin.ts` | Service-role Supabase client for admin operations |
| `src/app/api/auth/callback/route.ts` | Auth callback — exchanges code for session, redirects |
| `src/actions/auth/logout.ts` | Server action: sign out + redirect |
| `src/app/[slug]/auth/reset-password/page.tsx` | "Forgot password" form — sends reset email |
| `src/app/[slug]/auth/set-password/page.tsx` | Set/reset password form — called after email link |
| `src/lib/email/templates/invite.tsx` | Invite email template with password setup CTA |
| `src/lib/email/__tests__/invite.test.ts` | Tests for invite email template |
| `src/app/[slug]/login/login-form.tsx` | Client component: polished login form with magic link toggle |
| `src/app/page.tsx` | Root org-picker — lists orgs for authenticated users, landing for guests |
| `scripts/setup-org.ts` | CLI script to bootstrap a new org with its first admin member |
| `docs/setup-org.md` | Step-by-step guide for creating a new organisation |

### Modified files

| File | Change |
|------|--------|
| `src/lib/supabase/middleware.ts` | Add auth pages to public routes |
| `src/app/[slug]/admin/layout.tsx` | Add logout button to sidebar |
| `src/app/[slug]/dashboard/page.tsx` | Add logout button to dashboard header |
| `src/app/[slug]/login/page.tsx` | Convert to server component, delegate to login-form.tsx |
| `src/actions/members/create.ts` | Create Supabase auth user + send invite email |
| `package.json` | Add `setup-org` script entry |

---

## Task 1: Service-Role Admin Client

**Files:**
- Create: `src/lib/supabase/admin.ts`

- [ ] **Step 1: Create the admin client module**

```ts
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase/admin.ts
git commit -m "feat(auth): add service-role Supabase admin client"
```

---

## Task 2: Auth Callback Route

**Files:**
- Create: `src/app/api/auth/callback/route.ts`
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Create the callback route**

This route handles all Supabase auth redirects (magic link, password reset, invite). Supabase sends a `code` param via PKCE flow.

```ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers
            .get("cookie")
            ?.split("; ")
            .map((c) => {
              const [name, ...rest] = c.split("=");
              return { name, value: rest.join("=") };
            }) ?? [];
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Redirect to root on failure — the middleware will bounce to login
    return NextResponse.redirect(`${origin}/`);
  }

  return response;
}
```

- [ ] **Step 2: Add auth pages to middleware public routes**

In `src/lib/supabase/middleware.ts`, update the `isPublicRoute` check (around line 45-49):

```ts
  const isPublicRoute =
    pathname === "/" ||
    pathname.endsWith("/login") ||
    pathname.endsWith("/register") ||
    pathname.includes("/auth/reset-password") ||
    pathname.includes("/auth/set-password") ||
    pathname.startsWith("/api/");
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/callback/route.ts src/lib/supabase/middleware.ts
git commit -m "feat(auth): add auth callback route and public route allowlist"
```

---

## Task 3: Logout Action + UI

**Files:**
- Create: `src/actions/auth/logout.ts`
- Modify: `src/app/[slug]/admin/layout.tsx`
- Modify: `src/app/[slug]/dashboard/page.tsx`

- [ ] **Step 1: Create the logout server action**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function logout(slug: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${slug}/login`);
}
```

- [ ] **Step 2: Add logout button to admin sidebar**

In `src/app/[slug]/admin/layout.tsx`, import the logout action and add a form at the bottom of the sidebar. Replace the `mt-auto` div (lines 63-69) with:

```tsx
        <div className="mt-auto pt-4">
          <Separator className="mb-4" />
          <p className="text-xs text-muted-foreground truncate">
            {session.firstName} {session.lastName}
          </p>
          <p className="text-xs text-muted-foreground mb-3">{session.role}</p>
          <form action={async () => { "use server"; const { logout: doLogout } = await import("@/actions/auth/logout"); await doLogout(slug); }}>
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" type="submit">
              Sign out
            </Button>
          </form>
        </div>
```

- [ ] **Step 3: Add logout button to member dashboard**

In `src/app/[slug]/dashboard/page.tsx`, add a sign-out button next to the "Book a Stay" button in the header (around line 86). Replace the header div:

```tsx
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {session?.firstName ?? user.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={async () => { "use server"; const { logout: doLogout } = await import("@/actions/auth/logout"); await doLogout(slug); }}>
            <Button variant="ghost" type="submit">Sign out</Button>
          </form>
          <Button render={<Link href={`/${slug}/book`} />}>
            Book a Stay
          </Button>
        </div>
      </div>
```

- [ ] **Step 4: Commit**

```bash
git add src/actions/auth/logout.ts src/app/\[slug\]/admin/layout.tsx src/app/\[slug\]/dashboard/page.tsx
git commit -m "feat(auth): add logout action and sign-out buttons"
```

---

## Task 4: Password Reset Flow

**Files:**
- Create: `src/app/[slug]/auth/reset-password/page.tsx`
- Create: `src/app/[slug]/auth/set-password/page.tsx`

- [ ] **Step 1: Create the "forgot password" page**

```tsx
"use client";

import { useState, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { slug } = await params;
    const supabase = createClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/api/auth/callback?next=/${slug}/auth/set-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset Password</CardTitle>
          <CardDescription>
            {sent
              ? "Check your email for a password reset link."
              : "Enter your email and we'll send you a reset link."}
          </CardDescription>
        </CardHeader>
        {!sent && (
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </Button>
              <ResetBackLink params={params} />
            </form>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function ResetBackLink({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <p className="text-center text-sm text-muted-foreground">
      <Link href={`/${slug}/login`} className="text-primary underline-offset-4 hover:underline">
        Back to login
      </Link>
    </p>
  );
}
```

- [ ] **Step 2: Create the "set password" page**

This page is reached after clicking the reset link OR the invite link. The user already has a session (established by the callback route).

```tsx
"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SetPasswordPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(`/${slug}/dashboard`);
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set Your Password</CardTitle>
          <CardDescription>
            Choose a password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm Password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving..." : "Set password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\[slug\]/auth/reset-password/page.tsx src/app/\[slug\]/auth/set-password/page.tsx
git commit -m "feat(auth): add password reset and set-password pages"
```

---

## Task 5: Invite Email Template

**Files:**
- Create: `src/lib/email/templates/invite.tsx`
- Create: `src/lib/email/__tests__/invite.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { InviteEmail } from "../templates/invite";

describe("InviteEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    firstName: "Alice",
    inviteUrl: "https://snowgum.site/api/auth/callback?code=abc123",
  };

  it("renders first name", async () => {
    const html = await render(React.createElement(InviteEmail, baseProps));
    expect(html).toContain("Alice");
  });

  it("renders org name", async () => {
    const html = await render(React.createElement(InviteEmail, baseProps));
    expect(html).toContain("Bogong Ski Club");
  });

  it("renders invite link", async () => {
    const html = await render(React.createElement(InviteEmail, baseProps));
    expect(html).toContain("https://snowgum.site/api/auth/callback?code=abc123");
  });

  it("renders member number when provided", async () => {
    const html = await render(
      React.createElement(InviteEmail, { ...baseProps, memberNumber: "SKI-001" })
    );
    expect(html).toContain("SKI-001");
  });

  it("omits member number when not provided", async () => {
    const html = await render(React.createElement(InviteEmail, baseProps));
    expect(html).not.toContain("Member number");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/email/__tests__/invite.test.ts`
Expected: FAIL — `InviteEmail` not found

- [ ] **Step 3: Create the invite email template**

```tsx
import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";

type InviteEmailProps = {
  orgName: string;
  firstName: string;
  inviteUrl: string;
  memberNumber?: string;
  logoUrl?: string;
};

export function InviteEmail({
  orgName,
  firstName,
  inviteUrl,
  memberNumber,
  logoUrl,
}: InviteEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>You're invited to {orgName}</Text>
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>
        An account has been created for you. Click the button below to set your
        password and get started.
      </Text>
      {memberNumber && (
        <Section style={detailsBox}>
          <Text style={paragraph}>
            <strong>Member number:</strong> {memberNumber}
          </Text>
        </Section>
      )}
      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Link href={inviteUrl} style={button}>
          Set up your account
        </Link>
      </Section>
      <Text style={paragraph}>
        This link will expire in 24 hours. If you have any questions, contact
        your club administrator.
      </Text>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "bold" as const,
  margin: "0 0 16px",
};

const paragraph = {
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const detailsBox = {
  backgroundColor: "#f9f9f9",
  borderRadius: "8px",
  padding: "16px",
  margin: "16px 0",
};

const button = {
  backgroundColor: "#111111",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  textDecoration: "none",
  fontWeight: "bold" as const,
  fontSize: "14px",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/email/__tests__/invite.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/invite.tsx src/lib/email/__tests__/invite.test.ts
git commit -m "feat(auth): add invite email template with tests"
```

---

## Task 6: Wire Invite into Member Creation

**Files:**
- Modify: `src/actions/members/create.ts`

- [ ] **Step 1: Update the createMember action to create an auth user and send invite**

Replace the full contents of `src/actions/members/create.ts`:

```ts
"use server";

import { db } from "@/db/index";
import { members, organisationMembers, organisations, profiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createMemberSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import React from "react";
import { sendEmail } from "@/lib/email/send";
import { InviteEmail } from "@/lib/email/templates/invite";
import { WelcomeEmail } from "@/lib/email/templates/welcome";
import { createAdminClient } from "@/lib/supabase/admin";

type CreateMemberInput = {
  organisationId: string;
  slug: string;
  firstName: string;
  lastName: string;
  email: string;
  membershipClassId: string;
  phone?: string;
  dateOfBirth?: string;
  memberNumber?: string;
  notes?: string;
  role?: "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN";
  isFinancial?: boolean;
};

export async function createMember(
  input: CreateMemberInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = createMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const data = parsed.data;

  // Check email uniqueness within org
  const [existing] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organisationId, input.organisationId),
        eq(members.email, data.email)
      )
    );

  if (existing) {
    return { success: false, error: "A member with this email already exists" };
  }

  // Create or find Supabase auth user
  const adminClient = createAdminClient();
  let authUserId: string | null = null;
  let isNewAuthUser = false;

  // Check if auth user already exists (e.g. member of another org)
  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const existingAuthUser = existingUsers?.users.find(
    (u) => u.email === data.email
  );

  if (existingAuthUser) {
    authUserId = existingAuthUser.id;
  } else {
    const { data: newUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email: data.email,
        email_confirm: false,
      });

    if (createError) {
      console.error("[auth] Failed to create auth user:", createError);
      // Continue without auth user — admin can re-invite later
    } else {
      authUserId = newUser.user.id;
      isNewAuthUser = true;
    }
  }

  // Upsert profile if we have an auth user
  if (authUserId) {
    await db
      .insert(profiles)
      .values({
        id: authUserId,
        email: data.email,
        fullName: `${data.firstName} ${data.lastName}`,
      })
      .onConflictDoNothing();
  }

  const [member] = await db
    .insert(members)
    .values({
      organisationId: input.organisationId,
      membershipClassId: data.membershipClassId,
      profileId: authUserId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || null,
      dateOfBirth: data.dateOfBirth || null,
      memberNumber: data.memberNumber || null,
      notes: data.notes || null,
      isFinancial: data.isFinancial,
    })
    .returning();

  await db.insert(organisationMembers).values({
    organisationId: input.organisationId,
    memberId: member.id,
    role: data.role,
  });

  // Fetch org details for email
  const [org] = await db
    .select({
      name: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const orgName = org?.name ?? input.slug;

  if (isNewAuthUser && authUserId) {
    // Generate invite link for new users to set their password
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "invite",
        email: data.email,
        options: {
          redirectTo: `${appUrl}/api/auth/callback?next=/${input.slug}/auth/set-password`,
        },
      });

    if (linkError || !linkData) {
      console.error("[auth] Failed to generate invite link:", linkError);
      // Fall back to welcome email without invite link
      sendEmail({
        to: data.email,
        subject: `Welcome to ${orgName}`,
        template: React.createElement(WelcomeEmail, {
          orgName,
          firstName: data.firstName,
          loginUrl: `${appUrl}/${input.slug}/login`,
          memberNumber: data.memberNumber || undefined,
          logoUrl: org?.logoUrl || undefined,
        }),
        replyTo: org?.contactEmail || undefined,
        orgName,
      });
    } else {
      // The action_link from generateLink contains the token params
      // We need to use it as-is — it points to Supabase which redirects to our redirectTo
      const inviteUrl = linkData.properties.action_link;

      sendEmail({
        to: data.email,
        subject: `You're invited to ${orgName}`,
        template: React.createElement(InviteEmail, {
          orgName,
          firstName: data.firstName,
          inviteUrl,
          memberNumber: data.memberNumber || undefined,
          logoUrl: org?.logoUrl || undefined,
        }),
        replyTo: org?.contactEmail || undefined,
        orgName,
      });
    }
  } else {
    // Existing auth user — just send welcome email with login link
    sendEmail({
      to: data.email,
      subject: `Welcome to ${orgName}`,
      template: React.createElement(WelcomeEmail, {
        orgName,
        firstName: data.firstName,
        loginUrl: `${appUrl}/${input.slug}/login`,
        memberNumber: data.memberNumber || undefined,
        logoUrl: org?.logoUrl || undefined,
      }),
      replyTo: org?.contactEmail || undefined,
      orgName,
    });
  }

  revalidatePath(`/${input.slug}/admin/members`);
  redirect(`/${input.slug}/admin/members/${member.id}`);
}
```

- [ ] **Step 2: Run existing tests to verify nothing is broken**

Run: `npx vitest run`
Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
git add src/actions/members/create.ts
git commit -m "feat(auth): create auth user and send invite on member creation"
```

---

## Task 7: Login Page Polish + Magic Link

**Files:**
- Modify: `src/app/[slug]/login/page.tsx` (convert to server component)
- Create: `src/app/[slug]/login/login-form.tsx` (new client component)

- [ ] **Step 1: Create the polished login form client component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

type LoginFormProps = {
  slug: string;
  orgName: string;
  logoUrl: string | null;
};

export function LoginForm({ slug, orgName, logoUrl }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "magic-link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(`/${slug}/dashboard`);
    router.refresh();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appUrl}/api/auth/callback?next=/${slug}/dashboard`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMagicLinkSent(true);
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={orgName}
              className="mx-auto mb-2 h-12 w-12 rounded-lg"
            />
          )}
          <CardTitle>{orgName}</CardTitle>
          <CardDescription>
            {magicLinkSent
              ? "Check your email for a login link."
              : "Sign in to your account"}
          </CardDescription>
        </CardHeader>

        {!magicLinkSent && (
          <CardContent>
            {/* Mode toggle */}
            <div className="mb-4 flex rounded-lg border p-1">
              <button
                type="button"
                onClick={() => { setMode("password"); setError(null); }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  mode === "password"
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => { setMode("magic-link"); setError(null); }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  mode === "magic-link"
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Magic Link
              </button>
            </div>

            {mode === "password" ? (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href={`/${slug}/auth/reset-password`}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="magic-email">Email</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending..." : "Send magic link"}
                </Button>
              </form>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Convert the login page to a server component**

Replace `src/app/[slug]/login/page.tsx` entirely:

```tsx
import { notFound } from "next/navigation";
import { getOrgBySlug } from "@/lib/org";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);

  if (!org) notFound();

  return (
    <LoginForm
      slug={slug}
      orgName={org.name}
      logoUrl={org.logoUrl}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\[slug\]/login/page.tsx src/app/\[slug\]/login/login-form.tsx
git commit -m "feat(auth): polish login page with magic link toggle and org branding"
```

---

## Task 8: Root Org-Picker Page

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace the root page with an org-picker**

For authenticated users, query all orgs they belong to and show a list. For unauthenticated users, show the existing landing page content.

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/index";
import { members, organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Snow Gum
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Modern booking and membership management for member-owned
            accommodation clubs.
          </p>
        </div>
      </div>
    );
  }

  // Find all orgs this user belongs to
  const userOrgs = await db
    .select({
      orgId: organisations.id,
      orgName: organisations.name,
      slug: organisations.slug,
      logoUrl: organisations.logoUrl,
    })
    .from(members)
    .innerJoin(organisations, eq(members.organisationId, organisations.id))
    .where(eq(members.email, user.email!));

  if (userOrgs.length === 1) {
    // Single org — redirect straight to dashboard
    const { redirect } = await import("next/navigation");
    redirect(`/${userOrgs[0].slug}/dashboard`);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Your Organisations
        </h1>
        <p className="text-muted-foreground">
          Choose an organisation to continue.
        </p>
      </div>
      <div className="grid gap-4 w-full max-w-md">
        {userOrgs.map((org) => (
          <Link key={org.orgId} href={`/${org.slug}/dashboard`}>
            <Card className="hover:border-primary transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                {org.logoUrl && (
                  <img
                    src={org.logoUrl}
                    alt={org.orgName}
                    className="h-10 w-10 rounded-lg"
                  />
                )}
                <div>
                  <CardTitle className="text-lg">{org.orgName}</CardTitle>
                  <CardDescription>{org.slug}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(auth): root org-picker page with auto-redirect for single org"
```

---

## Task 9: Org Setup Script + Documentation

**Files:**
- Create: `scripts/setup-org.ts`
- Create: `docs/setup-org.md`
- Modify: `package.json`

- [ ] **Step 1: Create the setup script**

An interactive CLI script that creates an org, its first admin member, and sends the invite. Uses the service-role admin client from Task 1.

```ts
import "dotenv/config";
import { db } from "../src/db/index";
import {
  organisations,
  membershipClasses,
  members,
  organisationMembers,
  profiles,
} from "../src/db/schema";
import { createClient } from "@supabase/supabase-js";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log("\n🏔️  Snow Gum — New Organisation Setup\n");

  // Collect org details
  const orgName = await ask("Organisation name: ");
  const slug = await ask("URL slug (lowercase, no spaces): ");
  const contactEmail = await ask("Contact email: ");
  const timezone = (await ask("Timezone [Australia/Melbourne]: ")) || "Australia/Melbourne";

  // Collect first admin details
  console.log("\n--- First Admin Member ---");
  const adminFirstName = await ask("First name: ");
  const adminLastName = await ask("Last name: ");
  const adminEmail = await ask("Email: ");

  rl.close();

  console.log("\nCreating organisation...");

  // Create org
  const [org] = await db
    .insert(organisations)
    .values({ name: orgName, slug, contactEmail, timezone })
    .returning();

  // Create a default membership class
  const [defaultClass] = await db
    .insert(membershipClasses)
    .values({
      organisationId: org.id,
      name: "Full Member",
      sortOrder: 0,
    })
    .returning();

  console.log(`Organisation created: ${org.name} (/${org.slug})`);

  // Create Supabase auth user
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  let authUserId: string;
  let isNewUser = false;

  const existingUser = existingUsers?.users.find(
    (u) => u.email === adminEmail
  );

  if (existingUser) {
    authUserId = existingUser.id;
    console.log(`Auth user already exists: ${adminEmail}`);
  } else {
    const { data: newUser, error } =
      await adminClient.auth.admin.createUser({
        email: adminEmail,
        email_confirm: false,
      });

    if (error || !newUser) {
      console.error("Failed to create auth user:", error);
      process.exit(1);
    }

    authUserId = newUser.user.id;
    isNewUser = true;
    console.log(`Auth user created: ${adminEmail}`);
  }

  // Upsert profile
  await db
    .insert(profiles)
    .values({
      id: authUserId,
      email: adminEmail,
      fullName: `${adminFirstName} ${adminLastName}`,
    })
    .onConflictDoNothing();

  // Create member + ADMIN role
  const [member] = await db
    .insert(members)
    .values({
      organisationId: org.id,
      membershipClassId: defaultClass.id,
      profileId: authUserId,
      firstName: adminFirstName,
      lastName: adminLastName,
      email: adminEmail,
      isFinancial: true,
    })
    .returning();

  await db.insert(organisationMembers).values({
    organisationId: org.id,
    memberId: member.id,
    role: "ADMIN",
  });

  console.log(`Admin member created: ${adminFirstName} ${adminLastName}`);

  // Generate invite link for new users
  if (isNewUser) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "invite",
        email: adminEmail,
        options: {
          redirectTo: `${appUrl}/api/auth/callback?next=/${slug}/auth/set-password`,
        },
      });

    if (linkError || !linkData) {
      console.error("Failed to generate invite link:", linkError);
      console.log("The admin can use 'Forgot password' to set up their account.");
    } else {
      console.log(`\nInvite link (expires in 24h):`);
      console.log(linkData.properties.action_link);
    }
  } else {
    console.log(`\nExisting user — they can log in at /${slug}/login`);
  }

  console.log("\n✅ Setup complete!");
  console.log(`   Dashboard: ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/${slug}/dashboard`);
  console.log(`   Admin:     ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/${slug}/admin\n`);

  process.exit(0);
}

main().catch((e) => {
  console.error("Setup failed:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script to package.json**

Add to the `"scripts"` section:

```json
"setup-org": "npx tsx scripts/setup-org.ts"
```

- [ ] **Step 3: Write the setup guide**

Create `docs/setup-org.md`:

```markdown
# Setting Up a New Organisation

This guide walks through creating a new organisation on Snow Gum.

## Prerequisites

- SSH access to the server (or local dev environment)
- The `.env` file must contain:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_URL` (e.g. `https://snowgum.site`)
  - `DATABASE_URL`

## Steps

### 1. Run the setup script

```bash
npm run setup-org
```

You will be prompted for:
- **Organisation name** — displayed in the UI and emails (e.g. "Bogong Ski Club")
- **URL slug** — the URL path for this org (e.g. `bogong` → `snowgum.site/bogong`). Lowercase, no spaces.
- **Contact email** — displayed to members and used as reply-to on emails
- **Timezone** — defaults to `Australia/Melbourne`
- **First admin** — name and email for the initial ADMIN user

The script will:
1. Create the organisation with a default "Full Member" membership class
2. Create (or reuse) a Supabase auth account for the admin
3. Create the member record with ADMIN role
4. Print an invite link (for new users) or confirm they can log in (existing users)

### 2. Send the invite link to the admin

If the admin is a new user, send them the invite link printed by the script. They will:
1. Click the link
2. Set their password
3. Land on their dashboard

If they are an existing user (already a member of another org), they can log in at `snowgum.site/{slug}/login` with their existing credentials. The root page (`snowgum.site/`) will also show both organisations.

### 3. Admin completes setup

Once logged in, the admin should:
1. **Membership classes** — edit or add classes at Admin > Settings (the script creates a default "Full Member" class)
2. **Lodge & rooms** — configure the lodge, rooms, and beds at Admin > Lodge
3. **Seasons & booking rounds** — set up the season calendar at Admin > Seasons
4. **Tariffs** — configure pricing at Admin > Tariffs
5. **Stripe Connect** — connect a Stripe account at Admin > Settings for payment processing
6. **Members** — add members at Admin > Members (each gets an invite email automatically)

### Multi-org users

A single email address can be a member of multiple organisations. When a user who belongs to multiple orgs visits `snowgum.site/`, they see an org picker. Users with a single org are redirected straight to their dashboard.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-org.ts docs/setup-org.md package.json
git commit -m "feat(auth): add org setup script and documentation"
```

---

## Task 10: Manual Supabase Dashboard Configuration

This is a manual step — not code.

- [ ] **Step 1: Configure Resend as custom SMTP in Supabase dashboard**

Go to Supabase Dashboard > Project Settings > Auth > SMTP Settings:
- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: your Resend API key
- Sender email: `noreply@snowgum.site`

- [ ] **Step 2: Set redirect URLs**

Go to Supabase Dashboard > Auth > URL Configuration:
- Site URL: `https://snowgum.site`
- Add to Redirect URLs: `https://snowgum.site/api/auth/callback`

- [ ] **Step 3: Test magic link and password reset emails arrive via Resend**

---

## Task 11: Final Verification + Run All Tests

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass (353 existing + 5 new invite email tests = 358+)

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Deploy and test end-to-end**

```bash
cd /opt/snowgum && docker compose up -d --build && docker exec treasure-nginx nginx -s reload
```

Test at `https://snowgum.site/polski/login`:
1. Password login works
2. Magic link toggle works, sends email, link logs you in
3. "Forgot password?" sends reset email, link lets you set new password
4. Sign out button works in dashboard and admin sidebar
5. Admin creates new member → invite email arrives → link lets member set password → member can login
6. Root page (`/`) shows org picker for multi-org users, auto-redirects for single-org users
7. `npm run setup-org` runs successfully and creates a working org

- [ ] **Step 4: Update README phase table**

Add Phase 11 to the Completed table in `README.md`:

```
| 11 | Authentication & Onboarding | Magic link login, password reset, invite-based onboarding, logout, org-picker, setup script |
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add Phase 11 to completed features"
```

---

## Update Plan File

Also delete the earlier draft plan at `/root/.claude/plans/stateless-questing-snowglobe.md` — this file supersedes it.
