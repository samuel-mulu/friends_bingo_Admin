"use client";

import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";

import { createAdminSupportMessage } from "@/lib/api/admin";
import { openFeedbackCountQueryKey } from "@/lib/admin/use-open-feedback-count";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
import { LoadingButton } from "@/components/admin/loading-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export function PlayerSendFeedbackDialog({
  userId,
  playerName,
  open,
  onOpenChange,
}: {
  userId: string | null;
  playerName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) {
      setDraft("");
    }
  }, [open, userId]);

  const sendMutation = useAdminMutation({
    mutationFn: createAdminSupportMessage,
    successMessage: "Message sent to player.",
    errorMessage: "The message could not be sent.",
    invalidateQueryKeys: [["admin", "support"], openFeedbackCountQueryKey],
    onSuccess: () => {
      setDraft("");
      onOpenChange(false);
    },
  });

  const trimmed = draft.trim();
  const canSend = Boolean(userId && trimmed && !sendMutation.isPending);

  const handleSend = () => {
    if (!userId || !trimmed || sendMutation.isPending) {
      return;
    }

    sendMutation.mutate({
      userId,
      adminReply: trimmed,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send</DialogTitle>
          <DialogDescription>
            {playerName
              ? `Message ${playerName}. They will see it in the app feedback inbox.`
              : "Message this player. They will see it in the app feedback inbox."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="player-send-feedback">Your message</Label>
          <textarea
            id="player-send-feedback"
            rows={5}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2000}
            placeholder="Write a message the player will see in the app…"
            className="flex min-h-[120px] w-full rounded-2xl border border-input bg-[#F1F2F6] px-3.5 py-3 text-sm shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B0A57]/40"
          />
          <p className="text-xs text-muted-foreground">
            {draft.length}/2000
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={sendMutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <LoadingButton
            type="button"
            isLoading={sendMutation.isPending}
            disabled={!canSend}
            onClick={handleSend}
            className="bg-[#2B0A57] text-white hover:bg-[#3A1570]"
          >
            <MessageSquare className="size-4" />
            Send
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
