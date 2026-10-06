import type { CurrentBigGameResponse } from "@/lib/api/admin";

const TERMINAL_BIG_GAME_STATUSES = new Set<string>(["FINISHED", "NO_WINNER"]);

export function isBigGameTerminalStatus(
  status: string | null | undefined,
): boolean {
  return Boolean(status && TERMINAL_BIG_GAME_STATUSES.has(status));
}

/**
 * Whether the `/big-game/current` snapshot should render as the primary
 * operational Big Game card.
 *
 * After a round finishes, the stale FINISHED/NO_WINNER round must stop being
 * the primary operational card once a next round is resolvable (READY or
 * already live) — that next round's own card takes over as primary. The
 * finished round stays available via history/report, not here. A
 * non-terminal scheduledBigGame (e.g. Round 1 schedule, or any READY/live
 * round) always shows normally.
 */
export function shouldShowScheduledBigGameCard(params: {
  scheduledBigGame: Pick<CurrentBigGameResponse, "status"> | null | undefined;
  currentGameIsBigGame: boolean;
  hasResolvableNextRound: boolean;
}): boolean {
  if (!params.scheduledBigGame || params.currentGameIsBigGame) {
    return false;
  }
  if (
    isBigGameTerminalStatus(params.scheduledBigGame.status) &&
    params.hasResolvableNextRound
  ) {
    return false;
  }
  return true;
}

export type BigGameNextRoundStartLabel = {
  label: "Play starts" | "Next round starts";
  value: string;
};

/**
 * Resolves the "Play starts" / "Next round starts" row on the scheduled Big
 * Game card.
 *
 * Round 1 (roundIndex <= 1) must never show its own `scheduledStartAt` as
 * "Next round starts" — that field is Round 1's own play-start time, not
 * Round 2's. Precedence for the next round's start time: the attached
 * `nextRoundRegistration.scheduledStartAt` (Round N+1's own schedule) first,
 * then the mirrored `nextRoundStartsAt` fallback. Never falls back to this
 * round's own `scheduledStartAt`.
 */
export function resolveBigGameNextRoundStartLabel(
  scheduledBigGame: Pick<
    CurrentBigGameResponse,
    | "roundIndex"
    | "scheduledStartAt"
    | "nextRoundStartsAt"
    | "nextRoundRegistration"
  >,
): BigGameNextRoundStartLabel | null {
  const roundIndex = scheduledBigGame.roundIndex ?? 1;

  if (roundIndex > 1) {
    return scheduledBigGame.scheduledStartAt
      ? { label: "Play starts", value: scheduledBigGame.scheduledStartAt }
      : null;
  }

  const nextStart =
    scheduledBigGame.nextRoundRegistration?.scheduledStartAt ??
    scheduledBigGame.nextRoundStartsAt ??
    null;

  return nextStart ? { label: "Next round starts", value: nextStart } : null;
}
