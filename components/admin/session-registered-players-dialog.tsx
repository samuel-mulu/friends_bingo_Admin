"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Phone } from "lucide-react";

import { getSessionRegisteredPlayers } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SessionRegisteredPlayersDialog({
  sessionId,
  label,
  open,
  onOpenChange,
}: {
  sessionId: string | null;
  label?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const playersQuery = useQuery({
    queryKey: ["admin", "session-registered-players", sessionId],
    queryFn: () => getSessionRegisteredPlayers(sessionId as string),
    enabled: open && Boolean(sessionId),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Registered players</DialogTitle>
          <DialogDescription>
            {label ? `Cartelas for ${label}` : "Players and their registered cartelas"}
            {playersQuery.data
              ? ` · ${playersQuery.data.playersCount} player${
                  playersQuery.data.playersCount === 1 ? "" : "s"
                } · ${playersQuery.data.registeredCartelasCount} cartela${
                  playersQuery.data.registeredCartelasCount === 1 ? "" : "s"
                }`
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {playersQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading players…
            </div>
          ) : playersQuery.isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {getApiErrorMessage(playersQuery.error) ||
                "Could not load registered players."}
            </div>
          ) : !playersQuery.data?.players.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No cartelas registered for this game.
            </div>
          ) : (
            <ul className="space-y-3">
              {playersQuery.data.players.map((player) => (
                <li
                  key={player.userId}
                  className="rounded-xl border bg-muted/20 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {player.fullName || "Unknown player"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span className="truncate">{player.phoneNumber}</span>
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {player.cartelas.length} cartela
                      {player.cartelas.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {player.cartelas.map((cartela) => (
                      <Badge
                        key={cartela.gameCartelaId}
                        variant="outline"
                        className="font-mono tabular-nums"
                      >
                        #{cartela.cartelaNumber}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
