"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { deleteDocument } from "@/actions/documents/delete";
import { toast } from "sonner";
import { FileText, Sheet, Image, File, Trash2, Pencil } from "lucide-react";

export type DocumentRow = {
  documents: {
    id: string;
    title: string;
    description: string | null;
    fileUrl: string;
    fileSizeBytes: number | null;
    mimeType: string | null;
    accessLevel: "PUBLIC" | "MEMBER" | "COMMITTEE" | "ADMIN";
    categoryId: string | null;
    createdAt: Date;
  };
  document_categories: { id: string; name: string } | null;
  members: { firstName: string; lastName: string } | null;
};

const ACCESS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PUBLIC: "outline",
  MEMBER: "secondary",
  COMMITTEE: "default",
  ADMIN: "destructive",
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
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-AU");
}

export function DocumentsTable({
  documents: docs,
  organisationId,
  slug,
  onEdit,
}: {
  documents: DocumentRow[];
  organisationId: string;
  slug: string;
  onEdit: (doc: DocumentRow) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete(doc: DocumentRow) {
    if (!confirm(`Delete "${doc.documents.title}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteDocument({
        documentId: doc.documents.id,
        organisationId,
        slug,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to delete");
      } else {
        toast.success("Document deleted");
        router.refresh();
      }
    });
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Uploaded By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No documents uploaded yet.
                </TableCell>
              </TableRow>
            ) : (
              docs.map((doc) => (
                <TableRow key={doc.documents.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileIcon mimeType={doc.documents.mimeType} />
                      <div>
                        <p className="font-medium">{doc.documents.title}</p>
                        {doc.documents.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {doc.documents.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{doc.document_categories?.name ?? "Uncategorized"}</TableCell>
                  <TableCell>
                    <Badge variant={ACCESS_VARIANT[doc.documents.accessLevel]}>
                      {doc.documents.accessLevel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {doc.members
                      ? `${doc.members.firstName} ${doc.members.lastName}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(doc.documents.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatFileSize(doc.documents.fileSizeBytes)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(doc)}
                        disabled={isPending}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(doc)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {docs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No documents uploaded yet.</p>
        ) : (
          docs.map((doc) => (
            <div key={doc.documents.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileIcon mimeType={doc.documents.mimeType} />
                  <p className="font-medium">{doc.documents.title}</p>
                </div>
                <Badge variant={ACCESS_VARIANT[doc.documents.accessLevel]}>
                  {doc.documents.accessLevel}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>{doc.document_categories?.name ?? "Uncategorized"} &middot; {formatFileSize(doc.documents.fileSizeBytes)}</p>
                <p>{formatDate(doc.documents.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(doc)} disabled={isPending}>
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(doc)} disabled={isPending}>
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
