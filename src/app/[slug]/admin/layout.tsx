import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember, canAccessAdmin, isCommitteeOrAbove } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MobileNav } from "./mobile-nav";

const NAV_ITEMS = [
  { label: "Dashboard", href: "", committeeOnly: false },
  { label: "Bookings", href: "/bookings", committeeOnly: false },
  { label: "Members", href: "/members", committeeOnly: false },
  { label: "Lodges", href: "/lodges", committeeOnly: false },
  { label: "Availability", href: "/availability", committeeOnly: false },
  { label: "Seasons", href: "/seasons", committeeOnly: true },
  { label: "Tariffs", href: "/tariffs", committeeOnly: true },
  { label: "Subscriptions", href: "/subscriptions", committeeOnly: true },
  { label: "Charges", href: "/charges", committeeOnly: true },
  { label: "Waitlist", href: "/waitlist", committeeOnly: false },
  { label: "Reports", href: "/reports", committeeOnly: true },
  { label: "Communications", href: "/communications", committeeOnly: true },
  { label: "Documents", href: "/documents", committeeOnly: false },
  { label: "Audit Log", href: "/audit-log", committeeOnly: true },
  { label: "Settings", href: "/settings", committeeOnly: true },
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

  const isCommittee = isCommitteeOrAbove(session.role);
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.committeeOnly || isCommittee
  );

  async function handleLogout() {
    "use server";
    const { logout: doLogout } = await import("@/actions/auth/logout");
    await doLogout(slug);
  }

  return (
    <div className="flex min-h-full">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r bg-muted/30 p-4">
        <div className="mb-4">
          <h2 className="font-semibold text-sm truncate">{org.name}</h2>
          <p className="text-xs text-muted-foreground">Admin</p>
        </div>
        <Separator className="mb-4" />
        <nav className="flex flex-col gap-1">
          {visibleNavItems.map((item) => (
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
          <Link
            href={`/${slug}/dashboard`}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Member Dashboard
          </Link>
          <p className="text-xs text-muted-foreground truncate px-3">
            {session.firstName} {session.lastName}
          </p>
          <p className="text-xs text-muted-foreground mb-3 px-3">{session.role}</p>
          <form action={handleLogout}>
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <header className="md:hidden flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-sm">{org.name} Admin</h2>
          <MobileNav
            slug={slug}
            orgName={org.name}
            navItems={visibleNavItems}
            userName={`${session.firstName} ${session.lastName}`}
            userRole={session.role}
            logoutAction={handleLogout}
          />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
