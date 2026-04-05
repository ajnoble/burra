import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function ClubPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{slug}</h1>
        <p className="text-muted-foreground">
          Club public page — availability calendar and lodge info coming soon.
        </p>
      </div>
      <Button render={<Link href={`/${slug}/login`} />}>Member Login</Button>
    </div>
  );
}
