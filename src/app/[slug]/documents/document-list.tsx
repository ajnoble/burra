"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DownloadButton } from "./download-button";
import { FileText, Sheet, Image, File, ChevronDown, ChevronRight } from "lucide-react";

type DocumentItem = {
  documents: {
    id: string;
    title: string;
    description: string | null;
    fileSizeBytes: number | null;
    mimeType: string | null;
    accessLevel: string;
    categoryId: string | null;
    createdAt: Date;
  };
  document_categories: { id: string; name: string } | null;
  members: { firstName: string; lastName: string } | null;
};

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (!mimeType) return <File className="h-4 w-4 text-muted-foreground" />;
  if (mimeType === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  if (mimeType.includes("word")) return <FileText className="h-4 w-4 text-blue-500" />;
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType === "text/csv")
    return <Sheet className="h-4 w-4 text-green-500" />;
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4 text-purple-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-AU");
}

function CategorySection({
  name,
  documents: docs,
  organisationId,
  memberRole,
}: {
  name: string;
  documents: DocumentItem[];
  organisationId: string;
  memberRole: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 font-medium text-sm w-full text-left hover:text-foreground transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        {name}
        <Badge variant="outline" className="ml-1">{docs.length}</Badge>
      </button>
      {!collapsed && (
        <div className="space-y-1 ml-6">
          {docs.map((doc) => (
            <div
              key={doc.documents.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileIcon mimeType={doc.documents.mimeType} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.documents.title}</p>
                  {doc.documents.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {doc.documents.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 ml-3 shrink-0">
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {formatFileSize(doc.documents.fileSizeBytes)}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {formatDate(doc.documents.createdAt)}
                </span>
                <DownloadButton
                  documentId={doc.documents.id}
                  organisationId={organisationId}
                  memberRole={memberRole}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DocumentList({
  documents: allDocs,
  organisationId,
  memberRole,
}: {
  documents: DocumentItem[];
  organisationId: string;
  memberRole: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? allDocs.filter((d) =>
        d.documents.title.toLowerCase().includes(search.toLowerCase())
      )
    : allDocs;

  // Group by category
  const grouped = new Map<string, { name: string; docs: DocumentItem[] }>();
  for (const doc of filtered) {
    const catId = doc.document_categories?.id ?? "__uncategorized";
    const catName = doc.document_categories?.name ?? "Uncategorized";
    if (!grouped.has(catId)) {
      grouped.set(catId, { name: catName, docs: [] });
    }
    grouped.get(catId)!.docs.push(doc);
  }

  // Sort: named categories first, uncategorized last
  const sections = Array.from(grouped.entries()).sort(([a], [b]) => {
    if (a === "__uncategorized") return 1;
    if (b === "__uncategorized") return -1;
    return 0;
  });

  return (
    <div className="space-y-6">
      <Input
        placeholder="Search documents..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No documents available.
        </p>
      ) : (
        sections.map(([catId, { name, docs }]) => (
          <CategorySection
            key={catId}
            name={name}
            documents={docs}
            organisationId={organisationId}
            memberRole={memberRole}
          />
        ))
      )}
    </div>
  );
}
