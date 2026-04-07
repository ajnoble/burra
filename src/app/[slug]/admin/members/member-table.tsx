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

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  membershipClassName: string | null;
  role: string;
  isFinancial: boolean;
  primaryMemberId: string | null;
  joinedAt: Date | null;
};

export function MemberTable({
  members,
  total,
  page,
  pageSize,
  slug,
}: {
  members: MemberRow[];
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
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Family</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No members found.
                </TableCell>
              </TableRow>
            ) : (
              members.map((member) => (
                <TableRow
                  key={member.id}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(`/${slug}/admin/members/${member.id}`)
                  }
                >
                  <TableCell className="font-medium">
                    {member.firstName} {member.lastName}
                  </TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>{member.membershipClassName ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{member.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.isFinancial ? "default" : "destructive"}>
                      {member.isFinancial ? "Financial" : "Unfinancial"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {member.primaryMemberId ? (
                      <Badge variant="outline">Family</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {member.joinedAt
                      ? new Date(member.joinedAt).toLocaleDateString("en-AU")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {members.map((member) => (
          <div
            key={member.id}
            className="rounded-lg border p-4 space-y-1 cursor-pointer active:bg-muted/50"
            onClick={() => router.push(`/${slug}/admin/members/${member.id}`)}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{member.firstName} {member.lastName}</span>
              <Badge variant={member.isFinancial ? "default" : "destructive"}>
                {member.isFinancial ? "Financial" : "Unfinancial"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{member.email}</p>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline">{member.role}</Badge>
              {member.membershipClassName && (
                <span className="text-muted-foreground">{member.membershipClassName}</span>
              )}
              {member.primaryMemberId && <Badge variant="outline">Family</Badge>}
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No members found.</p>
        )}
      </div>

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
