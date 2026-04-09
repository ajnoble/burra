"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ExecuteImportResult } from "@/actions/members/import";

export function ResultStep({ result }: { result: ExecuteImportResult }) {
  const params = useParams();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Complete</CardTitle>
        <CardDescription>
          Here&apos;s a summary of the import results.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Members imported:</span>
            <Badge
              variant="outline"
              className="text-green-700 border-green-300"
            >
              {result.imported}
            </Badge>
          </div>
          {(result.errors ?? 0) > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Rows with errors:</span>
              <Badge variant="destructive">{result.errors}</Badge>
            </div>
          )}
        </div>

        {(result.errorDetails?.length ?? 0) > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Error Details</h3>
            <div className="rounded-md border max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2">Row</th>
                    <th className="text-left p-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errorDetails?.map((e, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-2 font-mono">{e.row}</td>
                      <td className="p-2 text-destructive">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            render={
              <Link href={`/${params.slug}/admin/members`} />
            }
          >
            View Members
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Import More
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
