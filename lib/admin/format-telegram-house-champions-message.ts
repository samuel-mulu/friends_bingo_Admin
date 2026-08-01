import type { HouseChampionsEntry, HouseChampionsResponse } from "@/lib/api/types";
import { maskPhoneMiddleThree } from "@/lib/admin/format-telegram-winner-message";

function circleNumber(rank: number): string {
  const circles = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  return circles[rank - 1] ?? `${rank}.`;
}

function periodTitle(response: HouseChampionsResponse): string {
  if (response.labelStart && response.labelEnd && response.labelStart !== response.labelEnd) {
    return `${response.labelStart} – ${response.labelEnd}`;
  }

  if (response.labelStart) {
    return response.labelStart;
  }

  switch (response.period) {
    case "today":
      return "Today";
    case "week":
      return "This week";
    case "last_week":
      return "Last week";
    case "last_30_days":
      return "Last 30 days";
    case "all_time":
      return "All time";
    default:
      return "House Champions";
  }
}

function formatEntryBlock(entry: HouseChampionsEntry): string {
  const name = entry.fullName?.trim() || entry.displayName?.trim() || "Player";
  const phone = maskPhoneMiddleThree(entry.phoneNumber);
  const winsLine =
    entry.gamesWon > 0
      ? `🎫  ${entry.cartelaWins} cartela wins · ${entry.gamesWon} games`
      : `🎫  ${entry.cartelaWins} cartela wins`;

  return [
    `${circleNumber(entry.rank)}  ${name}`,
    `📱  ${phone}`,
    winsLine,
  ].join("\n");
}

/**
 * Telegram-ready plain text for House Champions community posts.
 */
export function formatTelegramHouseChampionsMessage(
  response: HouseChampionsResponse,
): string {
  if (!response.entries.length) {
    return "";
  }

  const divider = "────────────────────";
  const period = periodTitle(response);

  const header = [
    "🏆  FRIENDS BINGO — HOUSE CHAMPIONS",
    "",
    `📅  Period: ${period}`,
    "📊  Ranked by winning cartelas",
  ];

  const blocks = response.entries.map((entry) => formatEntryBlock(entry));

  return [
    ...header,
    "",
    divider,
    "",
    blocks.join("\n\n"),
    "",
    divider,
    "",
    "✨  Congratulations to our top players! Keep climbing the board. 🎉",
  ].join("\n");
}
