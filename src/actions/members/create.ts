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
