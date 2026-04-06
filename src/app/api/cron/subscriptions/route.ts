import { NextRequest } from "next/server";
import { processSubscriptionCron } from "@/actions/subscriptions/cron";

export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await processSubscriptionCron();

  return Response.json({
    ok: true,
    remindersSent: result.remindersSent,
    financialStatusChanged: result.financialStatusChanged,
  });
}
