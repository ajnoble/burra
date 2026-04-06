"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

type Guest = {
  memberId: string;
  firstName: string;
  lastName: string;
  membershipClassName: string;
};

type BedAssignment = {
  memberId: string;
  bedId: string;
  bedLabel: string;
  roomId: string;
  roomName: string;
};

type BookingState = {
  step: number;
  lodgeId: string | null;
  lodgeName: string | null;
  bookingRoundId: string | null;
  bookingRoundName: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  guests: Guest[];
  bedAssignments: BedAssignment[];
  holdExpiresAt: Date | null;
  pricingResult: PricingResult | null;
  bookingReference: string | null;
  error: string | null;
};

export type GuestPriceInfo = {
  memberId: string;
  firstName: string;
  lastName: string;
  membershipClassName: string;
  bedLabel: string;
  roomName: string;
  subtotalCents: number;
  discountAmountCents: number;
  totalCents: number;
  blendedPerNightCents: number;
};

export type PricingResult = {
  guests: GuestPriceInfo[];
  subtotalCents: number;
  discountAmountCents: number;
  totalAmountCents: number;
};

type BookingContextType = BookingState & {
  setStep: (step: number) => void;
  setLodge: (id: string, name: string) => void;
  setBookingRound: (id: string, name: string) => void;
  setDates: (checkIn: string, checkOut: string) => void;
  setGuests: (guests: Guest[]) => void;
  addGuest: (guest: Guest) => void;
  removeGuest: (memberId: string) => void;
  setBedAssignments: (assignments: BedAssignment[]) => void;
  addBedAssignment: (assignment: BedAssignment) => void;
  removeBedAssignment: (memberId: string) => void;
  setHoldExpiresAt: (expiresAt: Date | null) => void;
  setPricingResult: (result: PricingResult | null) => void;
  setBookingReference: (ref: string) => void;
  setError: (error: string | null) => void;
  goToStep: (step: number) => void;
  reset: () => void;
};

const BookingContext = createContext<BookingContextType | null>(null);

export function useBooking(): BookingContextType {
  const ctx = useContext(BookingContext);
  if (!ctx) {
    throw new Error("useBooking must be used within BookingProvider");
  }
  return ctx;
}

const INITIAL_STATE: BookingState = {
  step: 1,
  lodgeId: null,
  lodgeName: null,
  bookingRoundId: null,
  bookingRoundName: null,
  checkInDate: null,
  checkOutDate: null,
  guests: [],
  bedAssignments: [],
  holdExpiresAt: null,
  pricingResult: null,
  bookingReference: null,
  error: null,
};

export function BookingProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Restore from URL on mount
  const initialStep = Number(searchParams.get("step")) || 1;
  const initialLodgeId = searchParams.get("lodge");
  const initialCheckIn = searchParams.get("checkIn");
  const initialCheckOut = searchParams.get("checkOut");
  const initialRound = searchParams.get("round");

  const [state, setState] = useState<BookingState>({
    ...INITIAL_STATE,
    step: initialStep,
    lodgeId: initialLodgeId,
    checkInDate: initialCheckIn,
    checkOutDate: initialCheckOut,
    bookingRoundId: initialRound,
  });

  // Sync non-sensitive state to URL
  const syncUrl = useCallback(
    (newState: Partial<BookingState>) => {
      const merged = { ...state, ...newState };
      const params = new URLSearchParams();
      params.set("step", String(merged.step));
      if (merged.lodgeId) params.set("lodge", merged.lodgeId);
      if (merged.checkInDate) params.set("checkIn", merged.checkInDate);
      if (merged.checkOutDate) params.set("checkOut", merged.checkOutDate);
      if (merged.bookingRoundId) params.set("round", merged.bookingRoundId);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [state, router, pathname]
  );

  const update = useCallback(
    (partial: Partial<BookingState>) => {
      setState((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  const goToStep = useCallback(
    (step: number) => {
      const newState = { ...state, step };
      setState(newState);
      syncUrl(newState);
    },
    [state, syncUrl]
  );

  const ctx: BookingContextType = {
    ...state,
    setStep: (step) => update({ step }),
    setLodge: (id, name) => update({ lodgeId: id, lodgeName: name }),
    setBookingRound: (id, name) =>
      update({ bookingRoundId: id, bookingRoundName: name }),
    setDates: (checkIn, checkOut) =>
      update({ checkInDate: checkIn, checkOutDate: checkOut }),
    setGuests: (guests) => update({ guests }),
    addGuest: (guest) =>
      update({ guests: [...state.guests, guest] }),
    removeGuest: (memberId) =>
      update({
        guests: state.guests.filter((g) => g.memberId !== memberId),
        bedAssignments: state.bedAssignments.filter(
          (a) => a.memberId !== memberId
        ),
      }),
    setBedAssignments: (assignments) =>
      update({ bedAssignments: assignments }),
    addBedAssignment: (assignment) =>
      update({
        bedAssignments: [
          ...state.bedAssignments.filter(
            (a) => a.memberId !== assignment.memberId
          ),
          assignment,
        ],
      }),
    removeBedAssignment: (memberId) =>
      update({
        bedAssignments: state.bedAssignments.filter(
          (a) => a.memberId !== memberId
        ),
      }),
    setHoldExpiresAt: (expiresAt) => update({ holdExpiresAt: expiresAt }),
    setPricingResult: (result) => update({ pricingResult: result }),
    setBookingReference: (ref) => update({ bookingReference: ref }),
    setError: (error) => update({ error }),
    goToStep,
    reset: () => {
      setState(INITIAL_STATE);
      router.replace(pathname);
    },
  };

  return (
    <BookingContext.Provider value={ctx}>{children}</BookingContext.Provider>
  );
}
