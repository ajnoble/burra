import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Admin Dashboard</h1>
      <p className="text-muted-foreground mb-6">
        Overview for {org.name}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border p-4">
          <h3 className="font-medium text-sm text-muted-foreground">
            Occupancy
          </h3>
          <p className="text-2xl font-bold mt-1">--</p>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium text-sm text-muted-foreground">
            Revenue This Season
          </h3>
          <p className="text-2xl font-bold mt-1">--</p>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium text-sm text-muted-foreground">
            Recent Bookings
          </h3>
          <p className="text-2xl font-bold mt-1">--</p>
        </div>
      </div>
    </div>
  );
}
