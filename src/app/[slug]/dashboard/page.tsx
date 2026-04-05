import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${slug}/login`);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user.email}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Upcoming Bookings</h3>
          <p className="text-sm text-muted-foreground mt-1">
            No upcoming bookings.
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Outstanding Balance</h3>
          <p className="text-sm text-muted-foreground mt-1">$0.00</p>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Announcements</h3>
          <p className="text-sm text-muted-foreground mt-1">
            No new announcements.
          </p>
        </div>
      </div>
    </div>
  );
}
