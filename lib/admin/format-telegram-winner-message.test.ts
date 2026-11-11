import { describe, expect, it } from "vitest";

import type { GamesReportWinner } from "../api/types";
import { formatCurrency } from "../formatters";

import { formatTelegramWinnerMessage } from "./format-telegram-winner-message";

function winner(
  overrides: Partial<GamesReportWinner> & Pick<GamesReportWinner, "gameName">,
): GamesReportWinner {
  return {
    gameId: "session-1",
    gameCode: "BINGO-BHQ4XE",
    gameType: "TWO_LINES",
    category: "CHAIN_GAME",
    roundIndex: 1,
    roundCount: 3,
    finishedAt: "2026-11-11T05:00:00.000Z",
    prizeAmount: "100.00",
    sessionPrizeAmount: "200.00",
    winnersInGame: 1,
    winnerCartelaId: "cartela-1",
    winnerUser: {
      id: "user-1",
      fullName: "Abebe Kebede",
      phoneNumber: "0912345678",
      role: "PLAYER",
      status: "ACTIVE",
      createdAt: "2026-11-11T05:00:00.000Z",
      updatedAt: "2026-11-11T05:00:00.000Z",
    },
    cartelaNumber: 12,
    ...overrides,
  };
}

describe("formatTelegramWinnerMessage chain rules", () => {
  it("names the rule played in each chain round", () => {
    const message = formatTelegramWinnerMessage([
      winner({ gameName: "2 Lines", roundIndex: 1, gameType: "TWO_LINES" }),
      winner({
        gameName: "Full House",
        gameType: "FULL_HOUSE",
        roundIndex: 2,
        prizeAmount: "150.00",
        sessionPrizeAmount: "300.00",
        winnerCartelaId: "cartela-2",
        cartelaNumber: 18,
      }),
    ]);

    expect(message).toContain(
      `🔁  Round 1 of 3 · 2 Lines · ${formatCurrency("200.00")}`,
    );
    expect(message).toContain(
      `🔁  Round 2 of 3 · Full House · ${formatCurrency("300.00")}`,
    );
    expect(message).toContain("🎱  Game: 2 Lines");
    expect(message).toContain("👑  Winner");
  });

  it("keeps the old round line when a chain round has no rule name", () => {
    const message = formatTelegramWinnerMessage([
      winner({ gameName: "   ", roundIndex: 1, sessionPrizeAmount: "200.00" }),
    ]);

    expect(message).toContain(
      `🔁  Round 1 of 3 · ${formatCurrency("200.00")}`,
    );
    expect(message).not.toContain("Round 1 of 3 ·  ·");
  });

  it("leaves a normal game post on the single game title", () => {
    const message = formatTelegramWinnerMessage([
      winner({
        gameName: "2 Lines",
        gameType: "TWO_LINES",
        category: "NORMAL",
        roundCount: 1,
      }),
    ]);

    expect(message).toContain("🎱  Game: 2 Lines");
    expect(message).not.toContain("Round 1 of");
    expect(message).not.toContain("CHAIN GAME");
  });
});
