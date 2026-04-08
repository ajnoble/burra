"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentsTable, type DocumentRow } from "./documents-table";
import { EditDialog } from "./edit-dialog";

type Category = { id: string; name: string; description: string | null; sortOrder: number };

export function AdminDocumentsClient({
  documents,
  categories,
  organisationId,
  slug,
}: {
  documents: DocumentRow[];
  categories: Category[];
  organisationId: string;
  slug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editDoc, setEditDoc] = useState<DocumentRow | null>(null);

  function setFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          placeholder="Search documents..."
          defaultValue={searchParams.get("search") ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            const timeout = setTimeout(() => setFilter("search", val), 300);
            return () => clearTimeout(timeout);
          }}
          className="sm:max-w-xs"
        />
        <Select
          value={searchParams.get("categoryId") ?? ""}
          onValueChange={(v: string | null) => setFilter("categoryId", v)}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={searchParams.get("accessLevel") ?? ""}
          onValueChange={(v: string | null) => setFilter("accessLevel", v)}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="All access levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All access levels</SelectItem>
            <SelectItem value="PUBLIC">Public</SelectItem>
            <SelectItem value="MEMBER">Members</SelectItem>
            <SelectItem value="COMMITTEE">Committee</SelectItem>
            <SelectItem value="ADMIN">Admin Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DocumentsTable
        documents={documents}
        organisationId={organisationId}
        slug={slug}
        onEdit={setEditDoc}
      />

      <EditDialog
        document={editDoc}
        organisationId={organisationId}
        slug={slug}
        categories={categories}
        open={editDoc !== null}
        onOpenChange={(open) => !open && setEditDoc(null)}
      />
    </>
  );
}
