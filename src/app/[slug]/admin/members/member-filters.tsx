"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type MembershipClass = { id: string; name: string };

export function MemberFilters({
  membershipClasses,
}: {
  membershipClasses: MembershipClass[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page"); // reset to page 1 on filter change
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearFilters() {
    router.push(pathname);
  }

  const hasFilters = searchParams.toString().length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <Input
        placeholder="Search name or email..."
        defaultValue={searchParams.get("search") ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          if (value.length === 0 || value.length >= 2) {
            updateParam("search", value);
          }
        }}
        className="w-64"
      />

      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        value={searchParams.get("classId") ?? ""}
        onChange={(e) => updateParam("classId", e.target.value)}
      >
        <option value="">All Classes</option>
        {membershipClasses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        value={searchParams.get("role") ?? ""}
        onChange={(e) => updateParam("role", e.target.value)}
      >
        <option value="">All Roles</option>
        <option value="MEMBER">Member</option>
        <option value="BOOKING_OFFICER">Booking Officer</option>
        <option value="COMMITTEE">Committee</option>
        <option value="ADMIN">Admin</option>
      </select>

      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        value={searchParams.get("financial") ?? ""}
        onChange={(e) => updateParam("financial", e.target.value)}
      >
        <option value="">All Status</option>
        <option value="true">Financial</option>
        <option value="false">Unfinancial</option>
      </select>

      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        value={searchParams.get("family") ?? ""}
        onChange={(e) => updateParam("family", e.target.value)}
      >
        <option value="">All Members</option>
        <option value="true">Has Family</option>
        <option value="false">No Family</option>
      </select>

      <Input
        type="date"
        placeholder="Joined from"
        defaultValue={searchParams.get("joinedFrom") ?? ""}
        onChange={(e) => updateParam("joinedFrom", e.target.value)}
        className="w-40"
      />

      <Input
        type="date"
        placeholder="Joined to"
        defaultValue={searchParams.get("joinedTo") ?? ""}
        onChange={(e) => updateParam("joinedTo", e.target.value)}
        className="w-40"
      />

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
