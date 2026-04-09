import path from "path";
import { fileURLToPath } from "url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type TestDb = PgliteDatabase<typeof schema>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../drizzle");

export async function createTestDb(): Promise<{
  db: TestDb;
  client: PGlite;
}> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, client };
}

// Every user-defined table in the schema. CASCADE makes order irrelevant,
// but we still list them explicitly so a new table added without updating
// this list causes a test failure rather than a silent data leak.
const ALL_TABLES = [
  "audit_log",
  "custom_field_values",
  "custom_fields",
  "communication_recipients",
  "communications",
  "communication_templates",
  "document_categories",
  "documents",
  "member_imports",
  "subscriptions",
  "transactions",
  "checkout_line_items",
  "one_off_charges",
  "charge_categories",
  "waitlist_entries",
  "availability_overrides",
  "availability_cache",
  "bed_holds",
  "booking_guests",
  "bookings",
  "booking_rounds",
  "tariffs",
  "seasons",
  "cancellation_policies",
  "financial_status_changes",
  "organisation_members",
  "members",
  "membership_classes",
  "beds",
  "rooms",
  "lodges",
  "organisations",
  "profiles",
] as const;

export async function truncateAll(db: TestDb): Promise<void> {
  const list = ALL_TABLES.map((t) => `"${t}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`));
}
