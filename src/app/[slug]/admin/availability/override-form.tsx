"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createAvailabilityOverride,
  updateAvailabilityOverride,
} from "@/actions/availability/overrides";

type Override = {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  bedReduction: number | null;
  reason: string | null;
};

type Props = {
  lodgeId: string;
  slug: string;
  initialDate: string | null;
  override: Override | null;
  onClose: () => void;
};

export function OverrideForm({
  lodgeId,
  slug,
  initialDate,
  override,
  onClose,
}: Props) {
  const router = useRouter();
  const isEditing = !!override;

  const [startDate, setStartDate] = useState(
    override?.startDate ?? initialDate ?? ""
  );
  const [endDate, setEndDate] = useState(
    override?.endDate ?? initialDate ?? ""
  );
  const [type, setType] = useState<"CLOSURE" | "REDUCTION">(
    (override?.type as "CLOSURE" | "REDUCTION") ?? "CLOSURE"
  );
  const [bedReduction, setBedReduction] = useState(
    override?.bedReduction?.toString() ?? ""
  );
  const [reason, setReason] = useState(override?.reason ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    let result;

    if (isEditing) {
      result = await updateAvailabilityOverride({
        id: override.id,
        startDate,
        endDate,
        type,
        bedReduction: type === "REDUCTION" ? parseInt(bedReduction, 10) : null,
        reason: reason || null,
        slug,
      });
    } else {
      result = await createAvailabilityOverride({
        lodgeId,
        startDate,
        endDate,
        type,
        bedReduction:
          type === "REDUCTION" ? parseInt(bedReduction, 10) : undefined,
        reason: reason || undefined,
        createdByMemberId: "",
        slug,
      });
    }

    setSubmitting(false);

    if (result.success) {
      onClose();
      router.refresh();
    } else {
      setError(result.error ?? "Something went wrong");
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Override" : "Add Override"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="type">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as "CLOSURE" | "REDUCTION")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLOSURE">Full Closure</SelectItem>
                <SelectItem value="REDUCTION">Bed Reduction</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "REDUCTION" && (
            <div>
              <Label htmlFor="bedReduction">Beds to Remove</Label>
              <Input
                id="bedReduction"
                type="number"
                min="1"
                value={bedReduction}
                onChange={(e) => setBedReduction(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving..."
                : isEditing
                  ? "Update"
                  : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
