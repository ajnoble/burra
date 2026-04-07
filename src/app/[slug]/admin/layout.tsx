import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember, canAccessAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const NAV_ITEMS = [
  { label: "Dashboard", href: "" },
  { label: "Bookings", href: "/bookings" },
  { label: "Members", href: "/members" },
  { label: "Lodges", href: "/lodges" },
  { label: "Availability", href: "/availability" },
  { label: "Seasons", href: "/seasons" },
  { label: "Tariffs", href: "/tariffs" },
  { label: "Subscriptions", href: "/subscriptions" },
  { label: "Waitlist", href: "/waitlist" },
  { label: "Reports", href: "/reports" },
  { label: "Communications", href: "/communications" },
  { label: "Documents", href: "/documents" },
  { label: "Audit Log", href: "/audit-log" },
  { label: "Settings", href: "/settings" },
];

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);

  if (!org) notFound();

  const session = await getSessionMember(org.id);

  if (!session || !canAccessAdmin(session.role)) {
    redirect(`/${slug}/login`);
  }

  return (
    <div className="flex min-h-full">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r bg-muted/30 p-4">
        <div className="mb-4">
          <h2 className="font-semibold text-sm truncate">{org.name}</h2>
          <p className="text-xs text-muted-foreground">Admin</p>
        </div>
        <Separator className="mb-4" />
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={`/${slug}/admin${item.href}`}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-4">
          <Separator className="mb-4" />
          <p className="text-xs text-muted-foreground truncate">
            {session.firstName} {session.lastName}
          </p>
          <p className="text-xs text-muted-foreground mb-3">{session.role}</p>
          <form action={async () => { "use server"; const { logout: doLogout } = await import("@/actions/auth/logout"); await doLogout(slug); }}>
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col">
        <header className="md:hidden flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-sm">{org.name} Admin</h2>
          {/* TODO: mobile menu sheet */}
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
