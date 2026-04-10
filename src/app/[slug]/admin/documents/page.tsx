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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl font-bold truncate">Document Library</h1>
          <Badge variant="outline">{docs.length}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
