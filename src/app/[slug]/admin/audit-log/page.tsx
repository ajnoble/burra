import { notFound } from "next/navigation";
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import {
  getAuditLogEntries,
  getDistinctActions,
} from "@/actions/audit-log/queries";
import { getMembers } from "@/lib/members";
import { formatChangeSummary, getEntityUrl } from "@/lib/audit-log";
import { Badge } from "@/components/ui/badge";
import { AuditLogFilters } from "./audit-log-filters";
import { AuditLogTable } from "./audit-log-table";
import { AuditLogExport } from "./audit-log-export";

const ENTITY_TYPES = [
  { value: "booking", label: "Booking" },
  { value: "member", label: "Member" },
  { value: "subscription", label: "Subscription" },
  { value: "charge", label: "Charge" },
  { value: "document", label: "Document" },
  { value: "documentCategory", label: "Document Category" },
  { value: "communication", label: "Communication" },
  { value: "waitlistEntry", label: "Waitlist" },
  { value: "organisation", label: "Organisation" },
];

export default async function AdminAuditLogPage({
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

  const basePath = `/${slug}/admin/audit-log`;

  const filters = {
    organisationId: org.id,
    action: typeof sp.action === "string" ? sp.action : undefined,
    entityType: typeof sp.entityType === "string" ? sp.entityType : undefined,
    actorMemberId:
      typeof sp.actorMemberId === "string" ? sp.actorMemberId : undefined,
    dateFrom: typeof sp.dateFrom === "string" ? sp.dateFrom : undefined,
    dateTo: typeof sp.dateTo === "string" ? sp.dateTo : undefined,
    page: typeof sp.page === "string" ? parseInt(sp.page, 10) : 1,
  };

  const [auditData, actions, membersData] = await Promise.all([
    getAuditLogEntries(filters),
    getDistinctActions(org.id),
    getMembers(org.id, { page: 1 }),
  ]);

  const actionOptions = actions.map((a) => ({ value: a, label: a }));
  const memberOptions = membersData.rows.map((m) => ({
    value: m.id,
    label: [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email,
  }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <Badge variant="secondary">{auditData.total}</Badge>
        </div>
        <AuditLogExport filters={filters} />
      </div>

      <AuditLogFilters
        basePath={basePath}
        actionOptions={actionOptions}
        entityTypeOptions={ENTITY_TYPES}
        memberOptions={memberOptions}
      />

      <AuditLogTable
        rows={auditData.rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          changeSummary: formatChangeSummary(
            row.action,
            row.previousValue as Record<string, unknown> | null,
            row.newValue as Record<string, unknown> | null
          ),
          entityUrl: getEntityUrl(slug, row.entityType, row.entityId),
        }))}
        total={auditData.total}
        page={auditData.page}
        pageSize={auditData.pageSize}
        basePath={basePath}
      />
    </div>
  );
}
