import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { lodges } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateLodgeDialog } from "./create-lodge-dialog";

export default async function LodgesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const orgLodges = await db
    .select()
    .from(lodges)
    .where(eq(lodges.organisationId, org.id));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Lodges</h1>
          <p className="text-muted-foreground">
            Manage your club&apos;s lodges, rooms, and beds.
          </p>
        </div>
        <CreateLodgeDialog organisationId={org.id} />
      </div>

      {orgLodges.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No lodges yet. Create your first lodge to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {orgLodges.map((lodge) => (
            <Card key={lodge.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{lodge.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {lodge.totalBeds} beds
                    </Badge>
                    {!lodge.isActive && (
                      <Badge variant="destructive">Inactive</Badge>
                    )}
                  </div>
                </div>
                {lodge.address && (
                  <CardDescription>{lodge.address}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <Link href={`/${slug}/admin/lodges/${lodge.id}`} />
                  }
                >
                  Manage Rooms & Beds
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
