import type { CsvRow } from "./parse-csv";

export type RowValidation = {
  row: number;
  data: CsvRow;
  errors: string[];
  isValid: boolean;
};

export type ValidationResult = {
  rows: RowValidation[];
  validCount: number;
  errorCount: number;
  totalCount: number;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateImportRows(
  rows: CsvRow[],
  existingEmails: Set<string>,
  validMembershipClasses: Set<string>
): ValidationResult {
  const seenEmails = new Set<string>();
  const validatedRows: RowValidation[] = [];

  for (let i = 0; i < rows.length; i++) {
    const data = rows[i];
    const errors: string[] = [];
    const rowNum = i + 1;

    // Required fields
    if (!data.first_name?.trim()) {
      errors.push("first_name is required");
    }
    if (!data.last_name?.trim()) {
      errors.push("last_name is required");
    }
    if (!data.email?.trim()) {
      errors.push("email is required");
    } else {
      const email = data.email.trim().toLowerCase();
      if (!EMAIL_REGEX.test(email)) {
        errors.push("Invalid email format");
      } else if (existingEmails.has(email)) {
        errors.push("Email already exists in the organisation");
      } else if (seenEmails.has(email)) {
        errors.push("Duplicate email in CSV");
      } else {
        seenEmails.add(email);
      }
    }
    if (!data.membership_class?.trim()) {
      errors.push("membership_class is required");
    } else if (!validMembershipClasses.has(data.membership_class.trim())) {
      errors.push(
        `Unknown membership class "${data.membership_class.trim()}". Valid classes: ${[...validMembershipClasses].join(", ")}`
      );
    }

    // Optional field validation
    if (data.date_of_birth?.trim() && !DATE_REGEX.test(data.date_of_birth.trim())) {
      errors.push("date_of_birth must be in YYYY-MM-DD format");
    }

    if (data.is_financial?.trim()) {
      const val = data.is_financial.trim().toLowerCase();
      if (!["true", "false", "yes", "no", "1", "0"].includes(val)) {
        errors.push('is_financial must be true/false, yes/no, or 1/0');
      }
    }

    if (data.primary_member_email?.trim()) {
      const pEmail = data.primary_member_email.trim().toLowerCase();
      if (!EMAIL_REGEX.test(pEmail)) {
        errors.push("Invalid primary_member_email format");
      }
    }

    validatedRows.push({
      row: rowNum,
      data,
      errors,
      isValid: errors.length === 0,
    });
  }

  const validCount = validatedRows.filter((r) => r.isValid).length;

  return {
    rows: validatedRows,
    validCount,
    errorCount: validatedRows.length - validCount,
    totalCount: validatedRows.length,
  };
}

export function parseBoolean(value: string | undefined): boolean {
  if (!value?.trim()) return true; // default to financial
  const v = value.trim().toLowerCase();
  return v === "true" || v === "yes" || v === "1";
}
