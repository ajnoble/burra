"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { retryFailed } from "@/actions/communications/retry-failed";
import { formatDistanceToNow } from "date-fns";

type Communication = {
  id: string;
  subject: string | null;
  bodyMarkdown: string;
  bodyHtml: string; // Pre-rendered on server via renderMarkdown (sanitized with DOMPurify)
  smsBody: string | null;
  channel: "EMAIL" | "SMS" | "BOTH";
  status: "DRAFT" | "SENDING" | "SENT" | "PARTIAL_FAILURE" | "FAILED";
  recipientCount: number | null;
  sentAt: Date | null;
  createdAt: Date;
};

type RecipientRow = {
  communication_recipients: {
    id: string;
    memberId: string;
    channel: "EMAIL" | "SMS";
    status: "PENDING" | "SENT" | "DELIVERED" | "OPENED" | "CLICKED" | "BOUNCED" | "FAILED";
    externalId: string | null;
    sentAt: Date | null;
    deliveredAt: Date | null;
    openedAt: Date | null;
    error: string | null;
  };
  members: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  } | null;
};

type Props = {
  communication: Communication;
  stats: Record<string, number>;
  recipients: RecipientRow[];
  organisationId: string;
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
  PENDING: "outline",
  DELIVERED: "default",
  OPENED: "default",
  CLICKED: "default",
  BOUNCED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENDING: "Sending",
  SENT: "Sent",
  PARTIAL_FAILURE: "Partial Failure",
  FAILED: "Failed",
  PENDING: "Pending",
  DELIVERED: "Delivered",
  OPENED: "Opened",
  CLICKED: "Clicked",
  BOUNCED: "Bounced",
};

export function MessageDetail({
  communication,
  stats,
  recipients,
  organisationId,
  slug,
}: Props) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const total = Object.values(stats).reduce((a, b) => a + b, 0);

  function pct(count: number) {
    if (total === 0) return "0%";
    return `${Math.round((count / total) * 100)}%`;
  }

  async function handleRetryAll() {
    setRetrying(true);
    try {
      const result = await retryFailed({
        communicationId: communication.id,
        organisationId,
        slug,
      });
      if (result.success) {
        toast.success(`Retried ${result.retried} failed recipient(s)`);
        router.refresh();
      } else {
        toast.error(result.error || "Failed to retry");
      }
    } catch {
      toast.error("Failed to retry");
    } finally {
      setRetrying(false);
    }
  }

  async function handleRetrySingle(recipientId: string) {
    setRetryingId(recipientId);
    try {
      const result = await retryFailed({
        communicationId: communication.id,
        organisationId,
        slug,
        recipientId,
      });
      if (result.success) {
        toast.success("Retried successfully");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to retry");
      }
    } catch {
      toast.error("Failed to retry");
    } finally {
      setRetryingId(null);
    }
  }

  const hasFailures = (stats.FAILED ?? 0) > 0 || (stats.BOUNCED ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-2">
          {communication.subject || "(No subject)"}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={STATUS_BADGE[communication.status]}>
            {STATUS_LABEL[communication.status]}
          </Badge>
          <Badge variant="secondary">{communication.channel}</Badge>
          {communication.sentAt && (
            <span className="text-sm text-muted-foreground">
              Sent{" "}
              {formatDistanceToNow(new Date(communication.sentAt), {
                addSuffix: true,
              })}
            </span>
          )}
        </div>
      </div>

      <Separator />

      {/* Delivery stats */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Delivery Stats</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Sent", key: "SENT" },
            { label: "Delivered", key: "DELIVERED" },
            { label: "Opened", key: "OPENED" },
            { label: "Bounced", key: "BOUNCED" },
            { label: "Failed", key: "FAILED" },
          ].map(({ label, key }) => (
            <div key={key} className="border rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{stats[key] ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                {label} ({pct(stats[key] ?? 0)})
              </p>
            </div>
          ))}
        </div>
      </div>

      {hasFailures && (
        <Button
          variant="outline"
          onClick={handleRetryAll}
          disabled={retrying}
        >
          {retrying ? "Retrying..." : "Retry Failed"}
        </Button>
      )}

      <Separator />

      {/* Message content preview — HTML is pre-rendered server-side via renderMarkdown
          which sanitizes through DOMPurify to prevent XSS */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Message Content</h2>
        <div
          className="prose prose-sm dark:prose-invert border rounded-lg p-4 max-w-none"
          dangerouslySetInnerHTML={{ __html: communication.bodyHtml }}
        />
      </div>

      {/* SMS body */}
      {communication.smsBody && (
        <div>
          <h2 className="text-lg font-semibold mb-3">SMS Body</h2>
          <div className="border rounded-lg p-4 bg-muted/50">
            <p className="text-sm whitespace-pre-wrap">{communication.smsBody}</p>
          </div>
        </div>
      )}

      <Separator />

      {/* Recipients */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recipients</h2>

        {/* Desktop table */}
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Member</th>
                <th className="pb-2 font-medium">Contact</th>
                <th className="pb-2 font-medium">Channel</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Timestamps</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((row) => {
                const r = row.communication_recipients;
                const m = row.members;
                return (
                  <tr key={r.id} className="border-b">
                    <td className="py-2">
                      {m ? `${m.firstName} ${m.lastName}` : "Unknown"}
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">
                      {r.channel === "EMAIL" ? m?.email : m?.phone}
                    </td>
                    <td className="py-2">
                      <Badge variant="secondary">{r.channel}</Badge>
                    </td>
                    <td className="py-2">
                      <Badge variant={STATUS_BADGE[r.status] ?? "outline"}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {r.sentAt && (
                        <span>
                          Sent{" "}
                          {formatDistanceToNow(new Date(r.sentAt), {
                            addSuffix: true,
                          })}
                        </span>
                      )}
                      {r.deliveredAt && (
                        <span className="ml-2">
                          Delivered{" "}
                          {formatDistanceToNow(new Date(r.deliveredAt), {
                            addSuffix: true,
                          })}
                        </span>
                      )}
                      {r.openedAt && (
                        <span className="ml-2">
                          Opened{" "}
                          {formatDistanceToNow(new Date(r.openedAt), {
                            addSuffix: true,
                          })}
                        </span>
                      )}
                      {r.error && (
                        <span className="text-destructive ml-2">
                          {r.error}
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      {r.status === "FAILED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={retryingId === r.id}
                          onClick={() => handleRetrySingle(r.id)}
                        >
                          {retryingId === r.id ? "..." : "Resend"}
                        </Button>
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
          {recipients.map((row) => {
            const r = row.communication_recipients;
            const m = row.members;
            return (
              <div key={r.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <p className="font-medium text-sm">
                    {m ? `${m.firstName} ${m.lastName}` : "Unknown"}
                  </p>
                  <Badge variant={STATUS_BADGE[r.status] ?? "outline"}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.channel === "EMAIL" ? m?.email : m?.phone}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{r.channel}</Badge>
                  {r.sentAt && (
                    <span className="text-xs text-muted-foreground">
                      Sent{" "}
                      {formatDistanceToNow(new Date(r.sentAt), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>
                {r.error && (
                  <p className="text-xs text-destructive">{r.error}</p>
                )}
                {r.status === "FAILED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={retryingId === r.id}
                    onClick={() => handleRetrySingle(r.id)}
                  >
                    {retryingId === r.id ? "Retrying..." : "Resend"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
