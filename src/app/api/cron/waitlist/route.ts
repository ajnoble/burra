import { NextRequest } from "next/server";
import { expireWaitlistEntries } from "@/actions/waitlist/expire";

export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await expireWaitlistEntries();

  return Response.json({ ok: true, ...result });
}
