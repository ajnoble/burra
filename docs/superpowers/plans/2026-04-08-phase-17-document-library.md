# Phase 17 — Document Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a document library with admin upload/management, category organisation, role-based access control, and member-facing browse/download via Supabase Storage.

**Architecture:** New `document_categories` table + columns added to existing `documents` table. Server actions handle CRUD, file upload/download via Supabase Storage private bucket with signed URLs. Admin page for management, member page for browsing/downloading. Access level hierarchy (ADMIN > COMMITTEE > MEMBER > PUBLIC) enforced server-side.

**Tech Stack:** Next.js 16, Drizzle ORM (PostgreSQL), Supabase Storage, shadcn/ui (Dialog, Table, Select, Input, Button), Vitest, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-04-08-phase-17-document-library-design.md`

---

## File Structure

```
src/
  db/schema/document-categories.ts    (NEW — document_categories table)
  db/schema/documents.ts              (MODIFY — add categoryId, fileSizeBytes, mimeType)
  db/schema/index.ts                  (MODIFY — export new table)
  lib/supabase/storage.ts             (NEW — upload, delete, signedUrl helpers)
  actions/documents/
    categories.ts                     (NEW — CRUD categories)
    categories.test.ts                (NEW)
    upload.ts                         (NEW — upload document + file)
    upload.test.ts                    (NEW)
    queries.ts                        (NEW — list/get documents with filters)
    queries.test.ts                   (NEW)
    update.ts                         (NEW — update metadata, replace file)
    update.test.ts                    (NEW)
    delete.ts                         (NEW — delete document + storage file)
    delete.test.ts                    (NEW)
    download.ts                       (NEW — signed URL generation with access check)
    download.test.ts                  (NEW)
  app/[slug]/admin/documents/
    page.tsx                          (NEW — admin documents page)
    upload-dialog.tsx                 (NEW — upload form dialog)
    edit-dialog.tsx                   (NEW — edit metadata dialog)
    category-dialog.tsx               (NEW — manage categories dialog)
    documents-table.tsx               (NEW — documents data table)
  app/[slug]/documents/
    page.tsx                          (NEW — member documents page)
    document-list.tsx                 (NEW — grouped document list)
    download-button.tsx               (NEW — triggers signed URL download)
```

---

### Task 1: Schema — document_categories table

**Files:**
- Create: `src/db/schema/document-categories.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create document-categories schema file**

Create `src/db/schema/document-categories.ts`:

```typescript
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";

export const documentCategories = pgTable("document_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

- [ ] **Step 2: Export from schema index**

In `src/db/schema/index.ts`, add this export alongside the existing `documents` export:

```typescript
export { documentCategories } from "./document-categories";
```

- [ ] **Step 3: Run the build to check for type errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/document-categories.ts src/db/schema/index.ts
git commit -m "feat(documents): add document_categories schema table"
```

---

### Task 2: Schema — add columns to documents table

**Files:**
- Modify: `src/db/schema/documents.ts`

- [ ] **Step 1: Add categoryId, fileSizeBytes, mimeType columns**

Modify `src/db/schema/documents.ts` to import `integer` and `documentCategories`, then add three new columns:

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { members } from "./members";
import { documentCategories } from "./document-categories";

export const documentAccessLevelEnum = pgEnum("document_access_level", [
  "PUBLIC",
  "MEMBER",
  "COMMITTEE",
  "ADMIN",
]);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  categoryId: uuid("category_id").references(() => documentCategories.id),
  title: text("title").notNull(),
  description: text("description"),
  fileUrl: text("file_url").notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  mimeType: text("mime_type"),
  accessLevel: documentAccessLevelEnum("access_level")
    .notNull()
    .default("MEMBER"),
  uploadedByMemberId: uuid("uploaded_by_member_id")
    .notNull()
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

- [ ] **Step 2: Run the build to check for type errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`
Expected: New migration file created in `drizzle/` directory

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/documents.ts drizzle/
git commit -m "feat(documents): add categoryId, fileSizeBytes, mimeType to documents schema"
```

---

### Task 3: Supabase Storage helpers

**Files:**
- Create: `src/lib/supabase/storage.ts`

- [ ] **Step 1: Create storage helper module**

Create `src/lib/supabase/storage.ts`:

```typescript
import { createAdminClient } from "./admin";

const BUCKET = "documents";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "text/csv",
];

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit` };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `File type "${file.type}" is not allowed. Allowed: PDF, Word, Excel, PNG, JPG, CSV`,
    };
  }
  return { valid: true };
}

export async function uploadFile(
  organisationId: string,
  fileId: string,
  fileName: string,
  file: File
): Promise<{ path: string; error?: string }> {
  const supabase = createAdminClient();
  const path = `${organisationId}/${fileId}-${fileName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return { path: "", error: error.message };
  }

  return { path };
}

export async function deleteFile(path: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function getSignedUrl(
  path: string,
  expiresInSeconds = 3600
): Promise<{ url: string; error?: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return { url: "", error: error?.message ?? "Failed to generate URL" };
  }

  return { url: data.signedUrl };
}
```

- [ ] **Step 2: Run the build to check for type errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/storage.ts
git commit -m "feat(documents): add Supabase Storage helper for upload, delete, signed URLs"
```

---

### Task 4: Category actions + tests

**Files:**
- Create: `src/actions/documents/categories.ts`
- Create: `src/actions/documents/categories.test.ts`

- [ ] **Step 1: Write failing tests for category CRUD**

Create `src/actions/documents/categories.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            returning: () => {
              mockReturning();
              return [{ id: "cat-1", name: "Meeting Minutes", organisationId: "org-1", sortOrder: 0 }];
            },
          };
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {
                orderBy: (...oArgs: unknown[]) => {
                  mockOrderBy(...oArgs);
                  return [
                    { id: "cat-1", name: "Bylaws", sortOrder: 0 },
                    { id: "cat-2", name: "Minutes", sortOrder: 1 },
                  ];
                },
              };
            },
          };
        },
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {
                returning: () => {
                  mockReturning();
                  return [{ id: "cat-1", name: "Updated", sortOrder: 0 }];
                },
              };
            },
          };
        },
      };
    },
    delete: (...args: unknown[]) => {
      mockDelete(...args);
      return {
        where: (...wArgs: unknown[]) => {
          mockWhere(...wArgs);
          return undefined;
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  documentCategories: {
    id: "documentCategories.id",
    organisationId: "documentCategories.organisationId",
    name: "documentCategories.name",
    sortOrder: "documentCategories.sortOrder",
  },
  documents: {
    id: "documents.id",
    categoryId: "documents.categoryId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  asc: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn(),
  isCommitteeOrAbove: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  listDocumentCategories,
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
} from "./categories";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";

const mockGetSession = getSessionMember as ReturnType<typeof vi.fn>;
const mockIsCommittee = isCommitteeOrAbove as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    memberId: "member-1",
    organisationId: "org-1",
    role: "ADMIN",
    firstName: "Test",
    lastName: "User",
    email: "test@test.com",
  });
  mockIsCommittee.mockReturnValue(true);
});

describe("listDocumentCategories", () => {
  it("returns categories sorted by sortOrder", async () => {
    const result = await listDocumentCategories("org-1");
    expect(result).toHaveLength(2);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockOrderBy).toHaveBeenCalled();
  });
});

