import { z } from "zod";

const FIELD_TYPES = ["text", "number", "date", "dropdown", "checkbox"] as const;

export const createCustomFieldSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    key: z
      .string()
      .trim()
      .min(1, "Key is required")
      .regex(/^[a-z][a-z0-9_]*$/, "Key must be lowercase letters, numbers, and underscores"),
    type: z.enum(FIELD_TYPES),
    options: z.string().trim().optional(),
    isRequired: z.boolean().default(false),
  })
  .refine(
    (data) => {
      if (data.type === "dropdown") {
        return !!data.options && data.options.trim().length > 0;
      }
      return true;
    },
    { message: "Dropdown fields must have options", path: ["options"] }
  );

export const updateCustomFieldSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/, "Key must be lowercase letters, numbers, and underscores")
    .optional(),
  type: z.enum(FIELD_TYPES).optional(),
  options: z.string().trim().optional(),
  isRequired: z.boolean().optional(),
});

export type ValidateResult =
  | { valid: true }
  | { valid: false; error: string };

export function validateCustomFieldValue(
  type: string,
  value: string,
  options: string | null
): ValidateResult {
  if (value === "") return { valid: true };

  switch (type) {
    case "text":
      return { valid: true };

    case "number": {
      const num = Number(value);
      if (isNaN(num) || !isFinite(num)) {
        return { valid: false, error: "Must be a valid number" };
      }
      return { valid: true };
    }

    case "date": {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(value)) {
        return { valid: false, error: "Must be a valid date (YYYY-MM-DD)" };
      }
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) {
        return { valid: false, error: "Must be a valid date (YYYY-MM-DD)" };
      }
      return { valid: true };
    }

    case "dropdown": {
      if (!options) return { valid: false, error: "No options defined" };
      const validOptions = options.split(",").map((o) => o.trim());
      const match = validOptions.some(
        (o) => o.toLowerCase() === value.toLowerCase()
      );
      if (!match) {
        return {
          valid: false,
          error: `Must be one of: ${validOptions.join(", ")}`,
        };
      }
      return { valid: true };
    }

    case "checkbox": {
      const valid = ["true", "false", "yes", "no", "1", "0"];
      if (!valid.includes(value.toLowerCase())) {
        return { valid: false, error: "Must be true/false, yes/no, or 1/0" };
      }
      return { valid: true };
    }

    default:
      return { valid: false, error: `Unknown field type: ${type}` };
  }
}
