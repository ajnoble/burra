import { getOrgBySlug } from "@/lib/org";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTransactionLedger, formatLedgerForXero } from "@/actions/reports/transaction-ledger";
import { getRevenueSummary } from "@/actions/reports/revenue-summary";
import { getMemberBalances } from "@/actions/reports/member-balances";
import { getSubscriptionStatus } from "@/actions/reports/subscription-status";
import { getOccupancyReport } from "@/actions/reports/occupancy";
import { getArrivalsAndDepartures } from "@/actions/reports/arrivals-departures";
import { getBookingSummary } from "@/actions/reports/booking-summary";
import { XERO_COLUMN_MAP } from "@/actions/reports/export-csv";
import { formatCurrency } from "@/lib/currency";
import { formatOrgDate } from "@/lib/dates";
import { db } from "@/db/index";
import { lodges, seasons } from "@/db/schema";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import { ExportButton } from "./export-button";
import { ReportFilters } from "./report-filters";
import { ReportTable } from "./report-table";

const REPORT_TITLES: Record<string, string> = {
  "transaction-ledger": "Transaction Ledger",
  "revenue-summary": "Revenue Summary",
  "member-balances": "Member Balances",
  "subscription-status": "Subscription Status",
  "occupancy": "Occupancy Report",
  "arrivals-departures": "Arrivals & Departures",
  "booking-summary": "Booking Summary",
};