describe("createDocumentCategory", () => {
  it("creates a category with valid input", async () => {
    const result = await createDocumentCategory({
      organisationId: "org-1",
      name: "Meeting Minutes",
      slug: "test-club",
    });
    expect(result.success).toBe(true);
    expect(result.category).toBeDefined();
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Meeting Minutes", organisationId: "org-1" })
    );
  });

  it("rejects unauthenticated users", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const result = await createDocumentCategory({
      organisationId: "org-1",
      name: "Test",
      slug: "test-club",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authenticated");
  });

  it("rejects non-committee members", async () => {
    mockIsCommittee.mockReturnValueOnce(false);
    const result = await createDocumentCategory({
      organisationId: "org-1",
      name: "Test",
      slug: "test-club",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authorised");
  });

  it("rejects empty name", async () => {
    const result = await createDocumentCategory({
      organisationId: "org-1",
      name: "",
      slug: "test-club",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Name is required");
  });
});

describe("updateDocumentCategory", () => {
  it("updates a category", async () => {
    const result = await updateDocumentCategory({
      id: "cat-1",
      organisationId: "org-1",
      name: "Updated",
      slug: "test-club",
    });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ name: "Updated" }));
  });
});

describe("deleteDocumentCategory", () => {
  it("nullifies document categoryIds and deletes the category", async () => {
    const result = await deleteDocumentCategory({
      id: "cat-1",
      organisationId: "org-1",
      slug: "test-club",
    });
    expect(result.success).toBe(true);
    // First update call: set documents.categoryId to null
    expect(mockUpdate).toHaveBeenCalled();
    // Then delete call
    expect(mockDelete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/documents/categories.test.ts`
Expected: FAIL — module `./categories` not found

- [ ] **Step 3: Implement category actions**

Create `src/actions/documents/categories.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { documentCategories, documents } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";

const categorySchema = z.object({
  organisationId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional().or(z.literal("")),
  sortOrder: z.number().int().default(0),
});

export async function listDocumentCategories(organisationId: string) {
  return db
    .select()
    .from(documentCategories)
    .where(eq(documentCategories.organisationId, organisationId))
    .orderBy(asc(documentCategories.sortOrder));
}

export async function createDocumentCategory(
  input: { organisationId: string; name: string; description?: string; sortOrder?: number; slug: string }
) {
  const session = await getSessionMember(input.organisationId);
  if (!session) return { success: false as const, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false as const, error: "Not authorised" };

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const [category] = await db
    .insert(documentCategories)
    .values({
      organisationId: parsed.data.organisationId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      sortOrder: parsed.data.sortOrder,
    })
    .returning();

  revalidatePath(`/${input.slug}/admin/documents`);
  return { success: true as const, category };
}

export async function updateDocumentCategory(
  input: { id: string; organisationId: string; name: string; description?: string; sortOrder?: number; slug: string }
) {
  const session = await getSessionMember(input.organisationId);
  if (!session) return { success: false as const, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false as const, error: "Not authorised" };

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const [updated] = await db
    .update(documentCategories)
    .set({
      name: parsed.data.name,
      description: parsed.data.description || null,
      sortOrder: parsed.data.sortOrder,
    })
    .where(eq(documentCategories.id, input.id))
    .returning();

  revalidatePath(`/${input.slug}/admin/documents`);
  return { success: true as const, category: updated };
}

export async function deleteDocumentCategory(
  input: { id: string; organisationId: string; slug: string }
) {
  const session = await getSessionMember(input.organisationId);
  if (!session) return { success: false as const, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false as const, error: "Not authorised" };

  // Nullify categoryId on documents in this category
  await db
    .update(documents)
    .set({ categoryId: null })
    .where(eq(documents.categoryId, input.id));

  // Delete the category
  await db.delete(documentCategories).where(eq(documentCategories.id, input.id));

  revalidatePath(`/${input.slug}/admin/documents`);
  return { success: true as const };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/documents/categories.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/documents/categories.ts src/actions/documents/categories.test.ts
git commit -m "feat(documents): add document category CRUD actions with tests"
```

---

### Task 5: Document upload action + tests

**Files:**
- Create: `src/actions/documents/upload.ts`
- Create: `src/actions/documents/upload.test.ts`

- [ ] **Step 1: Write failing tests for document upload**

Create `src/actions/documents/upload.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            returning: () => {
              mockReturning();
              return [{ id: "doc-1", title: "test.pdf", organisationId: "org-1" }];
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  documents: { id: "documents.id" },
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn(),
  isCommitteeOrAbove: vi.fn(),
}));

vi.mock("@/lib/supabase/storage", () => ({
  validateFile: vi.fn(),
  uploadFile: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("crypto", () => ({
  randomUUID: () => "uuid-1234",
}));

import { uploadDocument } from "./upload";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { validateFile, uploadFile } from "@/lib/supabase/storage";

const mockGetSession = getSessionMember as ReturnType<typeof vi.fn>;
const mockIsCommittee = isCommitteeOrAbove as ReturnType<typeof vi.fn>;
const mockValidateFile = validateFile as ReturnType<typeof vi.fn>;
const mockUploadFile = uploadFile as ReturnType<typeof vi.fn>;

function makeFormData(overrides?: Record<string, string | Blob>) {
  const file = new File(["content"], "test.pdf", { type: "application/pdf" });
  const fd = new FormData();
  fd.set("file", overrides?.file ?? file);
  fd.set("title", (overrides?.title as string) ?? "Test Document");
  fd.set("accessLevel", (overrides?.accessLevel as string) ?? "MEMBER");
  fd.set("organisationId", (overrides?.organisationId as string) ?? "org-1");
  fd.set("slug", (overrides?.slug as string) ?? "test-club");
  if (overrides?.categoryId) fd.set("categoryId", overrides.categoryId as string);
  if (overrides?.description) fd.set("description", overrides.description as string);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    memberId: "member-1",
    organisationId: "org-1",
    role: "ADMIN",
    firstName: "Test",
    lastName: "User",
    email: "test@test.com",
  });
  mockIsCommittee.mockReturnValue(true);
  mockValidateFile.mockReturnValue({ valid: true });
  mockUploadFile.mockResolvedValue({ path: "org-1/uuid-1234-test.pdf" });
});

describe("uploadDocument", () => {
  it("uploads a document with valid input", async () => {
    const result = await uploadDocument(makeFormData());
    expect(result.success).toBe(true);
    expect(result.document).toBeDefined();
    expect(mockValidateFile).toHaveBeenCalled();
    expect(mockUploadFile).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });

  it("rejects unauthenticated users", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const result = await uploadDocument(makeFormData());
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authenticated");
  });

  it("rejects non-committee members", async () => {
    mockIsCommittee.mockReturnValueOnce(false);
    const result = await uploadDocument(makeFormData());
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authorised");
  });

  it("rejects invalid file types", async () => {
    mockValidateFile.mockReturnValueOnce({ valid: false, error: "File type not allowed" });
    const result = await uploadDocument(makeFormData());
    expect(result.success).toBe(false);
    expect(result.error).toBe("File type not allowed");
  });

  it("handles storage upload failure", async () => {
    mockUploadFile.mockResolvedValueOnce({ path: "", error: "Storage error" });
    const result = await uploadDocument(makeFormData());
    expect(result.success).toBe(false);
    expect(result.error).toBe("Storage error");
  });

  it("sets optional categoryId and description", async () => {
    const fd = makeFormData({ categoryId: "cat-1", description: "A doc" });
    await uploadDocument(fd);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: "cat-1", description: "A doc" })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/documents/upload.test.ts`
Expected: FAIL — module `./upload` not found

- [ ] **Step 3: Implement upload action**

Create `src/actions/documents/upload.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { documents } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { validateFile, uploadFile } from "@/lib/supabase/storage";
import { randomUUID } from "crypto";

type UploadResult =
  | { success: true; document: { id: string; title: string } }
  | { success: false; error: string };

export async function uploadDocument(formData: FormData): Promise<UploadResult> {
  const organisationId = formData.get("organisationId") as string;
  const slug = formData.get("slug") as string;
  const file = formData.get("file") as File | null;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const categoryId = (formData.get("categoryId") as string) || null;
  const accessLevel = (formData.get("accessLevel") as string) || "MEMBER";

  const session = await getSessionMember(organisationId);
  if (!session) return { success: false, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false, error: "Not authorised" };

  if (!file || !title) {
    return { success: false, error: "File and title are required" };
  }

  const validation = validateFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error! };
  }

  const fileId = randomUUID();
  const { path, error: uploadError } = await uploadFile(
    organisationId,
    fileId,
    file.name,
    file
  );

  if (uploadError) {
    return { success: false, error: uploadError };
  }

  const [doc] = await db
    .insert(documents)
    .values({
      organisationId,
      categoryId,
      title,
      description,
      fileUrl: path,
      fileSizeBytes: file.size,
      mimeType: file.type,
      accessLevel: accessLevel as "PUBLIC" | "MEMBER" | "COMMITTEE" | "ADMIN",
      uploadedByMemberId: session.memberId,
    })
    .returning();

  revalidatePath(`/${slug}/admin/documents`);
  revalidatePath(`/${slug}/documents`);
  return { success: true, document: { id: doc.id, title: doc.title } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/documents/upload.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/documents/upload.ts src/actions/documents/upload.test.ts
git commit -m "feat(documents): add document upload action with file validation and tests"
```

---

### Task 6: Document query actions + tests

**Files:**
- Create: `src/actions/documents/queries.ts`
- Create: `src/actions/documents/queries.test.ts`

- [ ] **Step 1: Write failing tests for document queries**

Create `src/actions/documents/queries.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDocList = [
  {
    documents: {
      id: "doc-1",
      title: "Bylaws 2026",
      description: null,
      fileUrl: "org-1/abc-bylaws.pdf",
      fileSizeBytes: 50000,
      mimeType: "application/pdf",
      accessLevel: "MEMBER",
      categoryId: "cat-1",
      createdAt: new Date("2026-04-01"),
    },
    document_categories: { id: "cat-1", name: "Bylaws" },
    members: { firstName: "Jane", lastName: "Doe" },
  },
  {
    documents: {
      id: "doc-2",
      title: "Admin Only Doc",
      description: null,
      fileUrl: "org-1/xyz-admin.pdf",
      fileSizeBytes: 30000,
      mimeType: "application/pdf",
      accessLevel: "ADMIN",
      categoryId: null,
      createdAt: new Date("2026-04-02"),
    },
    document_categories: null,
    members: { firstName: "John", lastName: "Smith" },
  },
];

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockLeftJoin = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const chain: Record<string, (...a: unknown[]) => unknown> = {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return chain;
        },
        leftJoin: (...jArgs: unknown[]) => {
          mockLeftJoin(...jArgs);
          return chain;
        },
        where: (...wArgs: unknown[]) => {
          mockWhere(...wArgs);
          return chain;
        },
        orderBy: (...oArgs: unknown[]) => {
          mockOrderBy(...oArgs);
          return mockDocList;
        },
      };
      return chain;
    },
  },
}));

