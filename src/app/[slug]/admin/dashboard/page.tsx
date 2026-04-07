import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { getTreasurerStats } from "@/actions/dashboard/treasurer-stats";
import { getBookingOfficerStats } from "@/actions/dashboard/booking-officer-stats";
import { getCommitteeStats } from "@/actions/dashboard/committee-stats";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { TreasurerTab } from "./treasurer-tab";
import { BookingOfficerTab } from "./booking-officer-tab";
import { CommitteeTab } from "./committee-tab";

function getFinancialYear(): { start: string; end: string } {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed: June = 5
  const year = now.getFullYear();
  // Financial year: July 1 to June 30
  // If current month >= June (index 5), FY started this year
  // If current month < June (index 5), FY started last year
  const fyStartYear = month >= 6 ? year : year - 1;
  return {
    start: `${fyStartYear}-07-01`,
    end: `${fyStartYear + 1}-06-30`,
  };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const org = await getOrgBySlug(slug);
  if (!org) redirect(`/${slug}`);

  const session = await getSessionMember(org.id);
  if (!session) redirect(`/${slug}/login`);

  const isCommittee = isCommitteeOrAbove(session.role);
  const today = format(new Date(), "yyyy-MM-dd");
  const fy = getFinancialYear();

  const [treasurerData, bookingOfficerData, committeeData] = await Promise.all([
    isCommittee
      ? getTreasurerStats({
          organisationId: org.id,
          financialYearStart: fy.start,
          financialYearEnd: fy.end,
        })
      : Promise.resolve(null),
    getBookingOfficerStats({
      organisationId: org.id,
      today,
    }),
    isCommittee
      ? getCommitteeStats({
          organisationId: org.id,
          financialYearStart: fy.start,
          financialYearEnd: fy.end,
        })
      : Promise.resolve(null),
  ]);

  const defaultTab = isCommittee ? "treasurer" : "bookings";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">{org.name}</p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {isCommittee && (
            <TabsTrigger value="treasurer">Treasurer</TabsTrigger>
          )}
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          {isCommittee && (
            <TabsTrigger value="committee">Committee</TabsTrigger>
          )}
        </TabsList>

        {isCommittee && treasurerData && (
          <TabsContent value="treasurer">
            <TreasurerTab data={treasurerData} />
          </TabsContent>
        )}

        <TabsContent value="bookings">
          <BookingOfficerTab data={bookingOfficerData} />
        </TabsContent>

        {isCommittee && committeeData && (
          <TabsContent value="committee">
            <CommitteeTab data={committeeData} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
