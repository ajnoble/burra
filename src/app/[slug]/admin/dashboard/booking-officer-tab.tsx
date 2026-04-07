"use client";

import { type BookingOfficerStatsResult } from "@/actions/dashboard/booking-officer-stats";
import { StatCard } from "./stat-card";
import { OccupancyChart } from "./occupancy-chart";

type Props = {
  data: BookingOfficerStatsResult;
};

export function BookingOfficerTab({ data }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Arrivals Today"
          value={String(data.arrivalsToday)}
        />
        <StatCard
          label="Departures Today"
          value={String(data.departuresToday)}
        />
        <StatCard
          label="Current Occupancy"
          value={`${data.currentOccupancyPercent}%`}
        />
        <StatCard
          label="Pending Approvals"
          value={String(data.pendingApprovals)}
        />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="text-base font-semibold mb-4">
          Occupancy Forecast (30 days)
        </h2>
        <OccupancyChart data={data.occupancyForecast} />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="text-base font-semibold mb-4">Upcoming Arrivals</h2>
        {data.upcomingArrivals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming arrivals</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                      Reference
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                      Member
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                      Lodge
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                      Check-in
                    </th>
                    <th className="text-left py-2 font-medium text-muted-foreground">
                      Guests
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.upcomingArrivals.map((arrival) => (
                    <tr
                      key={arrival.bookingReference}
                      className="border-b last:border-0"
                    >
                      <td className="py-2 pr-4 font-mono">
                        {arrival.bookingReference}
                      </td>
                      <td className="py-2 pr-4">
                        {arrival.memberFirstName} {arrival.memberLastName}
                      </td>
                      <td className="py-2 pr-4">{arrival.lodgeName}</td>
                      <td className="py-2 pr-4">{arrival.checkInDate}</td>
                      <td className="py-2">{arrival.guestCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {data.upcomingArrivals.map((arrival) => (
                <div key={arrival.bookingReference} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm">{arrival.bookingReference}</span>
                    <span className="text-sm">{arrival.guestCount} guest{arrival.guestCount !== 1 ? "s" : ""}</span>
                  </div>
                  <p className="text-sm font-medium">{arrival.memberFirstName} {arrival.memberLastName}</p>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{arrival.lodgeName}</span>
                    <span>{arrival.checkInDate}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
