"use client";

import { useState } from "react";
import { UploadStep } from "./components/upload-step";
import { PreviewStep } from "./components/preview-step";
import { ConfirmStep } from "./components/confirm-step";
import { ResultStep } from "./components/result-step";
import type { ValidationResult } from "@/lib/import/validate-import";
import type { ExecuteImportResult } from "@/actions/members/import";

type Step = "upload" | "preview" | "confirm" | "result";

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [csvText, setCsvText] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [result, setResult] = useState<ExecuteImportResult | null>(null);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold mb-2">Import Members</h1>
      <p className="text-muted-foreground mb-6">
        Upload a CSV file to import members into your club.
      </p>

      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(["upload", "preview", "confirm", "result"] as const).map(
          (s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  step === s
                    ? "bg-primary text-primary-foreground"
                    : i <
                        ["upload", "preview", "confirm", "result"].indexOf(step)
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-sm hidden sm:inline ${step === s ? "font-medium" : "text-muted-foreground"}`}
              >
                {s === "upload"
                  ? "Upload"
                  : s === "preview"
                    ? "Preview"
                    : s === "confirm"
                      ? "Import"
                      : "Done"}
              </span>
              {i < 3 && (
                <div className="h-px w-8 bg-border" />
              )}
            </div>
          )
        )}
      </div>

      {step === "upload" && (
        <UploadStep
          onUpload={(text) => {
            setCsvText(text);
            setStep("preview");
          }}
        />
      )}

      {step === "preview" && (
        <PreviewStep
          csvText={csvText}
          onValidated={(v) => setValidation(v)}
          onBack={() => setStep("upload")}
          onContinue={() => setStep("confirm")}
          validation={validation}
        />
      )}

      {step === "confirm" && validation && (
        <ConfirmStep
          csvText={csvText}
          validation={validation}
          onBack={() => setStep("preview")}
          onComplete={(r) => {
            setResult(r);
            setStep("result");
          }}
        />
      )}

      {step === "result" && result && <ResultStep result={result} />}
    </div>
  );
}
