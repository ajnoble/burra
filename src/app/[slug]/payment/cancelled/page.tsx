import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function PaymentCancelledPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <span className="text-muted-foreground text-2xl">←</span>
      </div>
      <h1 className="text-2xl font-bold">Payment Cancelled</h1>
      <p className="text-muted-foreground text-center max-w-md">
        No charge was made. You can pay anytime from your dashboard.
      </p>
      <Button render={<Link href={`/${slug}/dashboard`} />}>
        Back to Dashboard
      </Button>
    </div>
  );
}
