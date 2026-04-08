"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { createDraft, updateDraft } from "@/actions/communications/create-draft";
import { sendCommunication } from "@/actions/communications/send";
import { resolveRecipients } from "@/actions/communications/recipients";
import { createTemplate } from "@/actions/communications/templates";
// Using marked directly for client-side preview since renderMarkdown uses JSDOM (server-only).
// The admin is viewing their own input here; actual emails are sanitized server-side via renderMarkdown.
import { marked } from "marked";
import type { CommunicationFilters } from "@/db/schema/communications";

type MembershipClass = {
  id: string;
  name: string;
};

type Recipient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  membershipClassName: string | null;
  role: string;
  isFinancial: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
};

type DraftData = {
  id: string;
  subject: string | null;
  bodyMarkdown: string;
  smsBody: string | null;
  channel: "EMAIL" | "SMS" | "BOTH";
  filters: CommunicationFilters;
};

type TemplateData = {
  id: string;
  name: string;
  subject: string | null;
  bodyMarkdown: string;
  smsBody: string | null;
  channel: "EMAIL" | "SMS" | "BOTH";
};

type Props = {
  organisationId: string;
  slug: string;
  sessionMemberId: string;
  membershipClasses: MembershipClass[];
  draft?: DraftData | null;
  template?: TemplateData | null;
};

/**
 * Render markdown for admin-only preview.
 * This is safe because:
 * 1. The admin is viewing their own input (not untrusted user content)
 * 2. Actual emails sent to recipients use server-side renderMarkdown() with DOMPurify sanitization
 */
