import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { listCommunications } from "@/actions/communications/queries";
import { listTemplates } from "@/actions/communications/templates";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { CommunicationsTable } from "./communications-table";
import { TemplatesGrid } from "./templates-grid";
import { SmsSettingsForm } from "./sms-settings-form";

export default async function CommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; status?: string; page?: string }>;
}) {
  const { slug } = await params;
  const search = await searchParams;

  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session || !isCommitteeOrAbove(session.role)) notFound();

  const [commsResult, templatesResult] = await Promise.all([
    listCommunications(org.id, {
      status: search.status,
      page: search.page ? Number(search.page) : undefined,
    }),
    listTemplates({ organisationId: org.id }),
  ]);

  const activeTab = search.tab || "messages";

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Communications</h1>
        <Link href={`/${slug}/admin/communications/compose`}>
          <Button>Compose</Button>
        </Link>
      </div>

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          {session.role === "ADMIN" && (
            <TabsTrigger value="settings">Settings</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="messages">
          <CommunicationsTable
            communications={commsResult.communications}
            slug={slug}
          />
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesGrid
            templates={templatesResult.templates}
            organisationId={org.id}
            slug={slug}
            sessionMemberId={session.memberId}
          />
        </TabsContent>

        {session.role === "ADMIN" && (
          <TabsContent value="settings">
            <SmsSettingsForm
              organisationId={org.id}
              slug={slug}
              smsFromNumber={org.smsFromNumber}
              smsPreArrivalEnabled={org.smsPreArrivalEnabled}
              smsPreArrivalHours={org.smsPreArrivalHours}
              smsPaymentReminderEnabled={org.smsPaymentReminderEnabled}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
