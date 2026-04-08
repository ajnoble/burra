import { NextRequest } from "next/server";
import { processResendWebhook } from "@/actions/communications/webhook-handlers";

export async function POST(request: NextRequest): Promise<Response> {
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing webhook headers", { status: 400 });
  }
  const body = await request.json();
  try {
    await processResendWebhook(body);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[webhook/resend] Error:", error);
    return new Response("Internal error", { status: 500 });
  }
}
