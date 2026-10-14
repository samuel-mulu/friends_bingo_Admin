/**
 * Resolves the standard-lane registration head for the Games admin surface.
 *
 * When an older backend still parks Big Game in `registrationOpenGame` during
 * multi-day advance registration, a standard READY session may sit in `queue`.
 * Prefer an explicit non–Big Game registrationOpenGame; otherwise promote the
 * first non–Big Game READY queue item for presentation only (no status rewrite).
 */

export type OperationRegistrationCandidate = {
  slotId?: string | null;
  sessionId?: string | null;
  rawStatus?: string | null;
  category?: string | null;
  isBigGame?: boolean | null;
};

function isBigGameItem(
  item: OperationRegistrationCandidate | null | undefined,
): boolean {
  return Boolean(item?.isBigGame || item?.category === "BIG_GAME");
}

export function resolveStandardRegistrationOpenGame<
  T extends OperationRegistrationCandidate,
>(
  registrationOpenGame: T | null | undefined,
  queue: T[] | null | undefined,
): T | null {
  if (registrationOpenGame != null && !isBigGameItem(registrationOpenGame)) {
    return registrationOpenGame;
  }

  const readyHead = (queue ?? []).find(
    (item) => !isBigGameItem(item) && item.rawStatus === "READY",
  );
  return readyHead ?? null;
}
