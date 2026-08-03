import type { GameOperationItem } from "@/lib/api/admin";

export type WinnerWindowPreviewCartela = {
  sessionId: string;
  cartelaNumber: number;
  claimId?: string | null;
  gameCartelaId?: string | null;
};

export type WinnerWindowPreviewBySession = Record<
  string,
  WinnerWindowPreviewCartela[]
>;

export type WinnerWindowDisplay =
  | {
      mode: "canonical";
      canonical: NonNullable<GameOperationItem["winnerPayoutsSummary"]>;
      preview: [];
    }
  | {
      mode: "preview";
      canonical: [];
      preview: WinnerWindowPreviewCartela[];
    }
  | {
      mode: "empty";
      canonical: [];
      preview: [];
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getPreviewIdentity(
  entry: WinnerWindowPreviewCartela,
): string | number | null {
  if (entry.claimId) {
    return `claim:${entry.claimId}`;
  }

  if (entry.gameCartelaId) {
    return `cartela:${entry.gameCartelaId}`;
  }

  return `${entry.sessionId}:${entry.cartelaNumber}`;
}

export function extractWinnerWindowPreviewCartela(
  payload: unknown,
): WinnerWindowPreviewCartela | null {
  const record = asRecord(payload);

  if (
    !record ||
    typeof record.sessionId !== "string" ||
    typeof record.cartelaNumber !== "number"
  ) {
    return null;
  }

  return {
    sessionId: record.sessionId,
    cartelaNumber: record.cartelaNumber,
    claimId: typeof record.claimId === "string" ? record.claimId : null,
    gameCartelaId:
      typeof record.gameCartelaId === "string" ? record.gameCartelaId : null,
  };
}

export function mergeWinnerWindowPreviewCartelas(
  current: WinnerWindowPreviewCartela[],
  incoming: WinnerWindowPreviewCartela,
): WinnerWindowPreviewCartela[] {
  const incomingIdentity = getPreviewIdentity(incoming);
  let didReplace = false;

  const merged = current.map((entry) => {
    if (getPreviewIdentity(entry) !== incomingIdentity) {
      return entry;
    }

    didReplace = true;
    return {
      ...entry,
      ...incoming,
    };
  });

  const next = didReplace ? merged : [...merged, incoming];
  return [...next].sort((left, right) => left.cartelaNumber - right.cartelaNumber);
}

export function addWinnerWindowPreviewCartela(
  current: WinnerWindowPreviewBySession,
  incoming: WinnerWindowPreviewCartela,
): WinnerWindowPreviewBySession {
  const existing = current[incoming.sessionId] ?? [];
  const nextEntries = mergeWinnerWindowPreviewCartelas(existing, incoming);

  if (
    existing.length === nextEntries.length &&
    existing.every((entry, index) => {
      const nextEntry = nextEntries[index];
      return (
        nextEntry != null &&
        entry.sessionId === nextEntry.sessionId &&
        entry.cartelaNumber === nextEntry.cartelaNumber &&
        entry.claimId === nextEntry.claimId &&
        entry.gameCartelaId === nextEntry.gameCartelaId
      );
    })
  ) {
    return current;
  }

  return {
    ...current,
    [incoming.sessionId]: nextEntries,
  };
}

export function clearWinnerWindowPreviewSession(
  current: WinnerWindowPreviewBySession,
  sessionId: string | null | undefined,
): WinnerWindowPreviewBySession {
  if (!sessionId || !(sessionId in current)) {
    return current;
  }

  const next = { ...current };
  delete next[sessionId];
  return next;
}

export function resolveWinnerWindowDisplay(params: {
  canonical: GameOperationItem["winnerPayoutsSummary"] | undefined;
  preview: WinnerWindowPreviewCartela[] | undefined;
}): WinnerWindowDisplay {
  const canonical = params.canonical ?? [];
  if (canonical.length > 0) {
    return {
      mode: "canonical",
      canonical,
      preview: [],
    };
  }

  const preview = params.preview ?? [];
  if (preview.length > 0) {
    return {
      mode: "preview",
      canonical: [],
      preview,
    };
  }

  return {
    mode: "empty",
    canonical: [],
    preview: [],
  };
}
