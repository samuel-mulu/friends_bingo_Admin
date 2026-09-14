import { apiPaginatedRequest, apiRequest } from "@/lib/api/client";
import type {
  AdminBingoClaim,
  AdminBroadcast,
  AdminExpense,
  AdminGame,
  AdminDeposit,
  AdminDepositsSummary,
  DepositStatus,
  AdminDeviceListItem,
  AdminDevicesSummary,
  AdminSession,
  AdminUserDetail,
  AdminUserFinancialHistory,
  AdminUserListItem,
  AdminWalletTransaction,
  AdminWalletTransactionCategory,
  AdminWalletTransactionReferenceStatus,
  AdminPlayerGameHistoryItem,
  AdminWithdrawal,
  WithdrawalStatus,
  CreateExpensePayload,
  CreateAdminBroadcastPayload,
  CalledNumbersResponse,
  CallNumberPayload,
  ChainRoundResult,
  GameCategory,
  SessionWinnerResultsResponse,
  CreateGamePayload,
  FinancialReport,
  GameRuleSummary,
  GamesReport,
  LoginPayload,
  GameTimingConfig,
  DepositApprovalConfig,
  UpdateDepositApprovalConfigPayload,
  AppDisplayConfig,
  UpdateAppDisplayConfigPayload,
  NotificationConfig,
  UpdateNotificationConfigPayload,
  ChangeAdminPasswordPayload,
  ChangeAdminPasswordResult,
  HouseChampionsQueryParams,
  HouseChampionsResponse,
  OverviewReport,
  PaymentProvider,
  PlayerSupportMessage,
  PlayerSupportStatus,
  ReplySupportMessagePayload,
  CreateAdminSupportMessagePayload,
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

export function getHouseChampions(params: HouseChampionsQueryParams = {}) {
  return apiRequest<HouseChampionsResponse>({
    url: "/admin/leaderboard/cartela-wins",
    method: "GET",
    params,
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
  category: GameCategory;
  isBonus: boolean;
  isBigGame?: boolean;
  isChainGame?: boolean;
  fixedPrizeAmount?: string | null;
  maxCartelasPerPlayer?: number | null;
  roundCount?: number;
  roundPrizes?: string[] | null;
  roundGameRuleIds?: string[] | null;
  interRoundDelaySeconds?: number | null;
  currentRound?: number;
  roundIndex?: number;
  roundPrizeAmount?: string | null;
  nextRoundStartsAt?: string | null;
  /** CHAIN_GAME: set while the session is paused on a winner reveal between rounds. */
  roundPausedUntil?: string | null;
  /** CHAIN_GAME: every round finished so far, in round order. */
  roundResults?: ChainRoundResult[];
  forceBigGameEnabled?: boolean;
  forceBigGameCartelaCount?: number | null;
  entryFee: string;
  prizePerCartela: string;
  companyFeePerCartela?: string;
  prizeAmount: string;
  companyRevenue?: string;
  registeredCartelasCount: number;
  registeredByMoneyCount?: number;
  registeredByTicketCount?: number;
  registeredByCarriedCount?: number;
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
  operationsState?: "active" | "handoff" | "idle";
  operationsVersion?: number;
  timestamp: string;
  serverNow?: string;
  bigGameLiveElsewhere?: {
    sessionId: string;
    phase: "live" | "held";
  };
  bigGameNextRegistration?: BigGameNextRegistrationSummary;
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
  registeredByMoneyCount?: number;
  registeredByTicketCount?: number;
  registeredByCarriedCount?: number;
  registrationOpensAt: string | null;
  scheduledStartAt: string | null;
  roundCount?: number;
  roundPrizes?: string[] | null;
  roundGameRuleIds?: string[] | null;
  interRoundDelaySeconds?: number | null;
  currentRound?: number;
  roundIndex?: number;
  roundPrizeAmount?: string | null;
  nextRoundStartsAt?: string | null;
  heldWaitingForLiveSlot?: boolean;
  blockingLiveGame?: {
    sessionId: string;
    staticCode: string;
    playCode: string | null;
    playerStatus: string;
  };
  previousRound?: {
    sessionId: string;
    roundIndex: number;
    status: string;
    playCode: string | null;
    finishedAt: string | null;
    registeredCartelasCount: number;
    playerOwnedPreviousRound: boolean;
    winners?: Array<{
      userId: string;
      fullName: string;
      cartelaNumber: number;
      amount: string;
    }>;
  };
  finishedRounds?: Array<{
    sessionId: string;
    roundIndex: number;
    status: string;
    playCode: string | null;
    finishedAt: string | null;
    prizeAmount: string;
    winners: Array<{
      userId: string;
      fullName: string;
      cartelaNumber: number;
      amount: string;
    }>;
  }>;
  /** READY next round while this (live) round is still playing. */
  nextRoundRegistration?: CurrentBigGameResponse | null;
}

export interface BigGameNextRegistrationSummary {
  sessionId: string;
  slotId: string;
  roundIndex: number;
  roundCount: number | null;
  scheduledStartAt: string | null;
  registrationOpensAt: string | null;
  registeredCartelasCount: number;
  playCode: string;
  staticCode: string;
}

export function getCurrentBigGame() {
  return apiRequest<CurrentBigGameResponse | null>({
    url: "/games/big-game/current",
    method: "GET",
  });
}

export function getAdminDeposits(
  page = 1,
  pageSize = 20,
  options?: {
    search?: string;
    provider?: PaymentProvider;
    status?: DepositStatus;
    from?: string;
    to?: string;
  },
) {
  return apiPaginatedRequest<AdminDeposit, AdminDepositsSummary>({
    url: "/admin/deposits",
    method: "GET",
    params: {
      page,
      pageSize,
      search: options?.search?.trim() || undefined,
      provider: options?.provider,
      status: options?.status,
      from: options?.from || undefined,
      to: options?.to || undefined,
    },
  });
}

export function approveDeposit(depositId: string, approvalPin: string) {
  return apiRequest<AdminDeposit>({
    url: `/admin/deposits/${depositId}/approve`,
    method: "PATCH",
    data: { approvalPin },
  });
}

export function rejectDeposit(depositId: string, rejectionReason: string) {
  return apiRequest<AdminDeposit>({
    url: `/admin/deposits/${depositId}/reject`,
    method: "PATCH",
    data: { rejectionReason },
  });
}

export function getAdminWithdrawals(
  page = 1,
  pageSize = 20,
  options?: {
    search?: string;
    provider?: PaymentProvider;
    status?: WithdrawalStatus;
    from?: string;
    to?: string;
  },
) {
  return apiPaginatedRequest<AdminWithdrawal>({
    url: "/admin/withdrawals",
    method: "GET",
    params: {
      page,
      pageSize,
      search: options?.search?.trim() || undefined,
      provider: options?.provider,
      status: options?.status,
      from: options?.from || undefined,
      to: options?.to || undefined,
    },
  });
}

export function getPendingWithdrawalCount() {
  return apiRequest<{ count: number }>({
    url: "/admin/withdrawals/pending-count",
    method: "GET",
  });
}

export function getPendingDepositCount() {
  return apiRequest<{ count: number }>({
    url: "/admin/deposits/pending-count",
    method: "GET",
  });
}

export function getGeezSmsBalance() {
  return apiRequest<{
    enabled: boolean;
    balance: string | null;
    currency: string | null;
    error: string | null;
  }>({
    url: "/admin/sms/balance",
    method: "GET",
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
  options?: {
    role?: "ADMIN" | "PLAYER";
    search?: string;
    sortBy?: "balance" | "createdAt";
    sortOrder?: "asc" | "desc";
  },
) {
  return apiPaginatedRequest<AdminUserListItem>({
    url: "/admin/users",
    method: "GET",
    params: {
      page,
      pageSize,
      role: options?.role,
      search: options?.search?.trim() || undefined,
      sortBy: options?.sortBy ?? "balance",
      sortOrder: options?.sortOrder ?? "desc",
    },
  });
}

export function getAdminDevices(
  page = 1,
  pageSize = 20,
  options?: {
    search?: string;
    duplicatesOnly?: boolean;
  },
) {
  return apiPaginatedRequest<AdminDeviceListItem, AdminDevicesSummary>({
    url: "/admin/devices",
    method: "GET",
    params: {
      page,
      pageSize,
      search: options?.search?.trim() || undefined,
      duplicatesOnly: options?.duplicatesOnly ? true : undefined,
    },
  });
}

export function getAdminUserById(userId: string) {
  return apiRequest<AdminUserDetail>({
    url: `/admin/users/${userId}`,
    method: "GET",
  });
}

export function updateAdminUserStatus(
  userId: string,
  payload: { status: "ACTIVE" | "BLOCKED"; reason?: string },
) {
  return apiRequest<AdminUserDetail>({
    url: `/admin/users/${userId}/status`,
    method: "PATCH",
    data: payload,
  });
}

export function getAdminUserFinancialHistory(userId: string) {
  return apiRequest<AdminUserFinancialHistory>({
    url: `/admin/users/${userId}/financial-history`,
    method: "GET",
  });
}

export function getAdminUserGameHistory(
  userId: string,
  page = 1,
  pageSize = 20,
) {
  return apiPaginatedRequest<AdminPlayerGameHistoryItem>({
    url: `/admin/users/${userId}/game-history`,
    method: "GET",
    params: { page, pageSize },
  });
}

export function getAdminUserWalletTransactions(
  userId: string,
  page = 1,
  pageSize = 20,
  filters?: {
    category?: AdminWalletTransactionCategory;
    status?: AdminWalletTransactionReferenceStatus;
  },
) {
  return apiPaginatedRequest<AdminWalletTransaction>({
    url: `/admin/users/${userId}/wallet-transactions`,
    method: "GET",
    params: {
      page,
      pageSize,
      category: filters?.category,
      status: filters?.status,
    },
  });
}

export function getSessionCalledNumbers(sessionId: string) {
  return apiRequest<CalledNumbersResponse>({
    url: `/games/sessions/${sessionId}/called-numbers`,
    method: "GET",
  });
}

export type SessionRegisteredCartela = {
  gameCartelaId: string;
  cartelaId: string;
  cartelaNumber: number;
  status: string;
  isWinner: boolean;
  paymentSource?:
    | "MONEY_WALLET"
    | "BONUS_CARTELA"
    | "BIG_GAME_TICKET"
    | "CARRIED_FORWARD"
    | null;
  blockedAt: string | null;
  blockReason: string | null;
  blockCheckedAt: string | null;
  activeNumberWhenBlocked: {
    letter: string;
    number: number;
  } | null;
  cartela: {
    id: string;
    number: number;
    b: Array<number | string>;
    i: Array<number | string>;
    n: Array<number | string>;
    g: Array<number | string>;
    o: Array<number | string>;
  };
};

export type SessionRegisteredPlayer = {
  userId: string;
  fullName: string;
  phoneNumber: string;
  cartelas: SessionRegisteredCartela[];
};

export type SessionRegisteredPlayersResponse = {
  sessionId: string;
  playCode: string;
  status: string;
  staticCode: string;
  gameName: string;
  registeredCartelasCount: number;
  registeredByMoneyCount?: number;
  registeredByTicketCount?: number;
  registeredByCarriedCount?: number;
  playersCount: number;
  players: SessionRegisteredPlayer[];
};

export function getSessionRegisteredPlayers(sessionId: string) {
  return apiRequest<SessionRegisteredPlayersResponse>({
    url: `/admin/sessions/${sessionId}/registered-players`,
    method: "GET",
  });
}

export function getSessionWinnerResults(sessionId: string) {
  return apiRequest<SessionWinnerResultsResponse>({
    url: `/games/sessions/${sessionId}/winner-results`,
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
  return apiRequest<
    AdminGame & { operations?: GameOperationsCurrentResponse }
  >({
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

export interface UpdateAdminSlotEconomicsPayload {
  entryFee: string;
  companyFeePerCartela: string;
}

export function updateAdminSlotEconomics(
  gameId: string,
  payload: UpdateAdminSlotEconomicsPayload,
) {
  return apiRequest<AdminGame>({
    url: `/admin/slots/${gameId}/economics`,
    method: "PATCH",
    data: payload,
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

export function startAdminBigGameNextRound(slotId: string) {
  return apiRequest<{
    sessionId: string;
    roundIndex: number;
    clonedCount: number;
    actorId: string | null;
  }>({
    url: `/admin/slots/${slotId}/big-game/start-next-round`,
    method: "POST",
  });
}

export type ChainRoundPauseResult = {
  success: boolean;
  sessionId: string;
  resumeAt: string;
};

/** Chain Game: end the inter-round pause now and resume calling. */
export function continueAdminChainRoundNow(slotId: string) {
  return apiRequest<ChainRoundPauseResult>({
    url: `/admin/slots/${slotId}/chain-game/continue-now`,
    method: "POST",
  });
}

/** Chain Game: hold the winner reveal open for extra seconds. */
export function extendAdminChainRoundPause(slotId: string, seconds: number) {
  return apiRequest<ChainRoundPauseResult>({
    url: `/admin/slots/${slotId}/chain-game/extend-pause`,
    method: "POST",
    data: { seconds },
  });
}

export function startAdminBigGameNow(slotId: string) {
  return apiRequest<AdminGame>({
    url: `/admin/slots/${slotId}/big-game/start-now`,
    method: "POST",
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

export interface TransitionCommandResponse {
  success: true;
  transition: string;
  sessionId: string | null;
  skipped: boolean;
  operations: GameOperationsCurrentResponse;
}

export function startAdminGame(
  gameId: string,
  payload?: StartAdminGamePayload,
) {
  return apiRequest<TransitionCommandResponse>({
    url: `/admin/sessions/${gameId}/start`,
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
  operations?: GameOperationsCurrentResponse;
}

export function clearAdminQueue() {
  return apiRequest<ClearQueueResponse>({
    url: "/admin/slots/clear-queue",
    method: "POST",
  });
}

export function cancelBlockingSession(sessionId: string) {
  return apiRequest<TransitionCommandResponse>({
    url: `/admin/sessions/${sessionId}/cancel`,
    method: "PATCH",
  });
}

export function finishWinnerWindow(sessionId: string) {
  return apiRequest<TransitionCommandResponse>({
    url: `/admin/sessions/${sessionId}/finalize-winner-window`,
    method: "PATCH",
  });
}

export function openNextRegistrationAfterTerminal(sessionId: string) {
  return apiRequest<TransitionCommandResponse>({
    url: `/admin/sessions/${sessionId}/open-next-ready`,
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

export function getAdminDepositApprovalConfig() {
  return apiRequest<DepositApprovalConfig>({
    url: "/admin/deposit-config",
    method: "GET",
  });
}

export function updateAdminDepositApprovalConfig(
  payload: UpdateDepositApprovalConfigPayload,
) {
  return apiRequest<DepositApprovalConfig>({
    url: "/admin/deposit-config",
    method: "PATCH",
    data: payload,
  });
}

export function getAdminDisplayConfig() {
  return apiRequest<AppDisplayConfig>({
    url: "/admin/display-config",
    method: "GET",
  });
}

export function updateAdminDisplayConfig(payload: UpdateAppDisplayConfigPayload) {
  return apiRequest<AppDisplayConfig>({
    url: "/admin/display-config",
    method: "PATCH",
    data: payload,
  });
}

export function getAdminNotificationConfig() {
  return apiRequest<NotificationConfig>({
    url: "/admin/notification-config",
    method: "GET",
  });
}

export function updateAdminNotificationConfig(
  payload: UpdateNotificationConfigPayload,
) {
  return apiRequest<NotificationConfig>({
    url: "/admin/notification-config",
    method: "PATCH",
    data: payload,
  });
}

export function changeAdminPassword(payload: ChangeAdminPasswordPayload) {
  return apiRequest<ChangeAdminPasswordResult>({
    url: "/admin/change-password",
    method: "POST",
    data: payload,
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

export function getOpenSupportMessageCount() {
  return apiRequest<{ count: number }>({
    url: "/admin/support/messages/open-count",
    method: "GET",
  });
}

export function getAdminSupportMessages(
  page: number,
  pageSize: number,
  status?: PlayerSupportStatus,
) {
  return apiPaginatedRequest<PlayerSupportMessage>({
    url: "/admin/support/messages",
    method: "GET",
    params: {
      page,
      pageSize,
      ...(status ? { status } : {}),
    },
  });
}

export function getAdminSupportMessage(id: string) {
  return apiRequest<PlayerSupportMessage>({
    url: `/admin/support/messages/${id}`,
    method: "GET",
  });
}

export function replyToSupportMessage(
  id: string,
  payload: ReplySupportMessagePayload,
) {
  return apiRequest<PlayerSupportMessage>({
    url: `/admin/support/messages/${id}`,
    method: "PATCH",
    data: payload,
  });
}

export function createAdminSupportMessage(
  payload: CreateAdminSupportMessagePayload,
) {
  return apiRequest<PlayerSupportMessage>({
    url: "/admin/support/messages",
    method: "POST",
    data: payload,
  });
}
