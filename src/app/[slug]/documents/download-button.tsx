"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getDownloadUrl } from "@/actions/documents/download";
import { toast } from "sonner";
import { Download } from "lucide-react";

export function DownloadButton({
  documentId,
  organisationId,
  memberRole,
}: {
  documentId: string;
  organisationId: string;
  memberRole: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const result = await getDownloadUrl(documentId, organisationId, memberRole);
      if (!result.success) {
        toast.error(result.error ?? "Download failed");
        return;
      }
      window.open(result.url, "_blank");
    } catch {
      toast.error("Download failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDownload} disabled={loading}>
      <Download className="h-4 w-4" />
    </Button>
  );
}
