"use client";

import { useCallback, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { BookingPopoverSelection } from "./booking-popover";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: BookingPopoverSelection | null;
  slug: string;
  onBookingComplete?: () => void;
};

export function BookingSheet({
  open,
  onOpenChange,
  selection,
  slug,
  onBookingComplete,
}: Props) {
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // Build the booking URL with pre-filled params
  const bookingUrl = selection
    ? `/${slug}/book?checkIn=${selection.date}&round=${selection.roundId}`
    : null;

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        // For now, close directly. If step tracking is added later,
        // show confirmation when past step 1.
        onOpenChange(false);
      } else {
        onOpenChange(true);
      }
    },
    [onOpenChange]
  );

  if (!selection) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="sm:max-w-[640px] w-full overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>New Booking</SheetTitle>
            <SheetDescription>
              {selection.bedLabel} &middot; {selection.date} &middot; {selection.roundName}
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4">
            {bookingUrl && (
              <iframe
                src={bookingUrl}
                className="w-full border-0 min-h-[calc(100vh-120px)]"
                title="Booking wizard"
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Discard booking?</DialogTitle>
            <DialogDescription>
              You have an in-progress booking. Closing will discard your changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmClose(false)}>
              Continue Booking
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowConfirmClose(false);
                onOpenChange(false);
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