vi.mock("@/db/schema", () => ({
  documents: {
    id: "documents.id",
    organisationId: "documents.organisationId",
    categoryId: "documents.categoryId",
    title: "documents.title",
    accessLevel: "documents.accessLevel",
    createdAt: "documents.createdAt",
  },
  documentCategories: {
    id: "documentCategories.id",
    name: "documentCategories.name",
    sortOrder: "documentCategories.sortOrder",
  },
  members: {
    id: "members.id",
    firstName: "members.firstName",
    lastName: "members.lastName",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn(),
  inArray: vi.fn((...args: unknown[]) => args),
  ilike: vi.fn((...args: unknown[]) => args),
}));

import { listDocuments, listDocumentsForMember } from "./queries";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listDocuments", () => {
  it("returns all documents for an organisation", async () => {
    const result = await listDocuments("org-1");
    expect(result).toHaveLength(2);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockLeftJoin).toHaveBeenCalled();
  });

  it("passes filter conditions when provided", async () => {
    await listDocuments("org-1", { categoryId: "cat-1" });
    expect(mockWhere).toHaveBeenCalled();
  });
});

describe("listDocumentsForMember", () => {
  it("filters documents by member access level", async () => {
    const result = await listDocumentsForMember("org-1", "MEMBER");
    expect(result).toBeDefined();
    expect(mockWhere).toHaveBeenCalled();
  });

  it("includes correct access levels for COMMITTEE role", async () => {
    await listDocumentsForMember("org-1", "COMMITTEE");
    expect(mockWhere).toHaveBeenCalled();
  });

  it("includes all access levels for ADMIN role", async () => {
    await listDocumentsForMember("org-1", "ADMIN");
    expect(mockWhere).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/documents/queries.test.ts`
Expected: FAIL — module `./queries` not found

- [ ] **Step 3: Implement query actions**

Create `src/actions/documents/queries.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { documents, documentCategories, members } from "@/db/schema";
import { eq, and, desc, inArray, ilike } from "drizzle-orm";

const ACCESS_HIERARCHY: Record<string, string[]> = {
  ADMIN: ["PUBLIC", "MEMBER", "COMMITTEE", "ADMIN"],
  COMMITTEE: ["PUBLIC", "MEMBER", "COMMITTEE"],
  BOOKING_OFFICER: ["PUBLIC", "MEMBER"],
  MEMBER: ["PUBLIC", "MEMBER"],
};

type ListFilters = {
  categoryId?: string;
  accessLevel?: string;
  search?: string;
};

export async function listDocuments(organisationId: string, filters?: ListFilters) {
  const conditions = [eq(documents.organisationId, organisationId)];

  if (filters?.categoryId) {
    conditions.push(eq(documents.categoryId, filters.categoryId));
  }
  if (filters?.accessLevel) {
    conditions.push(
      eq(documents.accessLevel, filters.accessLevel as "PUBLIC" | "MEMBER" | "COMMITTEE" | "ADMIN")
    );
  }
  if (filters?.search) {
    conditions.push(ilike(documents.title, `%${filters.search}%`));
  }

  return db
    .select()
    .from(documents)
    .leftJoin(documentCategories, eq(documentCategories.id, documents.categoryId))
    .leftJoin(members, eq(members.id, documents.uploadedByMemberId))
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt));
}

export async function listDocumentsForMember(
  organisationId: string,
  memberRole: string,
  search?: string
) {
  const allowedLevels = ACCESS_HIERARCHY[memberRole] ?? ["PUBLIC"];
  const conditions = [
    eq(documents.organisationId, organisationId),
    inArray(
      documents.accessLevel,
      allowedLevels as ("PUBLIC" | "MEMBER" | "COMMITTEE" | "ADMIN")[]
    ),
  ];

  if (search) {
    conditions.push(ilike(documents.title, `%${search}%`));
  }

  return db
    .select()
    .from(documents)
    .leftJoin(documentCategories, eq(documentCategories.id, documents.categoryId))
    .leftJoin(members, eq(members.id, documents.uploadedByMemberId))
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/documents/queries.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/documents/queries.ts src/actions/documents/queries.test.ts
git commit -m "feat(documents): add document query actions with access level filtering and tests"
```

---

### Task 7: Document update action + tests

**Files:**
- Create: `src/actions/documents/update.ts`
- Create: `src/actions/documents/update.test.ts`

- [ ] **Step 1: Write failing tests for document update**

Create `src/actions/documents/update.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {
                returning: () => {
                  mockReturning();
                  return [{ id: "doc-1", title: "Updated Title" }];
                },
              };
            },
          };
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return [{ id: "doc-1", organisationId: "org-1", fileUrl: "org-1/old-file.pdf" }];
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  documents: {
    id: "documents.id",
    organisationId: "documents.organisationId",
    fileUrl: "documents.fileUrl",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn(),
  isCommitteeOrAbove: vi.fn(),
}));

