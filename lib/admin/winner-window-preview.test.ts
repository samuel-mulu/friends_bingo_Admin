import { describe, expect, it } from "vitest";

import {
  addWinnerWindowPreviewCartela,
  clearWinnerWindowPreviewSession,
  extractWinnerWindowPreviewCartela,
  resolveWinnerWindowDisplay,
  type WinnerWindowPreviewBySession,
} from "./winner-window-preview";

describe("winner-window-preview", () => {
  it("extracts preview winner cartela data from winner-window socket payloads", () => {
    expect(
      extractWinnerWindowPreviewCartela({
        sessionId: "session-1",
        cartelaNumber: 42,
        claimId: "claim-1",
        gameCartelaId: "game-cartela-1",
      }),
    ).toEqual({
      sessionId: "session-1",
      cartelaNumber: 42,
      claimId: "claim-1",
      gameCartelaId: "game-cartela-1",
    });
  });

  it("dedupes repeated winner-window events by claim id", () => {
    const initial: WinnerWindowPreviewBySession = {};

    const withFirst = addWinnerWindowPreviewCartela(initial, {
      sessionId: "session-1",
      cartelaNumber: 42,
      claimId: "claim-1",
      gameCartelaId: "game-cartela-1",
    });

    const withDuplicate = addWinnerWindowPreviewCartela(withFirst, {
      sessionId: "session-1",
      cartelaNumber: 42,
      claimId: "claim-1",
      gameCartelaId: "game-cartela-1",
    });

    expect(withDuplicate["session-1"]).toEqual([
      {
        sessionId: "session-1",
        cartelaNumber: 42,
        claimId: "claim-1",
        gameCartelaId: "game-cartela-1",
      },
    ]);
  });

  it("keeps multiple winner-window preview cartelas sorted by cartela number", () => {
    const withFirst = addWinnerWindowPreviewCartela({}, {
      sessionId: "session-1",
      cartelaNumber: 58,
      claimId: "claim-2",
    });

    const withSecond = addWinnerWindowPreviewCartela(withFirst, {
      sessionId: "session-1",
      cartelaNumber: 7,
      claimId: "claim-1",
    });

    expect(withSecond["session-1"]?.map((entry) => entry.cartelaNumber)).toEqual(
      [7, 58],
    );
  });

  it("prefers canonical payout winners over preview winners", () => {
    const display = resolveWinnerWindowDisplay({
      canonical: [
        {
          cartelaId: "cartela-1",
          cartelaNumber: 42,
          amount: "16.00",
        },
      ],
      preview: [
        {
          sessionId: "session-1",
          cartelaNumber: 42,
          claimId: "claim-1",
        },
      ],
    });

    expect(display.mode).toBe("canonical");
    expect(display.canonical).toHaveLength(1);
    expect(display.preview).toEqual([]);
  });

  it("falls back to preview winners when canonical payout summary is still empty", () => {
    const display = resolveWinnerWindowDisplay({
      canonical: [],
      preview: [
        {
          sessionId: "session-1",
          cartelaNumber: 42,
          claimId: "claim-1",
        },
      ],
    });

    expect(display.mode).toBe("preview");
    expect(display.preview).toHaveLength(1);
    expect(display.canonical).toEqual([]);
  });

  it("clears preview winners for a finished or replaced session", () => {
    const state = addWinnerWindowPreviewCartela({}, {
      sessionId: "session-1",
      cartelaNumber: 42,
      claimId: "claim-1",
    });

    expect(clearWinnerWindowPreviewSession(state, "session-1")).toEqual({});
  });
});
