import Papa from "papaparse";

export type CsvRow = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  date_of_birth?: string;
  membership_class: string;
  member_number?: string;
  is_financial?: string;
  primary_member_email?: string;
  [key: string]: string | undefined;
};

export type ParseResult = {
  rows: CsvRow[];
  headers: string[];
  errors: string[];
};

const REQUIRED_HEADERS = ["first_name", "last_name", "email", "membership_class"];
const VALID_HEADERS = [
  ...REQUIRED_HEADERS,
  "phone",
  "date_of_birth",
  "member_number",
  "is_financial",
  "primary_member_email",
];

export function parseCsv(csvText: string, customFieldKeys?: string[]): ParseResult {
  const result = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  const headers = result.meta.fields ?? [];
  const errors: string[] = [];

  // Check for required headers
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      errors.push(`Missing required column: ${required}`);
    }
  }

  // Warn about unknown headers
  const allValidHeaders = [...VALID_HEADERS, ...(customFieldKeys ?? [])];

  for (const h of headers) {
    if (!allValidHeaders.includes(h)) {
      errors.push(`Unknown column "${h}" will be ignored`);
    }
  }

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      errors.push(`Row ${(err.row ?? 0) + 1}: ${err.message}`);
    }
  }

  return {
    rows: result.data,
    headers,
    errors,
  };
}
