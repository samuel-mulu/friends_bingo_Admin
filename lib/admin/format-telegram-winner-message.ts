import type { GamesReportWinner } from "@/lib/api/types";
import { formatCurrency, formatDateTime } from "@/lib/formatters";

/** Mask exactly three digits in the middle of a phone number for community posts. */
export function maskPhoneMiddleThree(phone: string | null | undefined): string {
  if (!phone?.trim()) {
    return "—";
  }

  const trimmed = phone.trim();
  const digitIndexes: number[] = [];
  for (let i = 0; i < trimmed.length; i += 1) {
    if (/\d/.test(trimmed[i]!)) {
      digitIndexes.push(i);
    }
  }

  if (digitIndexes.length < 6) {
    return trimmed;
  }

  const startDigit = Math.floor((digitIndexes.length - 3) / 2);
  const maskIndexes = new Set(
    digitIndexes.slice(startDigit, startDigit + 3),
  );

  return [...trimmed]
    .map((char, index) => (maskIndexes.has(index) ? "*" : char))
    .join("");
}

function circleNumber(index: number): string {
  const circles = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  return circles[index] ?? `${index + 1}.`;
}

function categoryOf(winner: GamesReportWinner): string {
  return String(winner.category ?? "").toUpperCase();
}

function isBigGameWinner(winner: GamesReportWinner): boolean {
  return categoryOf(winner) === "BIG_GAME";
}

function isChainGameWinner(winner: GamesReportWinner): boolean {
  return categoryOf(winner) === "CHAIN_GAME";
}

/**
 * Telegram-ready plain text for community posts.
 * Uses emoji + spacing so it pastes cleanly (no bot parse-mode needed).
 */
export function formatTelegramWinnerMessage(
  winners: GamesReportWinner[],
): string {
  if (winners.length === 0) {
    return "";
  }

  const first = winners[0]!;
  const finished = formatDateTime(first.finishedAt);
  const divider = "────────────────────";
  const bigGame = isBigGameWinner(first);
  const chainGame = isChainGameWinner(first);
  const roundIndex = first.roundIndex ?? 1;
  const roundCount = first.roundCount ?? 1;

  if (chainGame) {
    return formatChainGameMessage(winners, {
      finished,
      divider,
      roundCount,
    });
  }

  const sessionPrize =
    first.sessionPrizeAmount ??
    (winners.length === 1 ? first.prizeAmount : null);
  const moreRoundsRemain = bigGame && roundIndex < roundCount;

  const header = bigGame
    ? [
        "🏆  FRIENDS BINGO — BIG GAME WINNER",
        "",
        `🎱  Game: ${first.gameName}`,
        `🔁  Round ${roundIndex} of ${roundCount}`,
        `📅  Finished: ${finished}`,
      ]
    : [
        "🏆  FRIENDS BINGO — WINNER",
        "",
        `🎱  Game: ${first.gameName}`,
        `📅  Finished: ${finished}`,
      ];

  if (sessionPrize && winners.length > 1) {
    header.push(`💎  Prize pool: ${formatCurrency(sessionPrize)}`);
  }

  const winnerBlocks = winners.map((winner, index) =>
    formatWinnerBlock(
      winner,
      winners.length === 1 ? "👑  Winner" : `${circleNumber(index)}  Winner`,
    ),
  );

  const footer = moreRoundsRemain
    ? "✨  Winners advance — next round registration is open! 🎉"
    : winners.length > 1
      ? "✨  Congratulations to all winners! 🎉"
      : "✨  Congratulations! 🎉";

  return [
    ...header,
    "",
    divider,
    "",
    winnerBlocks.join("\n\n"),
    "",
    divider,
    "",
    footer,
  ].join("\n");
}

function formatWinnerBlock(winner: GamesReportWinner, label: string): string {
  const name = winner.winnerUser?.fullName?.trim() || "Unknown player";
  const phone = maskPhoneMiddleThree(winner.winnerUser?.phoneNumber);
  const cartela =
    winner.cartelaNumber != null ? `#${winner.cartelaNumber}` : "—";

  return [
    label,
    `👤  ${name}`,
    `📱  ${phone}`,
    `🎫  Cartela ${cartela}`,
    `💰  ${formatCurrency(winner.prizeAmount)}`,
  ].join("\n");
}

/**
 * Chain Game posts cover the whole session: every round played inside one draw,
 * so the message lists rounds in order rather than a single winner block.
 * A chain only reaches the report once it is finished, so a highest round below
 * `roundCount` means the remaining rounds were forfeited on a no-winner.
 */
function formatChainGameMessage(
  winners: GamesReportWinner[],
  options: { finished: string; divider: string; roundCount: number },
): string {
  const { finished, divider, roundCount } = options;
  const first = winners[0]!;

  const byRound = new Map<number, GamesReportWinner[]>();
  for (const winner of winners) {
    const round = winner.roundIndex ?? 1;
    const existing = byRound.get(round);
    if (existing) {
      existing.push(winner);
    } else {
      byRound.set(round, [winner]);
    }
  }

  const rounds = [...byRound.entries()].sort(([a], [b]) => a - b);
  const totalPaid = winners.reduce(
    (total, winner) => total + Number(winner.prizeAmount ?? 0),
    0,
  );

  const header = [
    "🏆  FRIENDS BINGO — CHAIN GAME WINNERS",
    "",
    `🎱  Game: ${first.gameName}`,
    `🔗  ${rounds.length} of ${roundCount} rounds played`,
    `📅  Finished: ${finished}`,
    `💎  Paid out: ${formatCurrency(totalPaid.toFixed(2))}`,
  ];

  const roundBlocks = rounds.map(([round, roundWinners]) => {
    const roundPrize = roundWinners[0]?.sessionPrizeAmount;
    const title = roundPrize
      ? `🔁  Round ${round} of ${roundCount} · ${formatCurrency(roundPrize)}`
      : `🔁  Round ${round} of ${roundCount}`;

    return [
      title,
      ...roundWinners.map((winner, index) =>
        formatWinnerBlock(
          winner,
          roundWinners.length === 1
            ? "👑  Winner"
            : `${circleNumber(index)}  Winner`,
        ),
      ),
    ].join("\n\n");
  });

  const roundsForfeited = rounds.length < roundCount;
  const footer = roundsForfeited
    ? `✨  The chain ended early — rounds ${rounds.length + 1}–${roundCount} were not played. 🎉`
    : "✨  Congratulations to all winners! 🎉";

  return [
    ...header,
    "",
    divider,
    "",
    roundBlocks.join(`\n\n${divider}\n\n`),
    "",
    divider,
    "",
    footer,
  ].join("\n");
}
