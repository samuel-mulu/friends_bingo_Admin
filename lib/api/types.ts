export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: {
    pagination?: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
  };
  timestamp?: string;
  path?: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    statusCode: number;
    error: string;
    message: string | string[];
    details?: Record<string, unknown>;
  };
  timestamp?: string;
  path?: string;
}

export interface AdminUser {
  id: string;
  fullName: string;
  phoneNumber: string;
  role: "ADMIN" | "PLAYER";
  status: "ACTIVE" | "BLOCKED";
  createdAt: string;
  updatedAt: string;
}

export interface AdminSession {
  accessToken: string;
  refreshToken?: string;
  user: AdminUser;
}

export interface LoginPayload {
  phoneNumber: string;
  password: string;
}

export interface OverviewReport {
  totalPlayers: number;
  activePlayers: number;
  blockedPlayers: number;
  totalSlots: number;
  activeSessions: number;
  finishedSessionsToday: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  depositsTodayTotal: string;
  withdrawalsTodayTotal: string;
  gameEntryTodayTotal: string;
  prizePaidTodayTotal: string;
  netToday: string;
}

export interface AdminUserListItem {
  id: string;
  fullName: string;
  phoneNumber: string;
  role: "ADMIN" | "PLAYER";
  status: "ACTIVE" | "BLOCKED";
  walletBalance: string;
  createdAt: string;
}

