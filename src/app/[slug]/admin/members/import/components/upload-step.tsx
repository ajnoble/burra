"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function UploadStep({
  onUpload,
}: {
  onUpload: (csvText: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) {
        alert("Please upload a CSV file");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        onUpload(text);
      };
      reader.readAsText(file);
    },
    [onUpload]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload CSV</CardTitle>
        <CardDescription>
          Upload a CSV file with member data. Required columns: first_name,
          last_name, email, membership_class.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Drag and drop your CSV file here, or click to browse
            </p>
            <Button
              variant="outline"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".csv";
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFile(file);
                };
                input.click();
              }}
            >
              Choose File
            </Button>
          </div>
        </div>

        <div className="mt-6 text-sm text-muted-foreground">
          <p className="font-medium mb-2">CSV Format:</p>
          <table className="text-xs w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1 pr-4">Column</th>
                <th className="text-left py-1 pr-4">Required</th>
                <th className="text-left py-1">Format</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-1 pr-4">first_name</td>
                <td className="py-1 pr-4">Yes</td>
                <td className="py-1">Text</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 pr-4">last_name</td>
                <td className="py-1 pr-4">Yes</td>
                <td className="py-1">Text</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 pr-4">email</td>
                <td className="py-1 pr-4">Yes</td>
                <td className="py-1">Must be unique within org</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 pr-4">membership_class</td>
                <td className="py-1 pr-4">Yes</td>
                <td className="py-1">Must match existing class name</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 pr-4">phone</td>
                <td className="py-1 pr-4">No</td>
                <td className="py-1">Text</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 pr-4">date_of_birth</td>
                <td className="py-1 pr-4">No</td>
                <td className="py-1">YYYY-MM-DD</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 pr-4">member_number</td>
                <td className="py-1 pr-4">No</td>
                <td className="py-1">Text</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 pr-4">is_financial</td>
                <td className="py-1 pr-4">No</td>
                <td className="py-1">true/false (default: true)</td>
              </tr>
              <tr>
                <td className="py-1 pr-4">primary_member_email</td>
                <td className="py-1 pr-4">No</td>
                <td className="py-1">Links family to primary member</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
