import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/index";
import { members, organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Snow Gum
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Modern booking and membership management for member-owned
            accommodation clubs.
          </p>
        </div>
      </div>
    );
  }

  // Find all orgs this user belongs to
  const userOrgs = await db
    .select({
      orgId: organisations.id,
      orgName: organisations.name,
      slug: organisations.slug,
      logoUrl: organisations.logoUrl,
    })
    .from(members)
    .innerJoin(organisations, eq(members.organisationId, organisations.id))
    .where(eq(members.email, user.email!));

  if (userOrgs.length === 1) {
    const { redirect } = await import("next/navigation");
    redirect(`/${userOrgs[0].slug}/dashboard`);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Your Organisations
        </h1>
        <p className="text-muted-foreground">
          Choose an organisation to continue.
        </p>
      </div>
      <div className="grid gap-4 w-full max-w-md">
        {userOrgs.map((org) => (
          <Link key={org.orgId} href={`/${org.slug}/dashboard`}>
            <Card className="hover:border-primary transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                {org.logoUrl && (
                  <img
                    src={org.logoUrl}
                    alt={org.orgName}
                    className="h-10 w-10 rounded-lg"
                  />
                )}
                <div>
                  <CardTitle className="text-lg">{org.orgName}</CardTitle>
                  <CardDescription>{org.slug}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
