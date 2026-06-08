import { apiPaginatedRequest, apiRequest } from "@/lib/api/client";
import type {
  AdminBingoClaim,
  AdminGame,
  AdminDeposit,
  AdminSession,
  AdminUserDetail,
  AdminUserListItem,
  AdminWithdrawal,
  CalledNumbersResponse,
  CallNumberPayload,
  CreateGamePayload,
  FinancialReport,
  GameRuleSummary,
  GamesReport,
  LoginPayload,
  OverviewReport,
  ReportDateRangeParams,
  UpdateGameStatusPayload,
} from "@/lib/api/types";

export function loginAdmin(payload: LoginPayload) {
  return apiRequest<AdminSession>({
    url: "/auth/login",
    method: "POST",
    data: payload,
  });
}

export function getOverviewReport() {
  return apiRequest<OverviewReport>({
    url: "/admin/reports/overview",
    method: "GET",
  });
}

export function getFinancialReport(params: ReportDateRangeParams) {
  return apiRequest<FinancialReport>({
    url: "/admin/reports/financial",
    method: "GET",
    params,
  });
}

export function getGamesReport(params: ReportDateRangeParams) {
  return apiRequest<GamesReport>({
    url: "/admin/reports/games",
    method: "GET",
    params,
  });
}

// CANONICAL SOURCE OF TRUTH - Both Admin and Flutter use this
// Backend decides which game is live/checking/registration/queue
// Frontend must NOT apply additional filtering/sorting
export interface GameOperationItem {
  slotId: string;
  sessionId: string | null;
  staticCode: string;
  playCode: string | null;
  rawStatus: string;
  playerStatus:
    | 'registrationOpen'
    | 'playing'
    | 'winnerWindow'
    | 'checking'
    | 'finished'
    | 'cancelled';
  operationStatus: 'live' | 'checking' | 'registration' | 'queue';
  gameRule: { id: string; name: string; key: string } | null;
  entryFee: string;
  prizePerCartela: string;
  prizeAmount: string;
  companyRevenue?: string;
  registeredCartelasCount: number;
  calledNumbersCount: number;
  sortOrder: number | null;
  winnerCartelaId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  registrationOpen: boolean;
  canStart: boolean;
  canRegister: boolean;
  canCallNumber: boolean;
  canClaimBingo: boolean;
  winnerWindowStartedAt?: string | null;
  winnerWindowEndsAt?: string | null;
  winnerCartelasSummary?: Array<{
    gameCartelaId: string;
    cartelaId: string;
    cartelaNumber: number;
  }>;
  winnerPayoutsSummary?: Array<{
    cartelaId: string;
    cartelaNumber: number;
    amount: string;
    owner?: "ME" | "OTHER";
  }>;
  latestCalledNumber?: {
    letter: string;
    number: number;
    order: number;
  } | null;
  autoCallEnabled?: boolean;
  autoCallIntervalMs?: number;
}

export interface GameOperationsCurrentResponse {
  liveGame: GameOperationItem | null;
  checkingGame: GameOperationItem | null;
  registrationOpenGame: GameOperationItem | null;
  queue: GameOperationItem[];
  timestamp: string;
}

export function getCurrentGameOperations() {
  return apiRequest<GameOperationsCurrentResponse>({
    url: "/games/operations/current",
    method: "GET",
  });
}

export function getAdminDeposits(page = 1, pageSize = 20) {
  return apiPaginatedRequest<AdminDeposit>({
    url: "/admin/deposits",
    method: "GET",
    params: { page, pageSize },
  });
}

export function approveDeposit(depositId: string) {
  return apiRequest<AdminDeposit>({
    url: `/admin/deposits/${depositId}/approve`,
    method: "PATCH",
  });
}

export function rejectDeposit(depositId: string, rejectionReason: string) {
  return apiRequest<AdminDeposit>({
    url: `/admin/deposits/${depositId}/reject`,
    method: "PATCH",
    data: { rejectionReason },
  });
}

export function getAdminWithdrawals(page = 1, pageSize = 20) {
  return apiPaginatedRequest<AdminWithdrawal>({
    url: "/admin/withdrawals",
    method: "GET",
    params: { page, pageSize },
  });
}

export function approveWithdrawal(withdrawalId: string) {
  return apiRequest<AdminWithdrawal>({
    url: `/admin/withdrawals/${withdrawalId}/approve`,
    method: "PATCH",
  });
}

export function rejectWithdrawal(withdrawalId: string, adminNote: string) {
  return apiRequest<AdminWithdrawal>({
    url: `/admin/withdrawals/${withdrawalId}/reject`,
    method: "PATCH",
    data: { adminNote },
  });
}