vi.mock("@/lib/supabase/storage", () => ({
  validateFile: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("crypto", () => ({
  randomUUID: () => "uuid-5678",
}));

import { updateDocument, replaceFile } from "./update";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { validateFile, uploadFile, deleteFile } from "@/lib/supabase/storage";

const mockGetSession = getSessionMember as ReturnType<typeof vi.fn>;
const mockIsCommittee = isCommitteeOrAbove as ReturnType<typeof vi.fn>;
const mockValidateFile = validateFile as ReturnType<typeof vi.fn>;
const mockUploadFile = uploadFile as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    memberId: "member-1",
    organisationId: "org-1",
    role: "ADMIN",
    firstName: "Test",
    lastName: "User",
    email: "test@test.com",
  });
  mockIsCommittee.mockReturnValue(true);
  mockValidateFile.mockReturnValue({ valid: true });
  mockUploadFile.mockResolvedValue({ path: "org-1/uuid-5678-new.pdf" });
});

describe("updateDocument", () => {
  it("updates document metadata", async () => {
    const result = await updateDocument({
      documentId: "doc-1",
      organisationId: "org-1",
      title: "Updated Title",
      accessLevel: "COMMITTEE",
      slug: "test-club",
    });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Updated Title", accessLevel: "COMMITTEE" })
    );
  });

  it("rejects unauthenticated users", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const result = await updateDocument({
      documentId: "doc-1",
      organisationId: "org-1",
      title: "Test",
      slug: "test-club",
    });
    expect(result.success).toBe(false);
  });
});

