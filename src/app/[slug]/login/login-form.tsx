"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { OrgLogo } from "@/components/org-logo";

type LoginFormProps = {
  slug: string;
  orgName: string;
};

export function LoginForm({ slug, orgName }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "magic-link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(`/${slug}/dashboard`);
    router.refresh();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appUrl}/api/auth/callback?next=/${slug}/dashboard`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMagicLinkSent(true);
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <OrgLogo className="mb-2 justify-center" imageClassName="max-h-12" />
          <CardTitle>{orgName}</CardTitle>
          <CardDescription>
            {magicLinkSent
              ? "Check your email for a login link."
              : "Sign in to your account"}
          </CardDescription>
        </CardHeader>

        {!magicLinkSent && (
          <CardContent>
            {/* Mode toggle */}
            <div className="mb-4 flex rounded-lg border p-1">
              <button
                type="button"
                onClick={() => { setMode("password"); setError(null); }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  mode === "password"
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => { setMode("magic-link"); setError(null); }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  mode === "magic-link"
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Magic Link
              </button>
            </div>

            {mode === "password" ? (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href={`/${slug}/auth/reset-password`}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="magic-email">Email</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending..." : "Send magic link"}
                </Button>
              </form>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
