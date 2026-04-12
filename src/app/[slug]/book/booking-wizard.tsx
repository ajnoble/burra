"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BookingProvider, useBooking } from "./booking-context";
import { StepIndicator } from "./step-indicator";
import { SelectLodgeDates } from "./steps/select-lodge-dates";
import { AddGuests } from "./steps/add-guests";
import { SelectBeds } from "./steps/select-beds";
import { ReviewPricing } from "./steps/review-pricing";
import { Confirm } from "./steps/confirm";
import { BookingSuccess } from "./booking-success";

type Lodge = {
  id: string;
  name: string;
  totalBeds: number;
  checkInTime: string;
  checkOutTime: string;
};

type Season = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

type OpenRound = {
  id: string;
  name: string;
  seasonId: string;
  opensAt: Date;
  closesAt: Date;
  maxNightsPerBooking: number | null;
  maxNightsPerMember: number | null;
  holdDurationMinutes: number | null;
  requiresApproval: boolean;
};

type Props = {
  organisationId: string;
  slug: string;
  lodges: Lodge[];
  seasons: Season[];
  openRounds: OpenRound[];
  memberId: string;
  memberName: string;
  membershipClassId: string;
  showNav?: boolean;
};

function WizardContent({
  organisationId,
  slug,
  lodges,
  seasons,
  openRounds,
  memberId,
  memberName,
  membershipClassId,
  showNav = true,
}: Props) {
  const { step, bookingReference } = useBooking();

  if (bookingReference) {
    return <BookingSuccess slug={slug} />;
  }

  return (
    <div>
      {showNav && (
        <nav className="flex items-center gap-3 mb-6 text-sm">
          <Link
            href={`/${slug}/availability`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1")}
          >
            <ArrowLeft className="size-4" />
            Back to Calendar
          </Link>
          <Link
            href={`/${slug}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1")}
          >
            <LayoutDashboard className="size-4" />
            Dashboard
          </Link>
        </nav>
      )}
      <StepIndicator currentStep={step} />

      {step === 1 && (
        <SelectLodgeDates
          lodges={lodges}
          seasons={seasons}
          openRounds={openRounds}
          slug={slug}
          memberId={memberId}
        />
      )}
      {step === 2 && (
        <AddGuests
          organisationId={organisationId}
          memberId={memberId}
          memberName={memberName}
          membershipClassId={membershipClassId}
          slug={slug}
        />
      )}
      {step === 3 && (
        <SelectBeds
          organisationId={organisationId}
          memberId={memberId}
          slug={slug}
        />
      )}
      {step === 4 && (
        <ReviewPricing
          organisationId={organisationId}
          lodges={lodges}
        />
      )}
      {step === 5 && (
        <Confirm
          organisationId={organisationId}
          slug={slug}
          lodges={lodges}
        />
      )}
    </div>
  );
}

export function BookingWizard(props: Props) {
  return (
    <Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
      <BookingProvider>
        <WizardContent {...props} />
      </BookingProvider>
    </Suspense>
  );
}
