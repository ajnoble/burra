"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  bedLabel: string;
  checkIn: string;
  checkOut: string;
  slug: string;
};

export function QuickCreateDialog({
  open,
  onClose,
  bedLabel,
  checkIn,
  checkOut,
  slug,
}: Props) {
  const bookUrl = `/${slug}/book?checkIn=${checkIn}&checkOut=${checkOut}`;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>New Booking</DialogTitle>
          <DialogDescription>
            <span className="block">Bed: {bedLabel}</span>
            <span className="block">
              Check-in: {checkIn} &rarr; Check-out: {checkOut}
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Link
            href={bookUrl}
            onClick={onClose}
            className={cn(buttonVariants({ variant: "default" }))}
          >
            Start Booking
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