export interface WalletSummary {
  id: string;
  userId: string;
  balance: string;
  lockedBalance: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserDetail {
  id: string;
  fullName: string;
  phoneNumber: string;
  role: "ADMIN" | "PLAYER";
  status: "ACTIVE" | "BLOCKED";
  createdAt: string;
  updatedAt: string;
  wallet: WalletSummary | null;
  counts: {
    deposits: number;
    withdrawals: number;
    gameCartelas: number;
    winnerCartelas: number;
    transactions: number;
  };
}

export type PaymentProvider = "CBE" | "TELEBIRR" | "AWASH" | "BOA";

export type DepositStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AdminDepositVerifiedData {
  verificationSource?: string;
  decision?: string;
}

export interface AdminDeposit {
  id: string;
  userId: string;
  provider: PaymentProvider;
  amount: string;
  transactionRef: string;
  receiptUrl: string | null;
  walletTransactionId: string | null;
  status: DepositStatus;
  rejectionReason: string | null;
  verifyEtRequestId?: string | null;
  verifiedAmount?: string | null;
  verifiedReceiverName?: string | null;
  verifiedData?: AdminDepositVerifiedData | null;
  createdAt: string;
  verifiedAt: string | null;
  updatedAt: string;
  user: AdminUser;
}

export type WithdrawalStatus =
  "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "FAILED" | "REFUNDED";

export interface AdminWithdrawal {
  id: string;
  userId: string;
  provider: PaymentProvider;
  amount: string;
  receiverPhone: string | null;
  receiverAccount: string | null;
  payoutRef: string | null;
  payoutTransactionUrl: string | null;
  status: WithdrawalStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  user: AdminUser;
}

export type GameStatus =
  | "NEXT"
  | "READY"
  | "CHECKING"
  | "PLAYING"
  | "WINNER_WINDOW"
  | "FINISHED"
  | "NO_WINNER"
  | "CANCELLED";

export type GameCategory = "NORMAL" | "BONUS" | "BIG_GOTD" | "BIG_GAME";

export interface GameRuleSummary {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface AdminGame {
  id: string;
  staticCode: string;
  playCode: string | null;
  sessionId: string | null;
  name: string;
  gameRuleId: string | null;
  gameRule: GameRuleSummary | null;
  gameType: string;
  status: GameStatus;
  category: GameCategory;
  isBonus: boolean;
  fixedPrizeAmount: string | null;
  maxCartelasPerPlayer: number | null;
  sortOrder: number | null;
  playOrder: number | null;
  entryFee: string;
  prizePerCartela: string;
  companyFeePerCartela: string;
  prizeAmount: string;
  companyRevenue: string;
  startedAt: string | null;
  finishedAt: string | null;
  winnerCartelaId: string | null;
  noWinnerGraceEndsAt?: string | null;
  noWinnerReason?: string | null;
  registeredCartelasCount: number;
  calledNumbersCount: number;
  registrationOpen: boolean;
  latestSession: {
    id: string;
    sessionId: string;
    playCode: string;
    entryFee: string;
    prizePerCartela: string;
    companyFeePerCartela: string;
    prizeAmount: string;
    companyRevenue: string;
    status: GameStatus;
    startedAt: string | null;
    finishedAt: string | null;
    winnerCartelaId: string | null;
    noWinnerGraceEndsAt?: string | null;
    noWinnerReason?: string | null;
    registeredCartelasCount: number;
    calledNumbersCount: number;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export type GameOperationMode = "MANUAL" | "AUTO";

export interface CreateGamePayload {
  gameRuleId: string;
  category?: GameCategory;
  fixedPrizeAmount?: string;
  entryFee?: string;
  maxCartelasPerPlayer?: number;
  registrationOpensAt?: string;
  playStartAt?: string;
  operationMode?: GameOperationMode;
  registrationDurationSeconds?: number;
  autoCallIntervalSeconds?: number;
}

export interface UpdateGameStatusPayload {
  status: GameStatus;
}

export interface CalledNumber {
  id: string;
  gameSessionId: string;
  letter: string;
  number: number;
  order: number;
  createdAt: string;
}

export interface CalledNumbersResponse {
  totalCount: number;
  calledNumbers: CalledNumber[];
}

export interface CallNumberPayload {
  letter: string;
  number: number;
}

export interface ReportDateRangeParams {
  from?: string;
  to?: string;
}

export interface AdminExpense {
  id: string;
  amount: string;
  reason: string;
  note: string | null;
  expenseDate: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AdminBroadcastCategory = "DISMISSIBLE" | "PERSISTENT" | "FORCED";

export interface AdminBroadcast {
  id: string;
  title: string;
  body: string;
  category: AdminBroadcastCategory;
  createdAt: string;
  createdById?: string | null;
}

export interface CreateAdminBroadcastPayload {
  title: string;
  body: string;
  category: AdminBroadcastCategory;
}

export interface CreateExpensePayload {
  amount: string;
  reason: string;
  note?: string;
  expenseDate?: string;
}

export interface FinancialDailyTotal {
  date: string;
  depositsTotal: string;
  withdrawalsTotal: string;
  gameEntryTotal: string;
  prizePaidTotal: string;
  netRevenue: string;
  companyFeeTotal: string;
  expensesTotal: string;
  profitNet: string;
}

export interface FinancialReport {
  depositsTotal: string;
  withdrawalsTotal: string;
  gameEntryTotal: string;
  prizePaidTotal: string;
  netRevenue: string;
  registeredCartelasCount: number;
  companyFeeTotal: string;
  expensesTotal: string;
  profitNet: string;
  transactionCount: number;
  expenses: AdminExpense[];
  dailyTotals: FinancialDailyTotal[];
}

export interface GamesReportWinner {
  gameId: string;
  gameCode: string;
  gameName: string;
  gameType: string;
  finishedAt: string | null;
  prizeAmount: string;
  winnerCartelaId: string | null;
  winnerUser: AdminUser | null;
  cartelaNumber: string | number | null;
}

export interface GamesReport {
  gamesCreated: number;
  gamesFinished: number;
  totalRegistrations: number;
  totalEntryFees: string;
  totalPrizeAmount: string;
  averagePlayersPerGame: number;
  winners: GamesReportWinner[];
}

export type BingoClaimStatus = "PENDING" | "VALID" | "INVALID";

export interface BingoClaimUserSummary {
  id: string;
  fullName: string;
  phoneNumber: string;
}

export interface GameTimingConfig {
  id: string;
  registrationDurationSeconds: number;
  autoCallIntervalSeconds: number;
  winnerWindowSeconds: number;
  cartelaHoldSeconds: number;
  finishedResultDisplaySeconds: number;
  preparingDisplayMaxSeconds: number | null;
  missedNumberAnimationMs: number;
  missedNumberStaggerMaxBalls: number;
  adminRefreshDebounceMs: number;
  adminFallbackPollingSeconds: number;
  flutterRefetchDebounceMs: number;
  updatedAt: string;
  updatedById: string | null;
}

export interface UpdateGameTimingConfigPayload {
  registrationDurationSeconds?: number;
  autoCallIntervalSeconds?: number;
  winnerWindowSeconds?: number;
  cartelaHoldSeconds?: number;
  finishedResultDisplaySeconds?: number;
  preparingDisplayMaxSeconds?: number | null;
  missedNumberAnimationMs?: number;
  missedNumberStaggerMaxBalls?: number;
  adminRefreshDebounceMs?: number;
  adminFallbackPollingSeconds?: number;
  flutterRefetchDebounceMs?: number;
}

export interface AdminBingoClaim {
  id: string;
  gameSessionId: string;
  userId: string;
  gameCartelaId: string;
  status: BingoClaimStatus;
  checkedPattern: string | null;
  reason: string | null;
  createdAt: string;
  checkedAt: string | null;
  user: BingoClaimUserSummary;
  gameSession: {
    id: string;
    playCode: string;
    status: GameStatus;
    prizeAmount: string;
    gameSlot: {
      id: string;
      gameType: string;
      name: string;
      gameRule: GameRuleSummary | null;
    };
  };
  gameCartela: {
    id: string;
    status: string;
    isWinner: boolean;
    blockedAt: string | null;
    cartela: {
      id: string;
      number: number;
    };
  };
}
