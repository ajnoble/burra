import { test, expect } from "../fixtures/auth";

test.describe("Admin Document Library", () => {
  test("admin can navigate to documents page", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/documents");
    await expect(
      adminPage.getByRole("heading", { name: "Document Library" })
    ).toBeVisible();
  });

  test("admin can create a document category", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/documents");
    await adminPage.getByRole("button", { name: /categories/i }).click();
    await expect(
      adminPage.getByRole("heading", { name: /manage categories/i })
    ).toBeVisible();

    await adminPage.getByPlaceholder("Category name").fill("Meeting Minutes");
    await adminPage.getByRole("button", { name: /add/i }).click();

    await expect(adminPage.getByText("Category created")).toBeVisible();
    await expect(adminPage.getByText("Meeting Minutes")).toBeVisible();
  });

  test("admin can upload a document", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/documents");
    await adminPage.getByRole("button", { name: /upload document/i }).click();
    await expect(
      adminPage.getByRole("heading", { name: /upload document/i })
    ).toBeVisible();

    // Attach a test PDF file
    const fileInput = adminPage.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test-bylaws.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("fake pdf content"),
    });

    // Title should auto-fill from filename
    await expect(adminPage.locator("#doc-title")).toHaveValue("test-bylaws");

    await adminPage.getByRole("button", { name: /^upload$/i }).click();

    await expect(adminPage.getByText("Document uploaded")).toBeVisible();
  });

  test("admin can edit document metadata", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/documents");

    // Click edit on the first document
    const editButton = adminPage.locator("button").filter({ has: adminPage.locator('[class*="pencil"], [data-lucide="pencil"]') }).first();
    await editButton.click();

    await expect(
      adminPage.getByRole("heading", { name: /edit document/i })
    ).toBeVisible();

    await adminPage.locator("#edit-title").fill("Updated Title");
    await adminPage.getByRole("button", { name: /save changes/i }).click();

    await expect(adminPage.getByText("Document updated")).toBeVisible();
  });

  test("admin can delete a document", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/documents");

    // Count documents before
    const docCountBefore = await adminPage.locator("table tbody tr").count();

    // Click delete on the first document (confirm dialog)
    adminPage.on("dialog", (dialog) => dialog.accept());
    const deleteButton = adminPage.locator("button").filter({ has: adminPage.locator('[class*="trash"], [data-lucide="trash"]') }).first();
    await deleteButton.click();

    await expect(adminPage.getByText("Document deleted")).toBeVisible();

    // Verify one less document
    if (docCountBefore > 1) {
      await expect(adminPage.locator("table tbody tr")).toHaveCount(
        docCountBefore - 1
      );
    }
  });
});

test.describe("Member Document Library", () => {
  test("member can see documents page", async ({ memberPage }) => {
    await memberPage.goto("/polski/documents");
    await expect(
      memberPage.getByRole("heading", { name: "Documents" })
    ).toBeVisible();
    await expect(
      memberPage.getByText("Club documents and resources")
    ).toBeVisible();
  });

  test("member can search documents", async ({ memberPage }) => {
    await memberPage.goto("/polski/documents");
    const searchInput = memberPage.getByPlaceholder("Search documents...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("nonexistent-doc-xyz");
    await expect(
      memberPage.getByText("No documents available.")
    ).toBeVisible();
  });
});
