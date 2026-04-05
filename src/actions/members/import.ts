"use server";

import { db } from "@/db/index";
import {
  members,
  membershipClasses,
  organisationMembers,
  memberImports,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { parseCsv } from "@/lib/import/parse-csv";
import {
  validateImportRows,
  parseBoolean,
  type ValidationResult,
} from "@/lib/import/validate-import";

export type ValidateImportResult = {
  success: boolean;
  validation?: ValidationResult;
  parseErrors?: string[];
};

export async function validateCsvImport(
  organisationId: string,
  csvText: string
): Promise<ValidateImportResult> {
  const parsed = parseCsv(csvText);

  if (parsed.errors.length > 0) {
    return { success: false, parseErrors: parsed.errors };
  }

  // Get existing emails in the organisation
  const existingMembers = await db
    .select({ email: members.email })
    .from(members)
    .where(eq(members.organisationId, organisationId));
  const existingEmails = new Set(existingMembers.map((m) => m.email.toLowerCase()));

  // Get valid membership classes
  const classes = await db
    .select({ name: membershipClasses.name })
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, organisationId));
  const validClasses = new Set(classes.map((c) => c.name));

  const validation = validateImportRows(parsed.rows, existingEmails, validClasses);

  return { success: true, validation };
}

export type ExecuteImportResult = {
  success: boolean;
  importId: string;
  imported: number;
  errors: number;
  errorDetails: Array<{ row: number; reason: string }>;
};

export async function executeImport(
  organisationId: string,
  csvText: string,
  uploadedByMemberId: string
): Promise<ExecuteImportResult> {
  const parsed = parseCsv(csvText);

  // Get membership class lookup
  const classes = await db
    .select({ id: membershipClasses.id, name: membershipClasses.name })
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, organisationId));
  const classMap = new Map(classes.map((c) => [c.name, c.id]));

  // Get existing emails
  const existingMembers = await db
    .select({ email: members.email })
    .from(members)
    .where(eq(members.organisationId, organisationId));
  const existingEmails = new Set(existingMembers.map((m) => m.email.toLowerCase()));

  // Validate
  const validClasses = new Set(classes.map((c) => c.name));
  const validation = validateImportRows(parsed.rows, existingEmails, validClasses);

  // Create import record
  const [importRecord] = await db
    .insert(memberImports)
    .values({
      organisationId,
      filename: "import.csv",
      uploadedByMemberId,
      status: "PROCESSING",
      totalRows: validation.totalCount,
    })
    .returning();

  const errorDetails: Array<{ row: number; reason: string }> = [];
  let imported = 0;

  // First pass: import all non-family-linked members
  const emailToMemberId = new Map<string, string>();

  for (const row of validation.rows) {
    if (!row.isValid) {
      errorDetails.push({
        row: row.row,
        reason: row.errors.join("; "),
      });
      continue;
    }

    const classId = classMap.get(row.data.membership_class.trim());
    if (!classId) continue;

    try {
      const [member] = await db
        .insert(members)
        .values({
          organisationId,
          membershipClassId: classId,
          firstName: row.data.first_name.trim(),
          lastName: row.data.last_name.trim(),
          email: row.data.email.trim().toLowerCase(),
          phone: row.data.phone?.trim() || null,
          dateOfBirth: row.data.date_of_birth?.trim() || null,
          memberNumber: row.data.member_number?.trim() || null,
          isFinancial: parseBoolean(row.data.is_financial),
        })
        .returning();

      emailToMemberId.set(member.email, member.id);

      // Create organisation member record with default MEMBER role
      await db.insert(organisationMembers).values({
        organisationId,
        memberId: member.id,
        role: "MEMBER",
      });

      imported++;
    } catch (err) {
      errorDetails.push({
        row: row.row,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Second pass: link family members via primary_member_email
  for (const row of validation.rows) {
    if (!row.isValid || !row.data.primary_member_email?.trim()) continue;

    const memberEmail = row.data.email.trim().toLowerCase();
    const primaryEmail = row.data.primary_member_email.trim().toLowerCase();
    const memberId = emailToMemberId.get(memberEmail);
    const primaryMemberId = emailToMemberId.get(primaryEmail);

    if (memberId && primaryMemberId) {
      await db
        .update(members)
        .set({ primaryMemberId })
        .where(eq(members.id, memberId));
    } else if (memberId && !primaryMemberId) {
      // Try finding primary member in existing members
      const [existing] = await db
        .select({ id: members.id })
        .from(members)
        .where(
          and(
            eq(members.organisationId, organisationId),
            eq(members.email, primaryEmail)
          )
        );
      if (existing) {
        await db
          .update(members)
          .set({ primaryMemberId: existing.id })
          .where(eq(members.id, memberId));
      }
    }
  }

  // Update import record
  await db
    .update(memberImports)
    .set({
      status: errorDetails.length > 0 ? "COMPLETED" : "COMPLETED",
      processedRows: imported + errorDetails.length,
      errorRows: errorDetails.length,
      errors: errorDetails,
      completedAt: new Date(),
    })
    .where(eq(memberImports.id, importRecord.id));

  return {
    success: true,
    importId: importRecord.id,
    imported,
    errors: errorDetails.length,
    errorDetails,
  };
}
