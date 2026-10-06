import { describe, expect, it } from "vitest";

import {
  isBigGameTerminalStatus,
  resolveBigGameNextRoundStartLabel,
  shouldShowScheduledBigGameCard,
} from "./big-game-round-card";

describe("isBigGameTerminalStatus", () => {
  it("treats FINISHED and NO_WINNER as terminal", () => {
    expect(isBigGameTerminalStatus("FINISHED")).toBe(true);
    expect(isBigGameTerminalStatus("NO_WINNER")).toBe(true);
  });

  it("treats READY/PLAYING/WINNER_WINDOW/null as non-terminal", () => {
    expect(isBigGameTerminalStatus("READY")).toBe(false);
    expect(isBigGameTerminalStatus("PLAYING")).toBe(false);
    expect(isBigGameTerminalStatus("WINNER_WINDOW")).toBe(false);
    expect(isBigGameTerminalStatus(null)).toBe(false);
    expect(isBigGameTerminalStatus(undefined)).toBe(false);
  });
});

describe("shouldShowScheduledBigGameCard", () => {
  // A2: Round 1 FINISHED + Round 2 READY resolvable -> FINISHED Round 1 must
  // not be the primary operational card (Round 2's own card takes over).
  it("hides a FINISHED Round 1 card once Round 2 is resolvable (A2)", () => {
    expect(
      shouldShowScheduledBigGameCard({
        scheduledBigGame: { status: "FINISHED" },
        currentGameIsBigGame: false,
        hasResolvableNextRound: true,
      }),
    ).toBe(false);
  });

  it("hides a NO_WINNER Round card once the next round is resolvable", () => {
    expect(
      shouldShowScheduledBigGameCard({
        scheduledBigGame: { status: "NO_WINNER" },
        currentGameIsBigGame: false,
        hasResolvableNextRound: true,
      }),
    ).toBe(false);
  });

  // A5: Round 2 PLAYING -> currentGame becomes the Big Game live round, so
  // the FINISHED Round 1 schedule snapshot must not render as primary.
  it("hides the card once the current operational game is the Big Game itself (A5)", () => {
    expect(
      shouldShowScheduledBigGameCard({
        scheduledBigGame: { status: "FINISHED" },
        currentGameIsBigGame: true,
        hasResolvableNextRound: false,
      }),
    ).toBe(false);
  });

  // A6: final round FINISHED with nothing next -> still show (final finished
  // Big Game state must remain visible, same as before).
  it("keeps showing a terminal round when no next round is resolvable (A6, final round)", () => {
    expect(
      shouldShowScheduledBigGameCard({
        scheduledBigGame: { status: "FINISHED" },
        currentGameIsBigGame: false,
        hasResolvableNextRound: false,
      }),
    ).toBe(true);
  });

  it("always shows a non-terminal scheduled round (Round 1 schedule, READY, etc.)", () => {
    expect(
      shouldShowScheduledBigGameCard({
        scheduledBigGame: { status: "READY" },
        currentGameIsBigGame: false,
        hasResolvableNextRound: false,
      }),
    ).toBe(true);
  });

  it("hides when there is no scheduled Big Game at all", () => {
    expect(
      shouldShowScheduledBigGameCard({
        scheduledBigGame: null,
        currentGameIsBigGame: false,
        hasResolvableNextRound: false,
      }),
    ).toBe(false);
  });
});

describe("resolveBigGameNextRoundStartLabel", () => {
  // A3: Round 2 (nextRoundRegistration) scheduledStartAt is authoritative.
  it("prefers nextRoundRegistration.scheduledStartAt for Round 1 (A3)", () => {
    const result = resolveBigGameNextRoundStartLabel({
      roundIndex: 1,
      scheduledStartAt: "2026-10-05T21:03:00.000Z",
      nextRoundStartsAt: "2026-10-05T21:47:00.000Z",
      nextRoundRegistration: {
        scheduledStartAt: "2026-10-05T22:12:00.000Z",
      } as never,
    });
    expect(result).toEqual({
      label: "Next round starts",
      value: "2026-10-05T22:12:00.000Z",
    });
  });

  // A4: nextRoundRegistration temporarily missing -> fall back to the
  // mirrored nextRoundStartsAt field, never Round 1's own scheduledStartAt.
  it("falls back to nextRoundStartsAt when nextRoundRegistration is missing (A4)", () => {
    const result = resolveBigGameNextRoundStartLabel({
      roundIndex: 1,
      scheduledStartAt: "2026-10-05T21:03:00.000Z",
      nextRoundStartsAt: "2026-10-05T21:47:00.000Z",
      nextRoundRegistration: null,
    });
    expect(result).toEqual({
      label: "Next round starts",
      value: "2026-10-05T21:47:00.000Z",
    });
  });

  // Explicit regression test for the reported bug: Round 1's own
  // scheduledStartAt must never be shown as "Next round starts".
  it("never shows Round 1's own scheduledStartAt as the next-round time", () => {
    const result = resolveBigGameNextRoundStartLabel({
      roundIndex: 1,
      scheduledStartAt: "2026-10-05T21:03:00.000Z",
      nextRoundStartsAt: null,
      nextRoundRegistration: null,
    });
    expect(result).toBeNull();
  });

  it("shows this round's own scheduledStartAt as 'Play starts' when roundIndex > 1", () => {
    const result = resolveBigGameNextRoundStartLabel({
      roundIndex: 2,
      scheduledStartAt: "2026-10-05T22:12:00.000Z",
      nextRoundStartsAt: null,
      nextRoundRegistration: null,
    });
    expect(result).toEqual({
      label: "Play starts",
      value: "2026-10-05T22:12:00.000Z",
    });
  });

  it("returns null when nothing is scheduled", () => {
    expect(
      resolveBigGameNextRoundStartLabel({
        roundIndex: 1,
        scheduledStartAt: null,
        nextRoundStartsAt: null,
        nextRoundRegistration: null,
      }),
    ).toBeNull();
  });
});
