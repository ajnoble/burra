"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
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
import { formatCurrency } from "@/lib/currency";

type AdminBookingListItem = {
  id: string;
  bookingReference: string;
  memberFirstName: string;
  memberLastName: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  totalAmountCents: number;
  status: string;
  guestCount: number;
  createdAt: Date;
  balancePaidAt: Date | null;
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "CONFIRMED":
      return <Badge variant="default">{status}</Badge>;
    case "CANCELLED":
      return <Badge variant="destructive">{status}</Badge>;
    case "COMPLETED":
      return <Badge variant="secondary">{status}</Badge>;
    case "PENDING":
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function BookingTable({
  bookings,
  total,
  page,
  pageSize,
  slug,
}: {
  bookings: AdminBookingListItem[];
  total: number;
  page: number;
  pageSize: number;
  slug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(total / pageSize);

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Member</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Lodge</TableHead>
            <TableHead>Guests</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center text-muted-foreground py-8"
              >
                No bookings found.
              </TableCell>
            </TableRow>
          ) : (
            bookings.map((booking) => (
              <TableRow
                key={booking.id}
                className="cursor-pointer"
                onClick={() =>
                  router.push(`/${slug}/admin/bookings/${booking.id}`)
                }
              >
                <TableCell className="font-medium font-mono text-sm">
                  {booking.bookingReference}
                </TableCell>
                <TableCell>
                  {booking.memberFirstName} {booking.memberLastName}
                </TableCell>
                <TableCell>
                  <span className="text-sm">
                    {new Date(booking.checkInDate).toLocaleDateString("en-AU")}
                    {" — "}
                    {new Date(booking.checkOutDate).toLocaleDateString("en-AU")}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">
                    ({booking.totalNights}n)
                  </span>
                </TableCell>
                <TableCell>{booking.lodgeName}</TableCell>
                <TableCell>{booking.guestCount}</TableCell>
                <TableCell>{formatCurrency(booking.totalAmountCents)}</TableCell>
                <TableCell>
                  <StatusBadge status={booking.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              Previous
            </Button>
            <span className="flex items-center text-sm px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