describe("replaceFile", () => {
  it("replaces file in storage and updates record", async () => {
    const file = new File(["new"], "new.pdf", { type: "application/pdf" });
    const fd = new FormData();
    fd.set("file", file);
    fd.set("documentId", "doc-1");
    fd.set("organisationId", "org-1");
    fd.set("slug", "test-club");

    const result = await replaceFile(fd);
    expect(result.success).toBe(true);
    expect(deleteFile).toHaveBeenCalledWith("org-1/old-file.pdf");
    expect(mockUploadFile).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects invalid file types", async () => {
    mockValidateFile.mockReturnValueOnce({ valid: false, error: "Bad type" });
    const fd = new FormData();
    fd.set("file", new File(["x"], "bad.exe", { type: "application/x-msdownload" }));
    fd.set("documentId", "doc-1");
    fd.set("organisationId", "org-1");
    fd.set("slug", "test-club");

    const result = await replaceFile(fd);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Bad type");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/documents/update.test.ts`
Expected: FAIL — module `./update` not found

- [ ] **Step 3: Implement update actions**

Create `src/actions/documents/update.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { validateFile, uploadFile, deleteFile } from "@/lib/supabase/storage";
import { randomUUID } from "crypto";

type UpdateInput = {
  documentId: string;
  organisationId: string;
  title?: string;
  description?: string | null;
  categoryId?: string | null;
  accessLevel?: string;
  slug: string;
};

type ActionResult =
  | { success: true }
  | { success: false; error: string };

export async function updateDocument(input: UpdateInput): Promise<ActionResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session) return { success: false, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false, error: "Not authorised" };

  const setValues: Record<string, unknown> = {};
  if (input.title !== undefined) setValues.title = input.title;
  if (input.description !== undefined) setValues.description = input.description;
  if (input.categoryId !== undefined) setValues.categoryId = input.categoryId || null;
  if (input.accessLevel !== undefined) setValues.accessLevel = input.accessLevel;

  await db
    .update(documents)
    .set(setValues)
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.organisationId, input.organisationId)
      )
    )
    .returning();

  revalidatePath(`/${input.slug}/admin/documents`);
  revalidatePath(`/${input.slug}/documents`);
  return { success: true };
}

export async function replaceFile(formData: FormData): Promise<ActionResult> {
  const documentId = formData.get("documentId") as string;
  const organisationId = formData.get("organisationId") as string;
  const slug = formData.get("slug") as string;
  const file = formData.get("file") as File | null;

  const session = await getSessionMember(organisationId);
  if (!session) return { success: false, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false, error: "Not authorised" };

  if (!file) return { success: false, error: "File is required" };

  const validation = validateFile(file);
  if (!validation.valid) return { success: false, error: validation.error! };

  // Get existing document to find old file path
  const [existing] = await db
    .select({ id: documents.id, organisationId: documents.organisationId, fileUrl: documents.fileUrl })
    .from(documents)
    .where(
      and(eq(documents.id, documentId), eq(documents.organisationId, organisationId))
    );

  if (!existing) return { success: false, error: "Document not found" };

  // Delete old file
  await deleteFile(existing.fileUrl);

  // Upload new file
  const fileId = randomUUID();
  const { path, error: uploadError } = await uploadFile(organisationId, fileId, file.name, file);
  if (uploadError) return { success: false, error: uploadError };

  // Update record
  await db
    .update(documents)
    .set({ fileUrl: path, fileSizeBytes: file.size, mimeType: file.type })
    .where(eq(documents.id, documentId))
    .returning();

  revalidatePath(`/${slug}/admin/documents`);
  revalidatePath(`/${slug}/documents`);
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/documents/update.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/documents/update.ts src/actions/documents/update.test.ts
git commit -m "feat(documents): add document update and file replace actions with tests"
```

---

### Task 8: Document delete action + tests

**Files:**
- Create: `src/actions/documents/delete.ts`
- Create: `src/actions/documents/delete.test.ts`

- [ ] **Step 1: Write failing tests for document delete**

Create `src/actions/documents/delete.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              return mockWhere(...wArgs);
            },
          };
        },
      };
    },
    delete: (...args: unknown[]) => {
      mockDelete(...args);
      return {
        where: (...wArgs: unknown[]) => {
          mockWhere(...wArgs);
          return undefined;
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  documents: {
    id: "documents.id",
    organisationId: "documents.organisationId",
    fileUrl: "documents.fileUrl",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn(),
  isCommitteeOrAbove: vi.fn(),
}));

vi.mock("@/lib/supabase/storage", () => ({
  deleteFile: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { deleteDocument } from "./delete";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { deleteFile } from "@/lib/supabase/storage";

const mockGetSession = getSessionMember as ReturnType<typeof vi.fn>;
const mockIsCommittee = isCommitteeOrAbove as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    memberId: "member-1",
    organisationId: "org-1",
    role: "ADMIN",
    firstName: "Test",
    lastName: "User",
    email: "test@test.com",
  });
  mockIsCommittee.mockReturnValue(true);
  mockWhere.mockReturnValue([{ id: "doc-1", organisationId: "org-1", fileUrl: "org-1/abc-test.pdf" }]);
});

describe("deleteDocument", () => {
  it("deletes document from DB and storage", async () => {
    const result = await deleteDocument({
      documentId: "doc-1",
      organisationId: "org-1",
      slug: "test-club",
    });
    expect(result.success).toBe(true);
    expect(deleteFile).toHaveBeenCalledWith("org-1/abc-test.pdf");
    expect(mockDelete).toHaveBeenCalled();
  });

  it("rejects unauthenticated users", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const result = await deleteDocument({
      documentId: "doc-1",
      organisationId: "org-1",
      slug: "test-club",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authenticated");
  });

  it("returns error when document not found", async () => {
    mockWhere.mockReturnValueOnce([]);
    const result = await deleteDocument({
      documentId: "not-found",
      organisationId: "org-1",
      slug: "test-club",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Document not found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/documents/delete.test.ts`
Expected: FAIL — module `./delete` not found

- [ ] **Step 3: Implement delete action**

Create `src/actions/documents/delete.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { deleteFile } from "@/lib/supabase/storage";

type DeleteInput = {
  documentId: string;
  organisationId: string;
  slug: string;
};

type DeleteResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteDocument(input: DeleteInput): Promise<DeleteResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session) return { success: false, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false, error: "Not authorised" };

  // Find document to get file path
  const [existing] = await db
    .select({
      id: documents.id,
      organisationId: documents.organisationId,
      fileUrl: documents.fileUrl,
    })
    .from(documents)
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.organisationId, input.organisationId)
      )
    );

  if (!existing) return { success: false, error: "Document not found" };

  // Delete from storage
  await deleteFile(existing.fileUrl);

  // Delete from DB
  await db.delete(documents).where(eq(documents.id, input.documentId));

  revalidatePath(`/${input.slug}/admin/documents`);
  revalidatePath(`/${input.slug}/documents`);
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/documents/delete.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/documents/delete.ts src/actions/documents/delete.test.ts
git commit -m "feat(documents): add document delete action with storage cleanup and tests"
```

---

### Task 9: Document download action + tests

**Files:**
- Create: `src/actions/documents/download.ts`
- Create: `src/actions/documents/download.test.ts`

- [ ] **Step 1: Write failing tests for download action**

Create `src/actions/documents/download.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              return mockWhere(...wArgs);
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  documents: {
    id: "documents.id",
    organisationId: "documents.organisationId",
    fileUrl: "documents.fileUrl",
    accessLevel: "documents.accessLevel",
    title: "documents.title",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/lib/supabase/storage", () => ({
  getSignedUrl: vi.fn(),
}));

import { getDownloadUrl } from "./download";
import { getSignedUrl } from "@/lib/supabase/storage";

const mockGetSignedUrl = getSignedUrl as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockWhere.mockReturnValue([{
    id: "doc-1",
    organisationId: "org-1",
    fileUrl: "org-1/abc-test.pdf",
    accessLevel: "MEMBER",
    title: "Test Doc",
  }]);
  mockGetSignedUrl.mockResolvedValue({ url: "https://storage.example.com/signed-url" });
});

describe("getDownloadUrl", () => {
  it("returns signed URL for document accessible to member", async () => {
    const result = await getDownloadUrl("doc-1", "org-1", "MEMBER");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.url).toBe("https://storage.example.com/signed-url");
    }
  });

  it("returns signed URL for ADMIN accessing any document", async () => {
    mockWhere.mockReturnValueOnce([{
      id: "doc-1",
      organisationId: "org-1",
      fileUrl: "org-1/abc-test.pdf",
      accessLevel: "ADMIN",
      title: "Admin Doc",
    }]);
    const result = await getDownloadUrl("doc-1", "org-1", "ADMIN");
    expect(result.success).toBe(true);
  });

  it("rejects MEMBER accessing COMMITTEE document", async () => {
    mockWhere.mockReturnValueOnce([{
      id: "doc-1",
      organisationId: "org-1",
      fileUrl: "org-1/abc-test.pdf",
      accessLevel: "COMMITTEE",
      title: "Committee Doc",
    }]);
    const result = await getDownloadUrl("doc-1", "org-1", "MEMBER");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Access denied");
    }
  });

  it("returns error when document not found", async () => {
    mockWhere.mockReturnValueOnce([]);
    const result = await getDownloadUrl("not-found", "org-1", "ADMIN");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Document not found");
    }
  });

  it("returns error when signed URL generation fails", async () => {
    mockGetSignedUrl.mockResolvedValueOnce({ url: "", error: "Storage error" });
    const result = await getDownloadUrl("doc-1", "org-1", "MEMBER");
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/documents/download.test.ts`
Expected: FAIL — module `./download` not found

- [ ] **Step 3: Implement download action**

Create `src/actions/documents/download.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSignedUrl } from "@/lib/supabase/storage";

const ACCESS_RANK: Record<string, number> = {
  PUBLIC: 0,
  MEMBER: 1,
  COMMITTEE: 2,
  ADMIN: 3,
};

function canAccess(memberRole: string, documentAccessLevel: string): boolean {
  const memberRank = ACCESS_RANK[memberRole] ?? ACCESS_RANK["MEMBER"];
  const docRank = ACCESS_RANK[documentAccessLevel] ?? ACCESS_RANK["ADMIN"];
  return memberRank >= docRank;
}

type DownloadResult =
  | { success: true; url: string }
  | { success: false; error: string };

export async function getDownloadUrl(
  documentId: string,
  organisationId: string,
  memberRole: string
): Promise<DownloadResult> {
  const [doc] = await db
    .select({
      id: documents.id,
      organisationId: documents.organisationId,
      fileUrl: documents.fileUrl,
      accessLevel: documents.accessLevel,
      title: documents.title,
    })
    .from(documents)
    .where(
      and(eq(documents.id, documentId), eq(documents.organisationId, organisationId))
    );

  if (!doc) return { success: false, error: "Document not found" };

  if (!canAccess(memberRole, doc.accessLevel)) {
    return { success: false, error: "Access denied" };
  }

  const { url, error } = await getSignedUrl(doc.fileUrl);
  if (error || !url) {
    return { success: false, error: error ?? "Failed to generate download URL" };
  }

  return { success: true, url };
}
```

Note: `BOOKING_OFFICER` is not in `ACCESS_RANK` — it falls through to `MEMBER` rank via the fallback, which is correct (booking officers get MEMBER-level document access).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/documents/download.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/documents/download.ts src/actions/documents/download.test.ts
git commit -m "feat(documents): add download action with access level enforcement and tests"
```

---

### Task 10: Admin documents page — documents table component

**Files:**
- Create: `src/app/[slug]/admin/documents/documents-table.tsx`

- [ ] **Step 1: Create the documents table client component**

Create `src/app/[slug]/admin/documents/documents-table.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteDocument } from "@/actions/documents/delete";
import { toast } from "sonner";
import { FileText, Sheet, Image, File, Trash2, Pencil } from "lucide-react";

export type DocumentRow = {
  documents: {
    id: string;
    title: string;
    description: string | null;
    fileUrl: string;
    fileSizeBytes: number | null;
    mimeType: string | null;
    accessLevel: "PUBLIC" | "MEMBER" | "COMMITTEE" | "ADMIN";
    categoryId: string | null;
    createdAt: Date;
  };
  document_categories: { id: string; name: string } | null;
  members: { firstName: string; lastName: string } | null;
};

const ACCESS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PUBLIC: "outline",
  MEMBER: "secondary",
  COMMITTEE: "default",
  ADMIN: "destructive",
};

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (!mimeType) return <File className="h-4 w-4 text-muted-foreground" />;
  if (mimeType === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  if (mimeType.includes("word")) return <FileText className="h-4 w-4 text-blue-500" />;
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType === "text/csv")
    return <Sheet className="h-4 w-4 text-green-500" />;
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4 text-purple-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-AU");
}

export function DocumentsTable({
  documents: docs,
  organisationId,
  slug,
  onEdit,
}: {
  documents: DocumentRow[];
  organisationId: string;
  slug: string;
  onEdit: (doc: DocumentRow) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete(doc: DocumentRow) {
    if (!confirm(`Delete "${doc.documents.title}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteDocument({
        documentId: doc.documents.id,
        organisationId,
        slug,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to delete");
      } else {
        toast.success("Document deleted");
        router.refresh();
      }
    });
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Uploaded By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No documents uploaded yet.
                </TableCell>
              </TableRow>
            ) : (
              docs.map((doc) => (
                <TableRow key={doc.documents.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileIcon mimeType={doc.documents.mimeType} />
                      <div>
                        <p className="font-medium">{doc.documents.title}</p>
                        {doc.documents.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {doc.documents.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{doc.document_categories?.name ?? "Uncategorized"}</TableCell>
                  <TableCell>
                    <Badge variant={ACCESS_VARIANT[doc.documents.accessLevel]}>
                      {doc.documents.accessLevel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {doc.members
                      ? `${doc.members.firstName} ${doc.members.lastName}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(doc.documents.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatFileSize(doc.documents.fileSizeBytes)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(doc)}
                        disabled={isPending}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(doc)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {docs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No documents uploaded yet.</p>
        ) : (
          docs.map((doc) => (
            <div key={doc.documents.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileIcon mimeType={doc.documents.mimeType} />
                  <p className="font-medium">{doc.documents.title}</p>
                </div>
                <Badge variant={ACCESS_VARIANT[doc.documents.accessLevel]}>
                  {doc.documents.accessLevel}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>{doc.document_categories?.name ?? "Uncategorized"} &middot; {formatFileSize(doc.documents.fileSizeBytes)}</p>
                <p>{formatDate(doc.documents.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(doc)} disabled={isPending}>
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(doc)} disabled={isPending}>
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the build to check for type errors**

Run: `npx tsc --noEmit`
Expected: No errors (or only pre-existing unrelated errors)

- [ ] **Step 3: Commit**

```bash
git add src/app/\[slug\]/admin/documents/documents-table.tsx
git commit -m "feat(documents): add admin documents table component with mobile cards"
```

---

### Task 11: Admin documents page — upload and edit dialogs

**Files:**
- Create: `src/app/[slug]/admin/documents/upload-dialog.tsx`
- Create: `src/app/[slug]/admin/documents/edit-dialog.tsx`

- [ ] **Step 1: Create upload dialog component**

Create `src/app/[slug]/admin/documents/upload-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadDocument } from "@/actions/documents/upload";
import { toast } from "sonner";
import { Upload } from "lucide-react";

type Props = {
  organisationId: string;
  slug: string;
  categories: Array<{ id: string; name: string }>;
};

export function UploadDialog({ organisationId, slug, categories }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accessLevel, setAccessLevel] = useState("MEMBER");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && !title) {
      setTitle(file.name.replace(/\.[^.]+$/, ""));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    formData.set("organisationId", organisationId);
    formData.set("slug", slug);
    formData.set("accessLevel", accessLevel);
    if (categoryId) formData.set("categoryId", categoryId);

    try {
      const result = await uploadDocument(formData);
      if (!result.success) {
        toast.error(result.error ?? "Upload failed");
        return;
      }
      toast.success("Document uploaded");
      setOpen(false);
      setTitle("");
      setCategoryId("");
      setAccessLevel("MEMBER");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Upload className="h-4 w-4 mr-1.5" />
        Upload Document
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-file">File</Label>
            <Input
              id="doc-file"
              name="file"
              type="file"
              required
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.csv"
              onChange={handleFileChange}
            />
            <p className="text-xs text-muted-foreground">
              Max 10 MB. PDF, Word, Excel, PNG, JPG, CSV.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-description">Description (optional)</Label>
            <Textarea
              id="doc-description"
              name="description"
              placeholder="Brief description"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-category">Category</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
              <SelectTrigger id="doc-category">
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Uncategorized</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-access">Access Level</Label>
            <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v ?? "MEMBER")}>
              <SelectTrigger id="doc-access">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">Public</SelectItem>
                <SelectItem value="MEMBER">Members</SelectItem>
                <SelectItem value="COMMITTEE">Committee</SelectItem>
                <SelectItem value="ADMIN">Admin Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={saving || !title}>
            {saving ? "Uploading..." : "Upload"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create edit dialog component**

Create `src/app/[slug]/admin/documents/edit-dialog.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateDocument, replaceFile } from "@/actions/documents/update";
import { toast } from "sonner";
import type { DocumentRow } from "./documents-table";

type Props = {
  document: DocumentRow | null;
  organisationId: string;
  slug: string;
  categories: Array<{ id: string; name: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditDialog({
  document: doc,
  organisationId,
  slug,
  categories,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accessLevel, setAccessLevel] = useState("MEMBER");

  useEffect(() => {
    if (doc) {
      setTitle(doc.documents.title);
      setDescription(doc.documents.description ?? "");
      setCategoryId(doc.documents.categoryId ?? "");
      setAccessLevel(doc.documents.accessLevel);
    }
  }, [doc]);

  async function handleSave() {
    if (!doc) return;
    setSaving(true);
    try {
      const result = await updateDocument({
        documentId: doc.documents.id,
        organisationId,
        title,
        description: description || null,
        categoryId: categoryId || null,
        accessLevel,
        slug,
      });
      if (!result.success) {
        toast.error(result.error ?? "Update failed");
        return;
      }
      toast.success("Document updated");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReplaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!doc || !e.target.files?.[0]) return;
    setReplacing(true);
    const fd = new FormData();
    fd.set("file", e.target.files[0]);
    fd.set("documentId", doc.documents.id);
    fd.set("organisationId", organisationId);
    fd.set("slug", slug);
    try {
      const result = await replaceFile(fd);
      if (!result.success) {
        toast.error(result.error ?? "Replace failed");
        return;
      }
      toast.success("File replaced");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Replace failed");
    } finally {
      setReplacing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-category">Category</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
              <SelectTrigger id="edit-category">
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Uncategorized</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-access">Access Level</Label>
            <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v ?? "MEMBER")}>
              <SelectTrigger id="edit-access">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">Public</SelectItem>
                <SelectItem value="MEMBER">Members</SelectItem>
                <SelectItem value="COMMITTEE">Committee</SelectItem>
                <SelectItem value="ADMIN">Admin Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-replace">Replace File</Label>
            <Input
              id="edit-replace"
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.csv"
              onChange={handleReplaceFile}
              disabled={replacing}
            />
            {replacing && <p className="text-xs text-muted-foreground">Replacing file...</p>}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !title}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Run the build to check for type errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/\[slug\]/admin/documents/upload-dialog.tsx src/app/\[slug\]/admin/documents/edit-dialog.tsx
git commit -m "feat(documents): add upload and edit dialog components for admin page"
```

---

### Task 12: Admin documents page — category dialog + page

**Files:**
- Create: `src/app/[slug]/admin/documents/category-dialog.tsx`
- Create: `src/app/[slug]/admin/documents/page.tsx`

- [ ] **Step 1: Create category management dialog**

Create `src/app/[slug]/admin/documents/category-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
} from "@/actions/documents/categories";
import { toast } from "sonner";
import { FolderOpen, Pencil, Trash2, Plus } from "lucide-react";

type Category = { id: string; name: string; description: string | null; sortOrder: number };

export function CategoryDialog({
  organisationId,
  slug,
  categories,
}: {
  organisationId: string;
  slug: string;
  categories: Category[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function handleCreate() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const result = await createDocumentCategory({
        organisationId,
        name: newName.trim(),
        sortOrder: categories.length,
        slug,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to create category");
        return;
      }
      toast.success("Category created");
      setNewName("");
      router.refresh();
    });
  }

  function handleUpdate(id: string) {
    if (!editName.trim()) return;
    startTransition(async () => {
      const result = await updateDocumentCategory({
        id,
        organisationId,
        name: editName.trim(),
        slug,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to update category");
        return;
      }
      toast.success("Category updated");
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(cat: Category) {
    if (!confirm(`Delete "${cat.name}"? Documents in this category will become uncategorized.`)) return;
    startTransition(async () => {
      const result = await deleteDocumentCategory({
        id: cat.id,
        organisationId,
        slug,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to delete category");
        return;
      }
      toast.success("Category deleted");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <FolderOpen className="h-4 w-4 mr-1.5" />
        Categories
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Existing categories */}
          <div className="space-y-2">
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No categories yet.</p>
            ) : (
              categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2">
                  {editingId === cat.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1"
                        onKeyDown={(e) => e.key === "Enter" && handleUpdate(cat.id)}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(cat.id)}
                        disabled={isPending}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{cat.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(cat.id);
                          setEditName(cat.name);
                        }}
                        disabled={isPending}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(cat)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Add new category */}
          <div className="flex items-end gap-2 pt-2 border-t">
            <div className="flex-1 space-y-1">
              <Label htmlFor="new-cat-name" className="text-xs">New Category</Label>
              <Input
                id="new-cat-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Category name"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <Button onClick={handleCreate} disabled={isPending || !newName.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create admin documents page**

Create `src/app/[slug]/admin/documents/page.tsx`:

```tsx
import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { listDocuments } from "@/actions/documents/queries";
import { listDocumentCategories } from "@/actions/documents/categories";
import { Badge } from "@/components/ui/badge";
import { UploadDialog } from "./upload-dialog";
import { CategoryDialog } from "./category-dialog";
import { AdminDocumentsClient } from "./admin-documents-client";

export default async function AdminDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session || !isCommitteeOrAbove(session.role)) notFound();

  const categories = await listDocumentCategories(org.id);

  const filters = {
    categoryId: typeof sp.categoryId === "string" ? sp.categoryId : undefined,
    accessLevel: typeof sp.accessLevel === "string" ? sp.accessLevel : undefined,
    search: typeof sp.search === "string" ? sp.search : undefined,
  };

  const docs = await listDocuments(org.id, filters);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Document Library</h1>
          <Badge variant="outline">{docs.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <CategoryDialog
            organisationId={org.id}
            slug={slug}
            categories={categories}
          />
          <UploadDialog
            organisationId={org.id}
            slug={slug}
            categories={categories}
          />
        </div>
      </div>

      <AdminDocumentsClient
        documents={docs}
        categories={categories}
        organisationId={org.id}
        slug={slug}
      />
    </div>
  );
}
```

Note: This page references `AdminDocumentsClient` — a thin client wrapper that holds the edit dialog state and renders the filters + table. We create this in the next step.

- [ ] **Step 3: Create the client wrapper component**

Create `src/app/[slug]/admin/documents/admin-documents-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentsTable, type DocumentRow } from "./documents-table";
import { EditDialog } from "./edit-dialog";

type Category = { id: string; name: string; description: string | null; sortOrder: number };

export function AdminDocumentsClient({
  documents,
  categories,
  organisationId,
  slug,
}: {
  documents: DocumentRow[];
  categories: Category[];
  organisationId: string;
  slug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editDoc, setEditDoc] = useState<DocumentRow | null>(null);

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          placeholder="Search documents..."
          defaultValue={searchParams.get("search") ?? ""}
          onChange={(e) => {
            // Debounce search
            const val = e.target.value;
            const timeout = setTimeout(() => setFilter("search", val), 300);
            return () => clearTimeout(timeout);
          }}
          className="sm:max-w-xs"
        />
        <Select
          value={searchParams.get("categoryId") ?? ""}
          onValueChange={(v) => setFilter("categoryId", v)}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={searchParams.get("accessLevel") ?? ""}
          onValueChange={(v) => setFilter("accessLevel", v)}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="All access levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All access levels</SelectItem>
            <SelectItem value="PUBLIC">Public</SelectItem>
            <SelectItem value="MEMBER">Members</SelectItem>
            <SelectItem value="COMMITTEE">Committee</SelectItem>
            <SelectItem value="ADMIN">Admin Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DocumentsTable
        documents={documents}
        organisationId={organisationId}
        slug={slug}
        onEdit={setEditDoc}
      />

      <EditDialog
        document={editDoc}
        organisationId={organisationId}
        slug={slug}
        categories={categories}
        open={editDoc !== null}
        onOpenChange={(open) => !open && setEditDoc(null)}
      />
    </>
  );
}
```

- [ ] **Step 4: Run the build to check for type errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/\[slug\]/admin/documents/
git commit -m "feat(documents): add admin documents page with category management, upload, edit, and filters"
```

---

### Task 13: Member documents page

**Files:**
- Create: `src/app/[slug]/documents/page.tsx`
- Create: `src/app/[slug]/documents/document-list.tsx`
- Create: `src/app/[slug]/documents/download-button.tsx`

- [ ] **Step 1: Create download button component**

Create `src/app/[slug]/documents/download-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getDownloadUrl } from "@/actions/documents/download";
import { toast } from "sonner";
import { Download } from "lucide-react";

export function DownloadButton({
  documentId,
  organisationId,
  memberRole,
}: {
  documentId: string;
  organisationId: string;
  memberRole: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const result = await getDownloadUrl(documentId, organisationId, memberRole);
      if (!result.success) {
        toast.error(result.error ?? "Download failed");
        return;
      }
      window.open(result.url, "_blank");
    } catch {
      toast.error("Download failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDownload} disabled={loading}>
      <Download className="h-4 w-4" />
    </Button>
  );
}
```

- [ ] **Step 2: Create document list component**

Create `src/app/[slug]/documents/document-list.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DownloadButton } from "./download-button";
import { FileText, Sheet, Image, File, ChevronDown, ChevronRight } from "lucide-react";

type DocumentItem = {
  documents: {
    id: string;
    title: string;
    description: string | null;
    fileSizeBytes: number | null;
    mimeType: string | null;
    accessLevel: string;
    categoryId: string | null;
    createdAt: Date;
  };
  document_categories: { id: string; name: string } | null;
  members: { firstName: string; lastName: string } | null;
};

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (!mimeType) return <File className="h-4 w-4 text-muted-foreground" />;
  if (mimeType === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  if (mimeType.includes("word")) return <FileText className="h-4 w-4 text-blue-500" />;
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType === "text/csv")
    return <Sheet className="h-4 w-4 text-green-500" />;
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4 text-purple-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-AU");
}

function CategorySection({
  name,
  documents: docs,
  organisationId,
  memberRole,
}: {
  name: string;
  documents: DocumentItem[];
  organisationId: string;
  memberRole: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 font-medium text-sm w-full text-left hover:text-foreground transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        {name}
        <Badge variant="outline" className="ml-1">{docs.length}</Badge>
      </button>
      {!collapsed && (
        <div className="space-y-1 ml-6">
          {docs.map((doc) => (
            <div
              key={doc.documents.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileIcon mimeType={doc.documents.mimeType} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.documents.title}</p>
                  {doc.documents.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {doc.documents.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 ml-3 shrink-0">
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {formatFileSize(doc.documents.fileSizeBytes)}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {formatDate(doc.documents.createdAt)}
                </span>
                <DownloadButton
                  documentId={doc.documents.id}
                  organisationId={organisationId}
                  memberRole={memberRole}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DocumentList({
  documents: allDocs,
  organisationId,
  memberRole,
}: {
  documents: DocumentItem[];
  organisationId: string;
  memberRole: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? allDocs.filter((d) =>
        d.documents.title.toLowerCase().includes(search.toLowerCase())
      )
    : allDocs;

  // Group by category
  const grouped = new Map<string, { name: string; docs: DocumentItem[] }>();
  for (const doc of filtered) {
    const catId = doc.document_categories?.id ?? "__uncategorized";
    const catName = doc.document_categories?.name ?? "Uncategorized";
    if (!grouped.has(catId)) {
      grouped.set(catId, { name: catName, docs: [] });
    }
    grouped.get(catId)!.docs.push(doc);
  }

  // Sort: named categories first, uncategorized last
  const sections = Array.from(grouped.entries()).sort(([a], [b]) => {
    if (a === "__uncategorized") return 1;
    if (b === "__uncategorized") return -1;
    return 0;
  });

  return (
    <div className="space-y-6">
      <Input
        placeholder="Search documents..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No documents available.
        </p>
      ) : (
        sections.map(([catId, { name, docs }]) => (
          <CategorySection
            key={catId}
            name={name}
            documents={docs}
            organisationId={organisationId}
            memberRole={memberRole}
          />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create member documents page**

Create `src/app/[slug]/documents/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember } from "@/lib/auth";
import { listDocumentsForMember } from "@/actions/documents/queries";
import { DocumentList } from "./document-list";

export default async function MemberDocumentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session) redirect(`/${slug}/login`);

  const docs = await listDocumentsForMember(org.id, session.role);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-muted-foreground">
          Club documents and resources
        </p>
      </div>

      <DocumentList
        documents={docs}
        organisationId={org.id}
        memberRole={session.role}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the build to check for type errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/\[slug\]/documents/
git commit -m "feat(documents): add member-facing documents page with grouped list and download"
```

---

### Task 14: Run migration and full test suite

**Files:** None (verification only)

- [ ] **Step 1: Run the database migration**

Run: `npm run db:migrate`
Expected: Migration applies successfully, adding `document_categories` table and new columns to `documents`

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass, including the 6 new test files for documents

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: Production build completes without errors

- [ ] **Step 4: Commit any adjustments**

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix(documents): address issues found during integration verification"
```

---

### Task 15: Create Supabase Storage bucket

**Files:** None (manual setup)

- [ ] **Step 1: Create the private storage bucket in Supabase**

Go to the Supabase dashboard for the project → Storage → Create a new bucket:
- Name: `documents`
- Public: **OFF** (private bucket)
- File size limit: 10 MB
- Allowed MIME types: `application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, image/png, image/jpeg, text/csv`

Alternatively, create via Supabase SQL editor:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  10485760,
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg', 'text/csv']
);
```

No RLS policies needed — the app uses the service role key (admin client) for all storage operations, bypassing RLS.

- [ ] **Step 2: Verify bucket exists**

In Supabase dashboard → Storage, confirm the `documents` bucket appears and is configured as private.

---

### Task 16: E2E tests

**Files:**
- Create: `e2e/admin-documents.spec.ts`

- [ ] **Step 1: Create E2E test spec**

Create `e2e/admin-documents.spec.ts`. Tests should follow existing E2E patterns in the project (check `e2e/` directory for auth fixtures and conventions). Key flows to cover:

```typescript
import { test, expect } from "@playwright/test";

// Use existing auth fixtures for admin and member roles
// Adjust selectors based on actual rendered UI

test.describe("Admin Document Library", () => {
  test("admin can create a document category", async ({ page }) => {
    // Navigate to admin documents page
    // Click "Categories" button
    // Enter category name, click Add
    // Verify category appears in list
  });

  test("admin can upload a document", async ({ page }) => {
    // Navigate to admin documents page
    // Click "Upload Document"
    // Fill in title, select category, select access level, attach file
    // Submit and verify document appears in table
  });

  test("admin can edit document metadata", async ({ page }) => {
    // Find an existing document in the table
    // Click edit button
    // Change title and access level
    // Save and verify changes reflected
  });

  test("admin can delete a document", async ({ page }) => {
    // Find an existing document
    // Click delete, confirm dialog
    // Verify document removed from table
  });
});

test.describe("Member Document Library", () => {
  test("member can see documents matching their access level", async ({ page }) => {
    // Login as member
    // Navigate to /[slug]/documents
    // Verify MEMBER and PUBLIC documents visible
    // Verify COMMITTEE and ADMIN documents NOT visible
  });

  test("member can download a document", async ({ page }) => {
    // Find a document
    // Click download button
    // Verify new tab/window opens (signed URL)
  });

  test("documents are grouped by category", async ({ page }) => {
    // Navigate to member documents page
    // Verify category section headers appear
    // Verify documents are under correct categories
  });
});
```

Implement the full tests with actual selectors matching the components built in Tasks 10-13. Use `page.waitForSelector` and Playwright auto-retry assertions. Each test should clean up any data it creates.

- [ ] **Step 2: Run E2E tests locally**

Run: `npx playwright test e2e/admin-documents.spec.ts`
Expected: All 7 tests pass

- [ ] **Step 3: Commit**

```bash
git add e2e/admin-documents.spec.ts
git commit -m "test(documents): add E2E tests for admin and member document library"
```

---

### Task 17: Update README and CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Phase 17 to README**

Add a section documenting the Document Library feature: what it does, admin vs member pages, access levels, Supabase Storage for files.

- [ ] **Step 2: Update CLAUDE.md**

Add document-related routes/actions to the architecture section (documents actions, admin/documents page, member documents page, Supabase Storage bucket).

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: update README and CLAUDE.md for Phase 17 Document Library"
```
