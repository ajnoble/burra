"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

type Communication = {
  communications: {
    id: string;
    subject: string | null;
    channel: "EMAIL" | "SMS" | "BOTH";
    status: "DRAFT" | "SENDING" | "SENT" | "PARTIAL_FAILURE" | "FAILED";
    recipientCount: number | null;
    sentAt: Date | null;
    createdAt: Date;
  };
  members: {
    firstName: string;
    lastName: string;
  } | null;
};

type Props = {
  communications: Communication[];
  slug: string;
};

const STATUS_BADGE: Record<
  string,
  "outline" | "secondary" | "default" | "destructive"
> = {
  DRAFT: "outline",
  SENDING: "secondary",
  SENT: "default",
  PARTIAL_FAILURE: "destructive",
  FAILED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENDING: "Sending",
  SENT: "Sent",
  PARTIAL_FAILURE: "Partial Failure",
  FAILED: "Failed",
};

export function CommunicationsTable({ communications, slug }: Props) {
  if (communications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p>No communications yet.</p>
        <p className="text-sm mt-1">
          Create your first communication by clicking Compose.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 font-medium">Subject</th>
              <th className="pb-2 font-medium">Channel</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Recipients</th>
              <th className="pb-2 font-medium">Sent By</th>
              <th className="pb-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {communications.map((item) => {
              const c = item.communications;
              const m = item.members;
              return (
                <tr key={c.id} className="border-b">
                  <td className="py-3">
                    <Link
                      href={`/${slug}/admin/communications/${c.id}`}
                      className="text-primary hover:underline font-medium"
                    >
                      {c.subject || "(No subject)"}
                    </Link>
                  </td>
                  <td className="py-3">
                    <Badge variant="secondary">{c.channel}</Badge>
                  </td>
                  <td className="py-3">
                    <Badge variant={STATUS_BADGE[c.status]}>
                      {STATUS_LABEL[c.status]}
                    </Badge>
                  </td>
                  <td className="py-3">{c.recipientCount ?? 0}</td>
                  <td className="py-3">
                    {m ? `${m.firstName} ${m.lastName}` : "Unknown"}
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {formatDistanceToNow(
                      new Date(c.sentAt ?? c.createdAt),
                      { addSuffix: true }
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {communications.map((item) => {
          const c = item.communications;
          const m = item.members;
          return (
            <Link
              key={c.id}
              href={`/${slug}/admin/communications/${c.id}`}
              className="block rounded-lg border p-4 hover:bg-muted/50"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="font-medium">{c.subject || "(No subject)"}</p>
                <Badge variant={STATUS_BADGE[c.status]}>
                  {STATUS_LABEL[c.status]}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{c.channel}</Badge>
                <span>{c.recipientCount ?? 0} recipients</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {m ? `${m.firstName} ${m.lastName}` : "Unknown"} &middot;{" "}
                {formatDistanceToNow(new Date(c.sentAt ?? c.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