export function markWithdrawalPaid(withdrawalId: string, payoutRef?: string) {
  return apiRequest<AdminWithdrawal>({
    url: `/admin/withdrawals/${withdrawalId}/mark-paid`,
    method: "PATCH",
    data: { payoutRef: payoutRef?.trim() || undefined },
  });
}

export function getAdminUsers(page = 1, pageSize = 20) {
  return apiPaginatedRequest<AdminUserListItem>({
    url: "/admin/users",
    method: "GET",
    params: { page, pageSize },
  });
}

export function getAdminUserById(userId: string) {
  return apiRequest<AdminUserDetail>({
    url: `/admin/users/${userId}`,
    method: "GET",
  });
}

export function getAdminGameRules() {
  return apiRequest<GameRuleSummary[]>({
    url: "/admin/game-rules",
    method: "GET",
  });
}

export function getAdminGames(page = 1, pageSize = 20) {
  // New architecture: games are queued as slots
  return apiPaginatedRequest<AdminGame>({
    url: "/admin/slots",
    method: "GET",
    params: { page, pageSize },
  });
}

export function createAdminGame(payload: CreateGamePayload) {
  // New architecture: create a slot from a game rule id only
  return apiRequest<AdminGame>({
    url: "/admin/slots",
    method: "POST",
    data: { gameRuleId: payload.gameRuleId },
  });
}

export function updateAdminGameStatus(
  gameId: string,
  payload: UpdateGameStatusPayload,
) {
  // New architecture: update slot status
  return apiRequest<AdminGame>({
    url: `/admin/slots/${gameId}/status`,
    method: "PATCH",
    data: payload,
  });
}

export function updateAdminSlotEntryFee(gameId: string, entryFee: string) {
  return apiRequest<AdminGame>({
    url: `/admin/slots/${gameId}/entry-fee`,
    method: "PATCH",
    data: { entryFee },
  });
}

export interface StartAdminGamePayload {
  entryFee?: string;
  prizePerCartela?: string;
  companyFeePerCartela?: string;
}

export function startAdminGame(
  gameId: string,
  payload?: StartAdminGamePayload,
) {
  // New architecture: start a session from a slot
  return apiRequest<AdminGame>({
    url: `/admin/slots/${gameId}/start`,
    method: "POST",
    data: payload,
  });
}

export function reorderAdminSlots(slotIds: string[]) {
  return apiRequest<{ success: true }>({
    url: "/admin/slots/reorder",
    method: "POST",
    data: { slotIds },
  });
}

export function cancelBlockingSession(sessionId: string) {
  return apiRequest<{ success: true; sessionId: string }>({
    url: `/admin/sessions/${sessionId}/cancel`,
    method: "PATCH",
  });
}

export function startSessionAutoCall(sessionId: string) {
  return apiRequest<{ success: true; sessionId: string; autoCallEnabled: true }>({
    url: `/admin/sessions/${sessionId}/auto-call/start`,
    method: "POST",
  });
}

export function stopSessionAutoCall(sessionId: string) {
  return apiRequest<{ success: true; sessionId: string; autoCallEnabled: false }>({
    url: `/admin/sessions/${sessionId}/auto-call/stop`,
    method: "POST",
  });
}

export function callAdminGameNumber(
  sessionId: string,
  payload: CallNumberPayload,
) {
  // New architecture: calling numbers targets a session
  return apiRequest({
    url: `/admin/sessions/${sessionId}/call-number`,
    method: "POST",
    data: payload,
  });
}

export function getGameDetail(slotId: string) {
  // Public endpoint for slot detail
  return apiRequest<AdminGame>({
    url: `/games/slots/${slotId}`,
    method: "GET",
  });
}

export function getGameCalledNumbers(sessionId: string) {
  // Public endpoint for session called numbers
  return apiRequest<CalledNumbersResponse>({
    url: `/games/sessions/${sessionId}/called-numbers`,
    method: "GET",
  });
}

export function getAdminBingoClaims(page = 1, pageSize = 20) {
  return apiPaginatedRequest<AdminBingoClaim>({
    url: "/admin/bingo-claims",
    method: "GET",
    params: { page, pageSize },
  });
}

export function approveAdminBingoClaim(claimId: string) {
  return apiRequest<AdminBingoClaim>({
    url: `/admin/bingo-claims/${claimId}/approve`,
    method: "PATCH",
  });
}

export function rejectAdminBingoClaim(claimId: string, reason: string) {
  return apiRequest<AdminBingoClaim>({
    url: `/admin/bingo-claims/${claimId}/reject`,
    method: "PATCH",
    data: { reason },
  });
}
