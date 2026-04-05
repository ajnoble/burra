"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { executeImport, type ExecuteImportResult } from "@/actions/members/import";
import type { ValidationResult } from "@/lib/import/validate-import";

export function ConfirmStep({
  csvText,
  validation,
  onBack,
  onComplete,
}: {
  csvText: string;
  validation: ValidationResult;
  onBack: () => void;
  onComplete: (result: ExecuteImportResult) => void;
}) {
  const params = useParams();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleImport() {
    setImporting(true);
    // Simulate progress while import runs
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 5, 90));
    }, 200);

    try {
      // TODO: resolve organisationId and current memberId from session
      const result = await executeImport(
        params.slug as string,
        csvText,
        "placeholder-member-id"
      );
      setProgress(100);
      clearInterval(interval);
      onComplete(result);
    } catch (err) {
      clearInterval(interval);
      setImporting(false);
      alert(
        err instanceof Error ? err.message : "Import failed. Please try again."
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm Import</CardTitle>
        <CardDescription>
          Review the import summary and confirm.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!importing ? (
          <>
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Members to import:
                </span>
                <span className="font-medium">{validation.validCount}</span>
              </div>
              {validation.errorCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Rows skipped (errors):
                  </span>
                  <span className="font-medium text-destructive">
                    {validation.errorCount}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={onBack}>
                Back
              </Button>
              <Button onClick={handleImport}>
                Import {validation.validCount} Members
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Importing members... please wait.
            </p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {progress}%
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
