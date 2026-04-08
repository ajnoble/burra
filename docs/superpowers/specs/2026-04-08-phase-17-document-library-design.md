# Phase 17 — Document Library Design

## Overview

Add a document library allowing admins to upload and organize documents into categories with role-based access control. Members browse and download documents filtered by their role. Files stored in Supabase Storage (free tier: 1 GB storage, 2 GB bandwidth/month — sufficient for club documents).

## Data Model

### New Table: `document_categories`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, default random |
| `organisation_id` | uuid | FK to organisations |
| `name` | text | e.g. "Meeting Minutes", "Bylaws" |
| `description` | text | Optional |
| `sort_order` | integer | Default 0 |
| `created_at` | timestamptz | Default now |

### Schema Changes to `documents`

Add columns:

| Column | Type | Notes |
|---|---|---|
| `category_id` | uuid | FK to document_categories, nullable (uncategorized allowed) |
| `file_size_bytes` | integer | For display purposes |
| `mime_type` | text | For validation + file type icon display |

Existing columns remain unchanged: `id`, `organisation_id`, `title`, `description`, `file_url`, `access_level` (PUBLIC/MEMBER/COMMITTEE/ADMIN), `uploaded_by_member_id`, `created_at`.

## File Storage

- **Bucket**: Supabase Storage private bucket named `documents`
- **Path convention**: `{organisationId}/{uuid}-{originalFilename}`
- **Downloads**: Signed URLs with 60-minute expiry, generated server-side after access level check
- **Upload constraints**:
  - Max file size: 10 MB
  - Allowed MIME types: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `image/png`, `image/jpeg`, `text/csv`
- **Deletion**: When a document record is deleted, the corresponding file in Supabase Storage is also deleted

## Server Actions

### Category Actions (`src/actions/documents/categories.ts`)

- `listCategories(organisationId)` — returns all categories sorted by `sort_order`
- `createCategory(organisationId, { name, description })` — create new category
- `updateCategory(categoryId, { name, description, sortOrder })` — rename/reorder
- `deleteCategory(categoryId)` — delete category; documents in it become uncategorized (set `category_id` to null)

### Document Actions (`src/actions/documents/`)

- `listDocuments(organisationId, { categoryId?, accessLevel?, search? })` — filtered list with uploader name joined
- `listDocumentsForMember(organisationId, memberRole)` — returns documents where `accessLevel <= memberRole`, grouped by category
- `uploadDocument(organisationId, memberId, formData)` — validates file type/size, uploads to Supabase Storage, inserts DB record
- `updateDocument(documentId, { title, description, categoryId, accessLevel })` — update metadata
- `replaceFile(documentId, formData)` — upload new file, delete old from storage, update `file_url`, `file_size_bytes`, `mime_type`
- `deleteDocument(documentId)` — delete from DB and Supabase Storage
- `getDownloadUrl(documentId, memberRole)` — checks access level, returns signed URL or throws 403

### Access Level Hierarchy

```
ADMIN > COMMITTEE > MEMBER > PUBLIC
```

A member with role X can access documents where `accessLevel <= X`. Concretely:
- ADMIN: sees all documents
- COMMITTEE: sees PUBLIC, MEMBER, COMMITTEE
- MEMBER/BOOKING_OFFICER: sees PUBLIC, MEMBER
- Not logged in: sees PUBLIC only (if member page requires auth, PUBLIC effectively means all members)

## Admin Page

**Route**: `/[slug]/admin/documents`

**Layout**:
- Header: "Document Library" title + "Upload Document" button + "Manage Categories" button
- Filter bar: category dropdown, access level dropdown
- Documents table: title, category, access level badge, uploaded by, date, file size, actions (edit/replace/delete)
- Empty state when no documents

**Upload Dialog** (modal):
- File picker (drag & drop or click)
- Title (auto-filled from filename, editable)
- Description (optional textarea)
- Category (select from existing categories, or "Uncategorized")
- Access Level (select: PUBLIC/MEMBER/COMMITTEE/ADMIN, default MEMBER)
- Upload button with loading state

**Category Management Dialog** (modal):
- List existing categories with inline edit (name, description)
- Drag to reorder (or up/down arrows)
- Add new category
- Delete category (confirmation: "X documents will become uncategorized")

**Edit Document Dialog** (modal):
- Edit title, description, category, access level
- Separate "Replace File" action

## Member Page

**Route**: `/[slug]/documents`

**Layout**:
- Header: "Documents" title
- Search input (filters by title)
- Documents grouped by category (collapsible sections)
- "Uncategorized" section at bottom if any
- Each document row: file type icon, title, description (truncated), date, size, download button
- Click download button generates signed URL and triggers browser download
- Empty state: "No documents available"

**Access**: Requires authentication. Documents filtered server-side by member's role.

## Access Control Summary

| Action | Required Role |
|---|---|
| Upload document | COMMITTEE+ |
| Edit/replace/delete document | COMMITTEE+ |
| Manage categories | COMMITTEE+ |
| View/download documents | Any authenticated member (filtered by access level) |

## File Type Icons

Display icons based on MIME type:
- PDF: `FileText` (red tint)
- Word: `FileText` (blue tint)
- Excel: `Sheet` (green tint)
- Image: `Image`
- CSV: `FileSpreadsheet`
- Default: `File`

## Testing

### Action Tests (~8-10 test files)

- `categories.test.ts` — CRUD categories, sort order, delete with documents
- `upload.test.ts` — file validation (type, size), successful upload, DB record creation
- `list.test.ts` — list with filters, access level filtering for members
- `update.test.ts` — update metadata, replace file
- `delete.test.ts` — delete document and storage cleanup
- `download.test.ts` — signed URL generation, access level enforcement (403 for insufficient role)

### E2E Tests (`e2e/admin-documents.spec.ts`)

- Admin can upload a document with category and access level
- Admin can edit document metadata
- Admin can delete a document
- Admin can create and manage categories
- Member can see documents matching their role
- Member cannot see documents above their access level
- Member can download a document

## File Structure

```
src/
  db/schema/documents.ts          (modify — add categoryId, fileSizeBytes, mimeType)
  db/schema/document-categories.ts (new)
  db/schema/index.ts               (modify — export new table)
  actions/documents/
    categories.ts + categories.test.ts
    upload.ts + upload.test.ts
    queries.ts + queries.test.ts
    update.ts + update.test.ts
    delete.ts + delete.test.ts
    download.ts + download.test.ts
  app/[slug]/admin/documents/
    page.tsx
    upload-dialog.tsx
    category-dialog.tsx
    documents-table.tsx
    edit-dialog.tsx
  app/[slug]/documents/
    page.tsx
    document-list.tsx
    download-button.tsx
e2e/
  admin-documents.spec.ts
```
