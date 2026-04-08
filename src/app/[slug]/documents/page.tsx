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