const ALLOWED_REPORT_IDS = Object.keys(REPORT_TITLES);

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; reportId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug, reportId } = await params;
  const sp = await searchParams;

  if (!ALLOWED_REPORT_IDS.includes(reportId)) {
    notFound();
  }

  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session || !isCommitteeOrAbove(session.role)) {
    redirect(`/${slug}/login`);
  }

  // Fetch lodge and season options for filter dropdowns
  const orgLodges = await db
    .select({ id: lodges.id, name: lodges.name })
    .from(lodges)
    .where(eq(lodges.organisationId, org.id));

  const orgSeasons = await db
    .select({ id: seasons.id, name: seasons.name })
    .from(seasons)
    .where(eq(seasons.organisationId, org.id))
    .orderBy(seasons.startDate);

  const today = format(new Date(), "yyyy-MM-dd");

  function sp_str(key: string): string | undefined {
    const v = sp[key];
    return typeof v === "string" ? v : undefined;
  }

  const basePath = `/${slug}/admin/reports/${reportId}`;

  type FilterField = {
    key: string;
    label: string;
    type: "date" | "select" | "text";
    options?: { value: string; label: string }[];
  };
  type Column = { key: string; header: string; align?: "left" | "right" };

  let filterFields: FilterField[] = [];
  let columns: Column[] = [];
  let displayRows: Record<string, string | number>[] = [];
  let exportData: Record<string, string>[] = [];
  let exportColumns: { key: string; header: string }[] = [];
  let exportFilename = `${reportId}-${today}.csv`;

  if (reportId === "transaction-ledger") {
    filterFields = [
      { key: "dateFrom", label: "From", type: "date" },
      { key: "dateTo", label: "To", type: "date" },
      {
        key: "type",
        label: "Type",
        type: "select",
        options: [
          { value: "PAYMENT", label: "Payment" },
          { value: "REFUND", label: "Refund" },
          { value: "CREDIT", label: "Credit" },
          { value: "SUBSCRIPTION", label: "Subscription" },
          { value: "INVOICE", label: "Invoice" },
          { value: "ADJUSTMENT", label: "Adjustment" },
        ],
      },
    ];
    columns = [
      { key: "date", header: "Date" },
      { key: "member", header: "Member" },
      { key: "type", header: "Type" },
      { key: "description", header: "Description" },
      { key: "amount", header: "Amount", align: "right" },
      { key: "stripeRef", header: "Stripe Ref" },
    ];

    const result = await getTransactionLedger({
      organisationId: org.id,
      dateFrom: sp_str("dateFrom"),
      dateTo: sp_str("dateTo"),
      type: sp_str("type"),
    });

    displayRows = result.rows.map((row) => ({
      date: formatOrgDate(row.date),
      member: `${row.memberFirstName} ${row.memberLastName}`,
      type: row.type,
      description: row.description,
      amount: formatCurrency(row.amountCents),
      stripeRef: row.stripeRef ?? "",
    }));

    const xeroRows = formatLedgerForXero(result.rows);
    exportColumns = XERO_COLUMN_MAP;
    exportData = xeroRows.map((r) => ({
      date: r.date,
      amount: r.amount,
      payee: r.payee,
      description: r.description,
      reference: r.reference,
    }));
    exportFilename = `xero-transactions-${today}.csv`;
  } else if (reportId === "revenue-summary") {
    filterFields = [
      { key: "dateFrom", label: "From", type: "date" },
      { key: "dateTo", label: "To", type: "date" },
      {
        key: "granularity",
        label: "Granularity",
        type: "select",
        options: [
          { value: "monthly", label: "Monthly" },
          { value: "quarterly", label: "Quarterly" },
          { value: "annual", label: "Annual" },
        ],
      },
    ];
    columns = [
      { key: "period", header: "Period" },
      { key: "bookingRevenue", header: "Booking Revenue", align: "right" },
      { key: "subscriptionRevenue", header: "Subscription Revenue", align: "right" },
      { key: "refunds", header: "Refunds", align: "right" },
      { key: "netRevenue", header: "Net Revenue", align: "right" },
      { key: "platformFees", header: "Platform Fees", align: "right" },
    ];

    const granularity =
      sp_str("granularity") === "quarterly" || sp_str("granularity") === "annual"
        ? (sp_str("granularity") as "quarterly" | "annual")
        : "monthly";

    const result = await getRevenueSummary({
      organisationId: org.id,
      dateFrom: sp_str("dateFrom") ?? "2020-01-01",
      dateTo: sp_str("dateTo") ?? today,
      granularity,
    });

    displayRows = result.rows.map((row) => ({
      period: row.period,
      bookingRevenue: formatCurrency(row.bookingRevenueCents),
      subscriptionRevenue: formatCurrency(row.subscriptionRevenueCents),
      refunds: formatCurrency(row.refundsCents),
      netRevenue: formatCurrency(row.netRevenueCents),
      platformFees: formatCurrency(row.platformFeesCents),
    }));

    exportColumns = [
      { key: "period", header: "Period" },
      { key: "bookingRevenue", header: "Booking Revenue" },
      { key: "subscriptionRevenue", header: "Subscription Revenue" },
      { key: "refunds", header: "Refunds" },
      { key: "netRevenue", header: "Net Revenue" },
      { key: "platformFees", header: "Platform Fees" },
    ];
    exportData = result.rows.map((row) => ({
      period: row.period,
      bookingRevenue: (row.bookingRevenueCents / 100).toFixed(2),
      subscriptionRevenue: (row.subscriptionRevenueCents / 100).toFixed(2),
      refunds: (row.refundsCents / 100).toFixed(2),
      netRevenue: (row.netRevenueCents / 100).toFixed(2),
      platformFees: (row.platformFeesCents / 100).toFixed(2),
    }));
    exportFilename = `revenue-summary-${today}.csv`;
  } else if (reportId === "member-balances") {
    filterFields = [
      {
        key: "isFinancial",
        label: "Financial",
        type: "select",
        options: [
          { value: "true", label: "Financial" },
          { value: "false", label: "Non-financial" },
        ],
      },
      {
        key: "hasOutstandingBalance",
        label: "Outstanding Balance",
        type: "select",
        options: [{ value: "true", label: "Has outstanding balance" }],
      },
    ];
    columns = [
      { key: "member", header: "Member" },
      { key: "class", header: "Class" },
      { key: "financial", header: "Financial" },
      { key: "totalPaid", header: "Total Paid", align: "right" },
      { key: "totalRefunded", header: "Total Refunded", align: "right" },
      { key: "outstanding", header: "Outstanding", align: "right" },
    ];

    const isFinancialRaw = sp_str("isFinancial");
    const hasOutstandingRaw = sp_str("hasOutstandingBalance");

    const result = await getMemberBalances({
      organisationId: org.id,
      isFinancial:
        isFinancialRaw === "true" ? true : isFinancialRaw === "false" ? false : undefined,
      hasOutstandingBalance: hasOutstandingRaw === "true" ? true : undefined,
    });

    displayRows = result.rows.map((row) => ({
      member: `${row.firstName} ${row.lastName}`,
      class: row.membershipClassName ?? "",
      financial: row.isFinancial ? "Yes" : "No",
      totalPaid: formatCurrency(row.totalPaidCents),
      totalRefunded: formatCurrency(row.totalRefundedCents),
      outstanding: formatCurrency(row.outstandingBalanceCents),
    }));

    exportColumns = [
      { key: "member", header: "Member" },
      { key: "class", header: "Class" },
      { key: "financial", header: "Financial" },
      { key: "totalPaid", header: "Total Paid" },
      { key: "totalRefunded", header: "Total Refunded" },
      { key: "outstanding", header: "Outstanding" },
    ];
    exportData = result.rows.map((row) => ({
      member: `${row.firstName} ${row.lastName}`,
      class: row.membershipClassName ?? "",
      financial: row.isFinancial ? "Yes" : "No",
      totalPaid: (row.totalPaidCents / 100).toFixed(2),
      totalRefunded: (row.totalRefundedCents / 100).toFixed(2),
      outstanding: (row.outstandingBalanceCents / 100).toFixed(2),
    }));
    exportFilename = `member-balances-${today}.csv`;
  } else if (reportId === "subscription-status") {
    filterFields = [
      {
        key: "seasonId",
        label: "Season",
        type: "select",
        options: orgSeasons.map((s) => ({ value: s.id, label: s.name })),
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "PAID", label: "Paid" },
          { value: "UNPAID", label: "Unpaid" },
          { value: "WAIVED", label: "Waived" },
        ],
      },
    ];
    columns = [
      { key: "member", header: "Member" },
      { key: "class", header: "Class" },
      { key: "season", header: "Season" },
      { key: "amount", header: "Amount", align: "right" },
      { key: "dueDate", header: "Due Date" },
      { key: "status", header: "Status" },
      { key: "paidDate", header: "Paid Date" },
    ];

    const statusRaw = sp_str("status");
    const validStatus =
      statusRaw === "PAID" || statusRaw === "UNPAID" || statusRaw === "WAIVED"
        ? statusRaw
        : undefined;

    const result = await getSubscriptionStatus({
      organisationId: org.id,
      seasonId: sp_str("seasonId"),
      status: validStatus,
    });

    displayRows = result.rows.map((row) => ({
      member: `${row.memberFirstName} ${row.memberLastName}`,
      class: row.membershipClassName ?? "",
      season: row.seasonName,
      amount: formatCurrency(row.amountCents),
      dueDate: row.dueDate,
      status: row.status,
      paidDate: row.paidAt ? formatOrgDate(row.paidAt) : "",
    }));

    exportColumns = [
      { key: "member", header: "Member" },
      { key: "class", header: "Class" },
      { key: "season", header: "Season" },
      { key: "amount", header: "Amount" },
      { key: "dueDate", header: "Due Date" },
      { key: "status", header: "Status" },
      { key: "paidDate", header: "Paid Date" },
    ];
    exportData = result.rows.map((row) => ({
      member: `${row.memberFirstName} ${row.memberLastName}`,
      class: row.membershipClassName ?? "",
      season: row.seasonName,
      amount: (row.amountCents / 100).toFixed(2),
      dueDate: row.dueDate,
      status: row.status,
      paidDate: row.paidAt ? formatOrgDate(row.paidAt) : "",
    }));
    exportFilename = `subscription-status-${today}.csv`;
  } else if (reportId === "occupancy") {
    filterFields = [
      { key: "dateFrom", label: "From", type: "date" },
      { key: "dateTo", label: "To", type: "date" },
      {
        key: "lodgeId",
        label: "Lodge",
        type: "select",
        options: orgLodges.map((l) => ({ value: l.id, label: l.name })),
      },
    ];
    columns = [
      { key: "date", header: "Date" },
      { key: "lodge", header: "Lodge" },
      { key: "totalBeds", header: "Total Beds", align: "right" },
      { key: "booked", header: "Booked", align: "right" },
      { key: "available", header: "Available", align: "right" },
      { key: "occupancyPercent", header: "Occupancy %", align: "right" },
    ];

    const thirtyDaysLater = format(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      "yyyy-MM-dd"
    );

    const result = await getOccupancyReport({
      organisationId: org.id,
      dateFrom: sp_str("dateFrom") ?? today,
      dateTo: sp_str("dateTo") ?? thirtyDaysLater,
      lodgeId: sp_str("lodgeId"),
    });

    displayRows = result.rows.map((row) => ({
      date: row.date,
      lodge: row.lodgeName,
      totalBeds: row.totalBeds,
      booked: row.bookedBeds,
      available: row.availableBeds,
      occupancyPercent: `${row.occupancyPercent}%`,
    }));

    exportColumns = [
      { key: "date", header: "Date" },
      { key: "lodge", header: "Lodge" },
      { key: "totalBeds", header: "Total Beds" },
      { key: "booked", header: "Booked" },
      { key: "available", header: "Available" },
      { key: "occupancyPercent", header: "Occupancy %" },
    ];
    exportData = result.rows.map((row) => ({
      date: row.date,
      lodge: row.lodgeName,
      totalBeds: String(row.totalBeds),
      booked: String(row.bookedBeds),
      available: String(row.availableBeds),
      occupancyPercent: String(row.occupancyPercent),
    }));
    exportFilename = `occupancy-${today}.csv`;
  } else if (reportId === "arrivals-departures") {
    filterFields = [
      { key: "dateFrom", label: "From", type: "date" },
      { key: "dateTo", label: "To", type: "date" },
      {
        key: "lodgeId",
        label: "Lodge",
        type: "select",
        options: orgLodges.map((l) => ({ value: l.id, label: l.name })),
      },
    ];
    columns = [
      { key: "date", header: "Date" },
      { key: "type", header: "Type" },
      { key: "reference", header: "Reference" },
      { key: "member", header: "Member" },
      { key: "lodge", header: "Lodge" },
      { key: "checkIn", header: "Check-in" },
      { key: "checkOut", header: "Check-out" },
      { key: "payment", header: "Payment" },
    ];

    const result = await getArrivalsAndDepartures({
      organisationId: org.id,
      dateFrom: sp_str("dateFrom") ?? today,
      dateTo: sp_str("dateTo") ?? today,
      lodgeId: sp_str("lodgeId"),
    });

    displayRows = result.rows.map((row) => ({
      date: row.date,
      type: row.type === "arrival" ? "Arrival" : "Departure",
      reference: row.bookingReference,
      member: `${row.memberFirstName} ${row.memberLastName}`,
      lodge: row.lodgeName,
      checkIn: row.checkInDate,
      checkOut: row.checkOutDate,
      payment: row.paymentStatus === "paid" ? "Paid" : "Unpaid",
    }));

    exportColumns = [
      { key: "date", header: "Date" },
      { key: "type", header: "Type" },
      { key: "reference", header: "Reference" },
      { key: "member", header: "Member" },
      { key: "lodge", header: "Lodge" },
      { key: "checkIn", header: "Check-in" },
      { key: "checkOut", header: "Check-out" },
      { key: "payment", header: "Payment" },
    ];
    exportData = result.rows.map((row) => ({
      date: row.date,
      type: row.type === "arrival" ? "Arrival" : "Departure",
      reference: row.bookingReference,
      member: `${row.memberFirstName} ${row.memberLastName}`,
      lodge: row.lodgeName,
      checkIn: row.checkInDate,
      checkOut: row.checkOutDate,
      payment: row.paymentStatus === "paid" ? "Paid" : "Unpaid",
    }));
    exportFilename = `arrivals-departures-${today}.csv`;
  } else if (reportId === "booking-summary") {
    filterFields = [
      { key: "dateFrom", label: "From", type: "date" },
      { key: "dateTo", label: "To", type: "date" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "PENDING", label: "Pending" },
          { value: "CONFIRMED", label: "Confirmed" },
          { value: "CANCELLED", label: "Cancelled" },
          { value: "COMPLETED", label: "Completed" },
        ],
      },
      {
        key: "lodgeId",
        label: "Lodge",
        type: "select",
        options: orgLodges.map((l) => ({ value: l.id, label: l.name })),
      },
    ];
    columns = [
      { key: "reference", header: "Reference" },
      { key: "member", header: "Member" },
      { key: "lodge", header: "Lodge" },
      { key: "dates", header: "Dates" },
      { key: "nights", header: "Nights", align: "right" },
      { key: "guests", header: "Guests", align: "right" },
      { key: "amount", header: "Amount", align: "right" },
      { key: "status", header: "Status" },
    ];

    const result = await getBookingSummary({
      organisationId: org.id,
      dateFrom: sp_str("dateFrom"),
      dateTo: sp_str("dateTo"),
      status: sp_str("status"),
      lodgeId: sp_str("lodgeId"),
    });

    displayRows = result.rows.map((row) => ({
      reference: row.bookingReference,
      member: `${row.memberFirstName} ${row.memberLastName}`,
      lodge: row.lodgeName,
      dates: `${row.checkInDate} – ${row.checkOutDate}`,
      nights: row.totalNights,
      guests: row.guestCount,
      amount: formatCurrency(row.totalAmountCents),
      status: row.status,
    }));

    exportColumns = [
      { key: "reference", header: "Reference" },
      { key: "member", header: "Member" },
      { key: "lodge", header: "Lodge" },
      { key: "checkIn", header: "Check-in" },
      { key: "checkOut", header: "Check-out" },
      { key: "nights", header: "Nights" },
      { key: "guests", header: "Guests" },
      { key: "amount", header: "Amount" },
      { key: "status", header: "Status" },
    ];
    exportData = result.rows.map((row) => ({
      reference: row.bookingReference,
      member: `${row.memberFirstName} ${row.memberLastName}`,
      lodge: row.lodgeName,
      checkIn: row.checkInDate,
      checkOut: row.checkOutDate,
      nights: String(row.totalNights),
      guests: String(row.guestCount),
      amount: (row.totalAmountCents / 100).toFixed(2),
      status: row.status,
    }));
    exportFilename = `booking-summary-${today}.csv`;
  }

  const title = REPORT_TITLES[reportId];

  return (
    <div className="p-6">
      <nav className="text-sm text-muted-foreground mb-4">
        <Link href={`/${slug}/admin/reports`} className="hover:underline">
          Reports
        </Link>
        {" /"}
      </nav>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{title}</h1>
        {exportData.length > 0 && (
          <ExportButton
            data={exportData}
            columns={exportColumns}
            filename={exportFilename}
          />
        )}
      </div>
      <ReportFilters fields={filterFields} basePath={basePath} />
      <ReportTable columns={columns} rows={displayRows} />
    </div>
  );
}