function renderPreview(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

export function ComposeForm({
  organisationId,
  slug,
  sessionMemberId,
  membershipClasses,
  draft,
  template,
}: Props) {
  const router = useRouter();

  // Form state
  const [channel, setChannel] = useState<"EMAIL" | "SMS" | "BOTH">(
    draft?.channel ?? template?.channel ?? "EMAIL"
  );
  const [subject, setSubject] = useState(
    draft?.subject ?? template?.subject ?? ""
  );
  const [bodyMarkdown, setBodyMarkdown] = useState(
    draft?.bodyMarkdown ?? template?.bodyMarkdown ?? ""
  );
  const [smsBody, setSmsBody] = useState(
    draft?.smsBody ?? template?.smsBody ?? ""
  );

  // Filters
  const [membershipClassId, setMembershipClassId] = useState<string>(
    draft?.filters?.membershipClassIds?.[0] ?? ""
  );
  const [financialStatus, setFinancialStatus] = useState<string>(
    draft?.filters?.isFinancial === true
      ? "financial"
      : draft?.filters?.isFinancial === false
        ? "non-financial"
        : ""
  );
  const [roleFilter, setRoleFilter] = useState<string>(
    draft?.filters?.role ?? ""
  );

  // Recipients
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(
    new Set(draft?.filters?.manualExclude ?? [])
  );
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // UI state
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  // Save as template
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Load recipients when filters change
  const loadRecipients = useCallback(async () => {
    setLoadingRecipients(true);
    try {
      const filters: CommunicationFilters = {};
      if (membershipClassId) {
        filters.membershipClassIds = [membershipClassId];
      }
      if (financialStatus === "financial") {
        filters.isFinancial = true;
      } else if (financialStatus === "non-financial") {
        filters.isFinancial = false;
      }
      if (roleFilter) {
        filters.role = roleFilter;
      }

      const result = await resolveRecipients({
        organisationId,
        filters,
        channel,
      });
      if (result.success) {
        setRecipients(result.recipients);
      }
    } catch {
      toast.error("Failed to load recipients");
    } finally {
      setLoadingRecipients(false);
    }
  }, [organisationId, membershipClassId, financialStatus, roleFilter, channel]);

  useEffect(() => {
    loadRecipients();
  }, [loadRecipients]);

  function buildFilters(): CommunicationFilters {
    const filters: CommunicationFilters = {};
    if (membershipClassId) {
      filters.membershipClassIds = [membershipClassId];
    }
    if (financialStatus === "financial") {
      filters.isFinancial = true;
    } else if (financialStatus === "non-financial") {
      filters.isFinancial = false;
    }
    if (roleFilter) {
      filters.role = roleFilter;
    }
    if (excludedIds.size > 0) {
      filters.manualExclude = Array.from(excludedIds);
    }
    return filters;
  }

  async function handleSaveDraft() {
    setSaving(true);
    try {
      if (draftId) {
        const result = await updateDraft({
          communicationId: draftId,
          organisationId,
          subject: channel !== "SMS" ? subject : undefined,
          bodyMarkdown,
          smsBody: channel !== "EMAIL" ? smsBody : undefined,
          channel,
          filters: buildFilters(),
          slug,
        });
        if (result.success) {
          toast.success("Draft saved");
        } else {
          toast.error(result.error || "Failed to save draft");
        }
      } else {
        const result = await createDraft({
          organisationId,
          subject: channel !== "SMS" ? subject : undefined,
          bodyMarkdown,
          smsBody: channel !== "EMAIL" ? smsBody : undefined,
          channel,
          filters: buildFilters(),
          createdByMemberId: sessionMemberId,
          slug,
        });
        if (result.success && result.communication) {
          setDraftId(result.communication.id);
          toast.success("Draft created");
        } else {
          toast.error(result.error || "Failed to create draft");
        }
      }
    } catch {
      toast.error("Failed to save draft");
    } finally {
      setSaving(false);
    }
  }

  function handlePreview() {
    const html = renderPreview(bodyMarkdown);
    setPreviewHtml(html);
    setPreviewOpen(true);
  }

  async function handleSend() {
    if (!bodyMarkdown.trim()) {
      toast.error("Message body is required");
      return;
    }

    const activeRecipients = recipients.filter((r) => !excludedIds.has(r.id));
    if (activeRecipients.length === 0) {
      toast.error("No recipients selected");
      return;
    }

    setSending(true);
    try {
      // Ensure we have a draft saved first
      let commId = draftId;
      if (!commId) {
        const draftResult = await createDraft({
          organisationId,
          subject: channel !== "SMS" ? subject : undefined,
          bodyMarkdown,
          smsBody: channel !== "EMAIL" ? smsBody : undefined,
          channel,
          filters: buildFilters(),
          createdByMemberId: sessionMemberId,
          slug,
        });
        if (!draftResult.success || !draftResult.communication) {
          toast.error(draftResult.error || "Failed to save draft before sending");
          setSending(false);
          return;
        }
        commId = draftResult.communication.id;
        setDraftId(commId);
      } else {
        // Update existing draft with latest content
        await updateDraft({
          communicationId: commId,
          organisationId,
          subject: channel !== "SMS" ? subject : undefined,
          bodyMarkdown,
          smsBody: channel !== "EMAIL" ? smsBody : undefined,
          channel,
          filters: buildFilters(),
          slug,
        });
      }

      const result = await sendCommunication({
        communicationId: commId,
        organisationId,
        slug,
      });
      if (result.success) {
        toast.success(
          `Communication sent: ${result.sentCount} delivered, ${result.failedCount} failed`
        );
        router.push(`/${slug}/admin/communications`);
      } else {
        toast.error(result.error || "Failed to send");
      }
    } catch {
      toast.error("Failed to send communication");
    } finally {
      setSending(false);
    }
  }

  async function handleSaveAsTemplate() {
    if (!templateName.trim()) {
      toast.error("Template name is required");
      return;
    }
    setSavingTemplate(true);
    try {
      const result = await createTemplate({
        organisationId,
        name: templateName,
        channel,
        subject: channel !== "SMS" ? subject : undefined,
        bodyMarkdown,
        smsBody: channel !== "EMAIL" ? smsBody : undefined,
        createdByMemberId: sessionMemberId,
        slug,
      });
      if (result.success) {
        toast.success("Template saved");
        setTemplateName("");
      } else {
        toast.error(result.error || "Failed to save template");
      }
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  }

  function toggleExclude(memberId: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }

  function selectAll() {
    setExcludedIds(new Set());
  }

  function selectNone() {
    setExcludedIds(new Set(recipients.map((r) => r.id)));
  }

  const activeRecipients = recipients.filter((r) => !excludedIds.has(r.id));
  const activeEmailCount = activeRecipients.filter((r) => r.hasEmail).length;
  const activeSmsCount = activeRecipients.filter((r) => r.hasPhone).length;

  const smsSegments = Math.ceil(smsBody.length / 160) || 0;

  return (
    <div className="space-y-6">
      {/* Channel selector */}
      <div>
        <Label>Channel</Label>
        <div className="flex gap-2 mt-1">
          {(["EMAIL", "SMS", "BOTH"] as const).map((ch) => (
            <Button
              key={ch}
              variant={channel === ch ? "default" : "outline"}
              size="sm"
              onClick={() => setChannel(ch)}
            >
              {ch === "BOTH" ? "Both" : ch === "EMAIL" ? "Email" : "SMS"}
            </Button>
          ))}
        </div>
      </div>

      {/* Subject (email) */}
      {(channel === "EMAIL" || channel === "BOTH") && (
        <div>
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject line"
          />
        </div>
      )}

      {/* Markdown editor with preview */}
      <div>
        <Label>Message Body (Markdown)</Label>
        <div className="grid gap-4 md:grid-cols-2 mt-1">
          <Textarea
            value={bodyMarkdown}
            onChange={(e) => setBodyMarkdown(e.target.value)}
            placeholder="Write your message in Markdown..."
            rows={12}
          />
          {/* Admin-only preview rendered client-side via marked.
              Actual emails use server-side renderMarkdown() with DOMPurify for sanitization. */}
          <div className="hidden md:block rounded-lg border p-4 overflow-auto max-h-80 prose prose-sm dark:prose-invert">
            <p className="text-xs text-muted-foreground mb-2 not-prose">
              Preview
            </p>
            <div
              dangerouslySetInnerHTML={{
                __html: renderPreview(
                  bodyMarkdown || "*Start typing to see preview...*"
                ),
              }}
            />
          </div>
        </div>
      </div>

      {/* SMS body */}
      {(channel === "SMS" || channel === "BOTH") && (
        <div>
          <Label htmlFor="sms-body">SMS Body</Label>
          <Textarea
            id="sms-body"
            value={smsBody}
            onChange={(e) => setSmsBody(e.target.value)}
            placeholder="SMS message text..."
            rows={4}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {smsBody.length}/160 ({smsSegments} segment{smsSegments !== 1 ? "s" : ""})
          </p>
        </div>
      )}

      {/* Recipient filters */}
      <div className="space-y-4">
        <Label>Recipient Filters</Label>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">Membership Class</Label>
            <Select
              value={membershipClassId}
              onValueChange={(val) => setMembershipClassId(val ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All classes</SelectItem>
                {membershipClasses.map((mc) => (
                  <SelectItem key={mc.id} value={mc.id}>
                    {mc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Financial Status</Label>
            <Select
              value={financialStatus}
              onValueChange={(val) => setFinancialStatus(val ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="financial">Financial</SelectItem>
                <SelectItem value="non-financial">Non-Financial</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select value={roleFilter} onValueChange={(val) => setRoleFilter(val ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All roles</SelectItem>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="BOOKING_OFFICER">Booking Officer</SelectItem>
                <SelectItem value="COMMITTEE">Committee</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Count badges */}
        <div className="flex items-center gap-3">
          <Badge variant="secondary">
            {activeRecipients.length} recipient{activeRecipients.length !== 1 ? "s" : ""}
          </Badge>
          {(channel === "EMAIL" || channel === "BOTH") && (
            <Badge variant="outline">{activeEmailCount} email</Badge>
          )}
          {(channel === "SMS" || channel === "BOTH") && (
            <Badge variant="outline">{activeSmsCount} SMS</Badge>
          )}
        </div>

        {/* Member list with checkboxes */}
        <div className="border rounded-lg p-3 max-h-64 overflow-auto">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={selectNone}>
              Select None
            </Button>
          </div>

          {loadingRecipients ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Loading recipients...
            </p>
          ) : recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No members match the selected filters.
            </p>
          ) : (
            <div className="space-y-1">
              {recipients.map((r) => (
                <label
                  key={r.id}
                  className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={!excludedIds.has(r.id)}
                    onChange={() => toggleExclude(r.id)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span>
                    {r.firstName} {r.lastName}
                  </span>
                  {r.membershipClassName && (
                    <Badge variant="outline" className="text-xs">
                      {r.membershipClassName}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {r.hasEmail ? r.email : ""}
                    {r.hasEmail && r.hasPhone ? " / " : ""}
                    {r.hasPhone ? r.phone : ""}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Save as template */}
      <div className="flex items-center gap-2">
        <Input
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder="Save as template..."
          className="max-w-xs"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleSaveAsTemplate}
          disabled={savingTemplate || !templateName.trim()}
        >
          {savingTemplate ? "Saving..." : "Save Template"}
        </Button>
      </div>

      {/* Action bar */}
      <div className="sticky bottom-0 bg-background border-t py-3 flex items-center gap-2">
        <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
          {saving ? "Saving..." : "Save Draft"}
        </Button>
        <Button variant="outline" onClick={handlePreview}>
          Preview
        </Button>
        <Button onClick={handleSend} disabled={sending}>
          {sending ? "Sending..." : "Send"}
        </Button>
      </div>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Message Preview</DialogTitle>
          </DialogHeader>

          {(channel === "EMAIL" || channel === "BOTH") && (
            <div>
              <p className="text-sm font-medium mb-1">Email Preview</p>
              {subject && (
                <p className="text-sm text-muted-foreground mb-2">
                  Subject: {subject}
                </p>
              )}
              {/* Admin-only preview — actual emails are sanitized server-side */}
              <div
                className="prose prose-sm dark:prose-invert border rounded-lg p-4"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}

          {(channel === "SMS" || channel === "BOTH") && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-1">SMS Preview</p>
              <div className="border rounded-lg p-4 bg-muted/50">
                <p className="text-sm whitespace-pre-wrap">
                  {smsBody || "(No SMS body)"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {smsBody.length} chars / {smsSegments} segment{smsSegments !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          )}

          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}
