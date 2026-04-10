import { notFound, redirect } from "next/navigation";
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember } from "@/lib/auth";
import { getMyAssociates } from "@/actions/associates";
import { AssociateList } from "./associate-list";

export default async function AssociatesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session) redirect(`/${slug}/login`);

  const associates = await getMyAssociates(org.id, session.memberId);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Associates</h1>
        <p className="text-muted-foreground">
          Manage people you bring as guests
        </p>
      </div>

      <AssociateList
        associates={associates}
        organisationId={org.id}
        slug={slug}
      />
    </div>
  );
}
