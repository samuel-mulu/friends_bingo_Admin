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
  const sessionPrize =
    first.sessionPrizeAmount ??
    (winners.length === 1 ? first.prizeAmount : null);
  const finished = formatDateTime(first.finishedAt);
  const divider = "────────────────────";

  const header = [
    "🏆  FRIENDS BINGO — WINNER",
    "",
    `🎱  Game: ${first.gameName}`,
    `📅  Finished: ${finished}`,
  ];

  if (sessionPrize && winners.length > 1) {
    header.push(`💎  Prize pool: ${formatCurrency(sessionPrize)}`);
  }

  const winnerBlocks = winners.map((winner, index) => {
    const name = winner.winnerUser?.fullName?.trim() || "Unknown player";
    const phone = maskPhoneMiddleThree(winner.winnerUser?.phoneNumber);
    const cartela =
      winner.cartelaNumber != null ? `#${winner.cartelaNumber}` : "—";
    const label =
      winners.length === 1 ? "👑  Winner" : `${circleNumber(index)}  Winner`;

    return [
      label,
      `👤  ${name}`,
      `📱  ${phone}`,
      `🎫  Cartela ${cartela}`,
      `💰  ${formatCurrency(winner.prizeAmount)}`,
    ].join("\n");
  });

  const footer =
    winners.length > 1
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
