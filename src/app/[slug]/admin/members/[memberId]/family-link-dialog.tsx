"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { searchMembersAction } from "@/actions/members/search";
import { linkFamilyMember } from "@/actions/members/family";

type SearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

export function FamilyLinkDialog({
  memberId,
  organisationId,
  slug,
  mode,
}: {
  memberId: string;
  organisationId: string;
  slug: string;
  mode: "link-primary" | "link-dependent";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(q: string) {
    setQuery(q);
    setError(null);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const found = await searchMembersAction(organisationId, q);
    setResults(found.filter((m) => m.id !== memberId));
    setSearching(false);
  }

  async function handleLink(targetId: string) {
    setError(null);
    const primaryMemberId = mode === "link-dependent" ? memberId : targetId;
    const dependentMemberId = mode === "link-dependent" ? targetId : memberId;

    const result = await linkFamilyMember({
      organisationId,
      slug,
      primaryMemberId,
      dependentMemberId,
    });

    if (result.success) {
      setOpen(false);
      setQuery("");
      setResults([]);
    } else {
      setError(result.error ?? "Failed to link");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        {mode === "link-dependent" ? "Add Dependent" : "Set Primary Member"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "link-dependent"
              ? "Link a dependent member"
              : "Link to a primary member"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <Input
            placeholder="Search by name or email..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searching && (
            <p className="text-sm text-muted-foreground">Searching...</p>
          )}
          {results.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {results.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-2 rounded border hover:bg-muted cursor-pointer"
                  onClick={() => handleLink(r.id)}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {r.firstName} {r.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.email}</p>
                  </div>
                  <Button variant="ghost" size="sm">
                    Link
                  </Button>
                </div>
              ))}
            </div>
          )}
          {query.length >= 2 && results.length === 0 && !searching && (
            <p className="text-sm text-muted-foreground">No members found.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
