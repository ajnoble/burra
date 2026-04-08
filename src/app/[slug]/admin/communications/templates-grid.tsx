"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { createTemplate, deleteTemplate } from "@/actions/communications/templates";
import { formatDistanceToNow } from "date-fns";

type Template = {
  id: string;
  name: string;
  subject: string | null;
  bodyMarkdown: string;
  smsBody: string | null;
  channel: "EMAIL" | "SMS" | "BOTH";
  createdAt: Date;
  updatedAt: Date;
};

type Props = {
  templates: Template[];
  organisationId: string;
  slug: string;
  sessionMemberId: string;
};

export function TemplatesGrid({
  templates,
  organisationId,
  slug,
  sessionMemberId,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"EMAIL" | "SMS" | "BOTH">("EMAIL");
  const [subject, setSubject] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("");
  const [smsBody, setSmsBody] = useState("");

  function resetForm() {
    setName("");
    setChannel("EMAIL");
    setSubject("");
    setBodyMarkdown("");
    setSmsBody("");
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const result = await createTemplate({
        organisationId,
        name,
        channel,
        subject: channel !== "SMS" ? subject : undefined,
        bodyMarkdown,
        smsBody: channel !== "EMAIL" ? smsBody : undefined,
        createdByMemberId: sessionMemberId,
        slug,
      });
      if (result.success) {
        toast.success("Template created");
        setCreateOpen(false);
        resetForm();
        router.refresh();
      } else {
        toast.error(result.error || "Failed to create template");
      }
    } catch {
      toast.error("Failed to create template");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const result = await deleteTemplate({ id, organisationId, slug });
      if (result.success) {
        toast.success("Template deleted");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to delete template");
      }
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Templates</h2>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button variant="outline" />}>
            New Template
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="tpl-name">Name</Label>
                <Input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Template name"
                />
              </div>
              <div>
                <Label htmlFor="tpl-channel">Channel</Label>
                <Select
                  value={channel}
                  onValueChange={(val) =>
                    setChannel(val as "EMAIL" | "SMS" | "BOTH")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="SMS">SMS</SelectItem>
                    <SelectItem value="BOTH">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(channel === "EMAIL" || channel === "BOTH") && (
                <div>
                  <Label htmlFor="tpl-subject">Subject</Label>
                  <Input
                    id="tpl-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Email subject"
                  />
                </div>
              )}
              <div>
                <Label htmlFor="tpl-body">Body (Markdown)</Label>
                <Textarea
                  id="tpl-body"
                  value={bodyMarkdown}
                  onChange={(e) => setBodyMarkdown(e.target.value)}
                  placeholder="Write your message in Markdown..."
                  rows={6}
                />
              </div>
              {(channel === "SMS" || channel === "BOTH") && (
                <div>
                  <Label htmlFor="tpl-sms">SMS Body</Label>
                  <Textarea
                    id="tpl-sms"
                    value={smsBody}
                    onChange={(e) => setSmsBody(e.target.value)}
                    placeholder="SMS message text..."
                    rows={3}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Creating..." : "Create Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p>No templates yet.</p>
          <p className="text-sm mt-1">
            Create a template to save time when composing messages.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between">
                <h3 className="font-medium">{t.name}</h3>
                <Badge variant="secondary">{t.channel}</Badge>
              </div>
              {t.subject && (
                <p className="text-sm text-muted-foreground truncate">
                  {t.subject}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Updated{" "}
                {formatDistanceToNow(new Date(t.updatedAt), {
                  addSuffix: true,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    router.push(
                      `/${slug}/admin/communications/compose?template=${t.id}`
                    )
                  }
                >
                  Use
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={deletingId === t.id}
                  onClick={() => handleDelete(t.id)}
                >
                  {deletingId === t.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
