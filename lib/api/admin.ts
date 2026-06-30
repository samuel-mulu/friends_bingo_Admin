import { apiPaginatedRequest, apiRequest } from "@/lib/api/client";
import type {
  AdminBingoClaim,
  AdminBroadcast,
  AdminExpense,
  AdminGame,
  AdminDeposit,
  AdminSession,
  AdminUserDetail,
  AdminUserListItem,
  AdminWithdrawal,
  CreateExpensePayload,
  CreateAdminBroadcastPayload,
  CalledNumbersResponse,
  CallNumberPayload,
  CreateGamePayload,
  FinancialReport,
  GameRuleSummary,
  GamesReport,
  LoginPayload,
  GameTimingConfig,
  OverviewReport,
  ReportDateRangeParams,
  UpdateGameStatusPayload,
  UpdateGameTimingConfigPayload,
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

export function createAdminExpense(payload: CreateExpensePayload) {
  return apiRequest<AdminExpense>({
    url: "/admin/expenses",
    method: "POST",
    data: payload,
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
    | "registrationOpen"
    | "playing"
    | "winnerWindow"
    | "checking"
    | "finished"
    | "cancelled";
  operationStatus: "live" | "checking" | "registration" | "queue";
  gameRule: { id: string; name: string; key: string } | null;
  category: "NORMAL" | "BONUS" | "BIG_GOTD" | "BIG_GAME";
  isBonus: boolean;
  isBigGame?: boolean;
  fixedPrizeAmount?: string | null;
  maxCartelasPerPlayer?: number | null;
  entryFee: string;
  prizePerCartela: string;
  prizeAmount: string;
  companyRevenue?: string;
  registeredCartelasCount: number;
  calledNumbersCount: number;
  sortOrder: number | null;
  operationMode: "MANUAL" | "AUTO";
  registrationDurationSeconds: number | null;
  autoCallIntervalSeconds: number | null;
  scheduledStartAt: string | null;
  canStart: boolean;
  canRegister: boolean;
  canCallNumber: boolean;
  winnerWindowEndsAt?: string | null;
  noWinnerGraceEndsAt?: string | null;
  noWinnerReason?: string | null;
  sessionOutcomeSummary?: {
    winnerCartelaNumbers: number[];
    blockedCartelaNumbers: number[];
  };
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
  nextAutoCallAt?: string | null;
}

export interface GameOperationsCurrentResponse {
  liveGame: GameOperationItem | null;
  checkingGame: GameOperationItem | null;
  registrationOpenGame: GameOperationItem | null;
  queue: GameOperationItem[];
  timestamp: string;
  serverNow?: string;
}

export function getCurrentGameOperations() {
  return apiRequest<GameOperationsCurrentResponse>({
    url: "/games/operations/current",
    method: "GET",
  });
}

export interface CurrentBigGameResponse {
  sessionId: string;
  gameSlotId: string;
  staticCode: string;
  playCode: string | null;
  name: string;
  status: string;
  category: "BIG_GAME";
  entryFee: string;
  prizeAmount: string;
  fixedPrizeAmount: string | null;
  registeredCartelasCount: number;
  registrationOpensAt: string | null;
  scheduledStartAt: string | null;
}

export function getCurrentBigGame() {
  return apiRequest<CurrentBigGameResponse | null>({
    url: "/games/big-game/current",
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

export function approveWithdrawal(
  withdrawalId: string,
  payoutTransactionUrl: string,
) {
  return apiRequest<AdminWithdrawal>({
    url: `/admin/withdrawals/${withdrawalId}/approve`,
    method: "PATCH",
    data: { payoutTransactionUrl: payoutTransactionUrl.trim() },
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

export function getAdminUsers(
  page = 1,
  pageSize = 20,
  role?: "ADMIN" | "PLAYER",
) {
  return apiPaginatedRequest<AdminUserListItem>({
    url: "/admin/users",
    method: "GET",
    params: { page, pageSize, role },
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

export function createAdminGame(payload: CreateGamePayload) {
  return apiRequest<AdminGame>({
    url: "/admin/slots",
    method: "POST",
    data: payload,
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

export interface UpdateBigGameSchedulePayload {
  registrationOpensAt?: string;
  playStartAt?: string;
}

export function updateAdminBigGameSchedule(
  slotId: string,
  payload: UpdateBigGameSchedulePayload,
) {
  return apiRequest<AdminGame>({
    url: `/admin/slots/${slotId}/big-game-schedule`,
    method: "PATCH",
    data: payload,
  });
}

export interface UpdateSlotOperationModePayload {
  operationMode: "MANUAL" | "AUTO";
  registrationDurationSeconds?: number;
  autoCallIntervalSeconds?: number;
}

export function updateAdminSlotOperationMode(
  slotId: string,
  payload: UpdateSlotOperationModePayload,
) {
  return apiRequest<AdminGame>({
    url: `/admin/slots/${slotId}/operation-mode`,
    method: "PATCH",
    data: payload,
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

export interface ClearQueueResponse {
  clearedSlotsCount: number;
  cancelledEmptyRegistration: boolean;
  keptRegistration: boolean;
}

export function clearAdminQueue() {
  return apiRequest<ClearQueueResponse>({
    url: "/admin/slots/clear-queue",
    method: "POST",
  });
}

export function cancelBlockingSession(sessionId: string) {
  return apiRequest<{
    success: true;
    sessionId: string;
    alreadyCancelled?: boolean;
  }>({
    url: `/admin/sessions/${sessionId}/cancel`,
    method: "PATCH",
  });
}

export function startSessionAutoCall(sessionId: string) {
  return apiRequest<{
    success: true;
    sessionId: string;
    autoCallEnabled: true;
  }>({
    url: `/admin/sessions/${sessionId}/auto-call/start`,
    method: "POST",
  });
}

export function stopSessionAutoCall(sessionId: string) {
  return apiRequest<{
    success: true;
    sessionId: string;
    autoCallEnabled: false;
  }>({
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

export function getAdminTimeConfig() {
  return apiRequest<GameTimingConfig>({
    url: "/admin/time-config",
    method: "GET",
  });
}

export function updateAdminTimeConfig(payload: UpdateGameTimingConfigPayload) {
  return apiRequest<GameTimingConfig>({
    url: "/admin/time-config",
    method: "PATCH",
    data: payload,
  });
}

export function getAdminBroadcasts() {
  return apiRequest<AdminBroadcast[]>({
    url: "/admin/broadcasts",
    method: "GET",
  });
}

export function createAdminBroadcast(payload: CreateAdminBroadcastPayload) {
  return apiRequest<AdminBroadcast>({
    url: "/admin/broadcasts",
    method: "POST",
    data: payload,
  });
}

export function deleteAdminBroadcast(id: string) {
  return apiRequest<{ success: boolean }>({
    url: `/admin/broadcasts/${id}`,
    method: "DELETE",
  });
}
