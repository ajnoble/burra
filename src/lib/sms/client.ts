import { Telnyx } from "telnyx";

type TelnyxClient = InstanceType<typeof Telnyx>;

let telnyxClient: TelnyxClient | null = null;

export function getTelnyxClient(): TelnyxClient {
  if (!telnyxClient) {
    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) {
      throw new Error("TELNYX_API_KEY environment variable is not set");
    }
    telnyxClient = new Telnyx({ apiKey });
  }
  return telnyxClient;
}
