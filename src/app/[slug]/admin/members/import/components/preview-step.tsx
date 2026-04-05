"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { validateCsvImport } from "@/actions/members/import";
import type { ValidationResult } from "@/lib/import/validate-import";

export function PreviewStep({
  csvText,
  validation,
  onValidated,
  onBack,
  onContinue,
}: {
  csvText: string;
  validation: ValidationResult | null;
  onValidated: (v: ValidationResult) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const params = useParams();
  const [loading, setLoading] = useState(!validation);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  useEffect(() => {
    if (validation) return;

    async function validate() {
      setLoading(true);
      // TODO: resolve organisationId from slug
      // For now, pass slug as org ID placeholder
      const result = await validateCsvImport(
        params.slug as string,
        csvText
      );
      if (result.success && result.validation) {
        onValidated(result.validation);
      } else if (result.parseErrors) {
        setParseErrors(result.parseErrors);
      }
      setLoading(false);
    }
    validate();
  }, [csvText, validation, onValidated, params.slug]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Validating CSV data...</p>
        </CardContent>
      </Card>
    );
  }

  if (parseErrors.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>CSV Parse Errors</CardTitle>
          <CardDescription>
            The CSV file could not be parsed. Please fix the issues and try
            again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-destructive">
            {parseErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
          <Button variant="outline" className="mt-4" onClick={onBack}>
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!validation) return null;

  const previewRows = validation.rows.slice(0, 10);

  function downloadErrorCsv() {
    if (!validation) return;
    const errorRows = validation.rows.filter((r) => !r.isValid);
    const lines = ["row,errors,first_name,last_name,email,membership_class"];
    for (const r of errorRows) {
      lines.push(
        `${r.row},"${r.errors.join("; ")}",${r.data.first_name},${r.data.last_name},${r.data.email},${r.data.membership_class}`
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview & Validate</CardTitle>
        <CardDescription>
          Showing first {Math.min(10, validation.totalCount)} of{" "}
          {validation.totalCount} rows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="flex gap-4">
          <Badge variant="outline" className="text-sm">
            {validation.totalCount} total rows
          </Badge>
          <Badge
            variant="outline"
            className="text-sm text-green-700 border-green-300"
          >
            {validation.validCount} valid
          </Badge>
          {validation.errorCount > 0 && (
            <Badge
              variant="outline"
              className="text-sm text-destructive border-destructive/30"
            >
              {validation.errorCount} with errors
            </Badge>
          )}
        </div>

        {/* Preview table */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Row</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>First Name</TableHead>
                <TableHead>Last Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map((row) => (
                <TableRow
                  key={row.row}
                  className={row.isValid ? "" : "bg-destructive/5"}
                >
                  <TableCell className="font-mono text-xs">
                    {row.row}
                  </TableCell>
                  <TableCell>
                    {row.isValid ? (
                      <Badge
                        variant="outline"
                        className="text-green-700 border-green-300"
                      >
                        OK
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Error</Badge>
                    )}
                  </TableCell>
                  <TableCell>{row.data.first_name}</TableCell>
                  <TableCell>{row.data.last_name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.data.email}
                  </TableCell>
                  <TableCell>{row.data.membership_class}</TableCell>
                  <TableCell className="text-xs text-destructive max-w-xs">
                    {row.errors.join("; ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>
              Back
            </Button>
            {validation.errorCount > 0 && (
              <Button variant="outline" onClick={downloadErrorCsv}>
                Download Error Report
              </Button>
            )}
          </div>
          <Button
            onClick={onContinue}
            disabled={validation.validCount === 0}
          >
            Continue with {validation.validCount} valid rows
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
