import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Burra
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Modern booking and membership management for member-owned
          accommodation clubs.
        </p>
      </div>
      <div className="flex gap-4">
        <Button render={<Link href="/demo" />}>Demo Club</Button>
      </div>
    </div>
  );
}
