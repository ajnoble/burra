"use server";

import { db } from "@/db/index";
import { members, organisationMembers, organisations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createMemberSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import React from "react";
import { sendEmail } from "@/lib/email/send";
import { WelcomeEmail } from "@/lib/email/templates/welcome";

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

  const [member] = await db
    .insert(members)
    .values({
      organisationId: input.organisationId,
      membershipClassId: data.membershipClassId,
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

  // Send welcome email (fire-and-forget)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  sendEmail({
    to: data.email,
    subject: `Welcome to ${org?.name ?? input.slug}`,
    template: React.createElement(WelcomeEmail, {
      orgName: org?.name ?? input.slug,
      firstName: data.firstName,
      loginUrl: `${appUrl}/${input.slug}/login`,
      memberNumber: data.memberNumber || undefined,
      logoUrl: org?.logoUrl || undefined,
    }),
    replyTo: org?.contactEmail || undefined,
    orgName: org?.name ?? input.slug,
  });

  revalidatePath(`/${input.slug}/admin/members`);
  redirect(`/${input.slug}/admin/members/${member.id}`);
}
