"use client";

import Link from "next/link";
import { Menu, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";

type NavItem = { label: string; href: string };

type MobileNavProps = {
  slug: string;
  orgName: string;
  navItems: NavItem[];
  userName: string;
  userRole: string;
  logoutAction: () => Promise<void>;
};

export function MobileNav({
  slug,
  orgName,
  navItems,
  userName,
  userRole,
  logoutAction,
}: MobileNavProps) {
  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="ghost" size="icon-sm" />}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Open menu</span>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>{orgName}</SheetTitle>
          <p className="text-xs text-muted-foreground">Admin</p>
        </SheetHeader>
        <Separator />
        <nav className="flex flex-col gap-1 px-4 py-2">
          {navItems.map((item) => (
            <SheetClose key={item.href} render={<span />}>
              <Link
                href={`/${slug}/admin${item.href}`}
                className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {item.label}
              </Link>
            </SheetClose>
          ))}
        </nav>
        <div className="mt-auto px-4 pb-4">
          <Separator className="mb-4" />
          <SheetClose render={<span />}>
            <Link
              href={`/${slug}/dashboard`}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Member Dashboard
            </Link>
          </SheetClose>
          <div className="mt-3 px-3">
            <p className="text-xs text-muted-foreground truncate">{userName}</p>
            <p className="text-xs text-muted-foreground mb-3">{userRole}</p>
          </div>
          <form action={logoutAction}>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              type="submit"
            >
              Sign out
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
