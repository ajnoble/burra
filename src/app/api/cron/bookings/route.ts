import { NextRequest } from "next/server";
import { processBookingPaymentCron } from "@/actions/bookings/cron";

export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await processBookingPaymentCron();

  return Response.json({
    ok: true,
    remindersSent: result.remindersSent,
    bookingsCancelled: result.bookingsCancelled,
    holdsCleared: result.holdsCleared,
  });
}
