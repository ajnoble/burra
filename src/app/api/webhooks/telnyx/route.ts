import { NextRequest } from "next/server";
import { processTelnyxWebhook } from "@/actions/communications/webhook-handlers";

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json();
  try {
    await processTelnyxWebhook(body);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[webhook/telnyx] Error:", error);
    return new Response("Internal error", { status: 500 });
  }
}
