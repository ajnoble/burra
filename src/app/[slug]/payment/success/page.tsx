import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function PaymentSuccessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
        <span className="text-green-600 dark:text-green-400 text-2xl">✓</span>
      </div>
      <h1 className="text-2xl font-bold">Payment Received</h1>
      <p className="text-muted-foreground text-center max-w-md">
        Your payment has been processed successfully. You will receive a
        confirmation shortly.
      </p>
      <Button render={<Link href={`/${slug}/dashboard`} />}>
        Back to Dashboard
      </Button>
    </div>
  );
}
