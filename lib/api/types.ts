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
    summary?: unknown;
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

export interface PaginatedResult<T, TSummary = undefined> {
  items: T[];
  pagination: PaginationMeta;
  summary?: TSummary;
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
  bonusCartelasUsedToday: number;
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

export interface AdminDeviceAccount {
  userId: string;
  fullName: string;
  phoneNumber: string;
  status: "ACTIVE" | "BLOCKED";
}

export interface AdminDeviceWelcomeBonus {
  granted: boolean;
  phoneNumber: string | null;
  userId: string | null;
  bonusAmount: number | null;
  grantedAt: string | null;
}

export interface AdminDeviceListItem {
  deviceId: string;
  accountCount: number;
  isDuplicate: boolean;
  phoneNumbers: string[];
  accounts: AdminDeviceAccount[];
  welcomeBonus: AdminDeviceWelcomeBonus;
  recommendationCode: "NORMAL" | "NORMAL_NO_BONUS" | "REVIEW_MULTI_ACCOUNT";
  recommendation: string;
  lastSeenAt: string | null;
}

export interface AdminDevicesSummary {
  totalDevices: number;
  duplicateDevices: number;
}

export interface WalletSummary {
  id: string;
  userId: string;
  balance: string;
  lockedBalance: string;
  bonusCartelaBalance: number;
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

export interface AdminPlayerGameCartela {
  id: string;
  gameSessionId: string;
  userId: string;
  cartelaId: string;
  status: string;
  isWinner: boolean;
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
}

export interface AdminPlayerGameHistoryItem {
  id: string;
  sessionId: string;
  playCode: string;
  name: string;
  gameType: string;
  entryFee: string;
  prizePerCartela: string;
  prizeAmount: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  registeredCartelasCount: number;
  calledNumbersCount: number;
  myCartelas: AdminPlayerGameCartela[];
}

export interface SessionWinnerCompletedPattern {
  type: string;
  key?: string;
  numbers: number[];
  cells: [number, number][];
}

export interface SessionWinnerResultItem {
  gameCartelaId: string;
  cartelaId: string;
  cartelaNumber: number;
  owner?: "ME" | "OTHER";
  amount: string;
  b: Array<number | string>;
  i: Array<number | string>;
  n: Array<number | string>;
  g: Array<number | string>;
  o: Array<number | string>;
  completedPatterns: SessionWinnerCompletedPattern[];
  winningBallCellIndex?: number | null;
  lastCalledNumber?: { letter: string; number: number } | null;
}

export interface SessionWinnerResultsResponse {
  sessionId: string;
  winnerResults: SessionWinnerResultItem[];
}

export type WalletTransactionType =
  | "DEPOSIT"
  | "WITHDRAW_REQUEST"
  | "WITHDRAW_PAID"
  | "WITHDRAW_REFUND"
  | "GAME_ENTRY"
  | "PRIZE_WIN"
  | "REFUND"
  | "ADMIN_ADJUSTMENT";

export type AdminWalletTransactionCategory =
  | "ALL"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "GAME"
  | "PRIZE"
  | "OTHER";

export type AdminWalletTransactionReferenceStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "PAID";

export interface AdminWalletTransaction {
  id: string;
  userId: string;
  type: WalletTransactionType;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  referenceStatus: DepositStatus | WithdrawalStatus | null;
  description: string | null;
  createdAt: string;
}

export interface PlayerDepositHistoryItem {
  id: string;
  userId: string;
  provider: PaymentProvider;
  amount: string;
  transactionRef: string;
  receiptUrl: string | null;
  walletTransactionId: string | null;
  status: DepositStatus;
  rejectionReason: string | null;
  verifiedAmount: string | null;
  verifiedReceiverName: string | null;
  createdAt: string;
  verifiedAt: string | null;
  updatedAt: string;
}

export interface PlayerWithdrawalHistoryItem {
  id: string;
  userId: string;
  provider: PaymentProvider;
  amount: string;
  receiverPhone: string | null;
  receiverAccount: string | null;
  payoutRef: string | null;
  status: WithdrawalStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
}

export interface AdminUserFinancialHistory {
  user: AdminUserDetail;
  wallet: WalletSummary | null;
  summary: {
    totalDeposited: string;
    approvedDepositCount: number;
    totalWithdrawn: string;
    paidWithdrawalCount: number;
    totalPrizeWon: string;
    prizeWinCount: number;
    totalGameEntry: string;
    gameEntryCount: number;
    pendingWithdrawalTotal: string;
    pendingWithdrawalCount: number;
  };
  deposits: PlayerDepositHistoryItem[];
  withdrawals: PlayerWithdrawalHistoryItem[];
  transactions: AdminWalletTransaction[];
}

export type PaymentProvider = "CBE" | "TELEBIRR" | "AWASH" | "BOA";

export type DepositStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AdminDepositProviderOption {
  key: PaymentProvider;
  name: string;
}

export interface AdminDepositsSummary {
  providers: AdminDepositProviderOption[];
}

export interface AdminDepositVerifiedData {
  verificationSource?: string;
  decision?: string;
  approvalModeAtSubmit?: string;
}

export type DepositApprovalMode = "automatic" | "manual" | "local";

export interface DepositApprovalProviderConfig {
  provider: PaymentProvider;
  enabled: boolean;
  approvalMode: DepositApprovalMode;
  allowedModes: DepositApprovalMode[];
  updatedAt: string;
  updatedById: string | null;
}

export interface DepositApprovalConfig {
  providers: DepositApprovalProviderConfig[];
}

export interface UpdateDepositApprovalConfigPayload {
  providers: Array<{
    provider: PaymentProvider;
    enabled: boolean;
    approvalMode: DepositApprovalMode;
  }>;
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

export type FinancialSettlementAccountKey =
  | "all"
  | "telebirr_1"
  | "telebirr_2"
  | "cbe";

export interface ReportDateRangeParams {
  from?: string;
  to?: string;
  settlementAccount?: FinancialSettlementAccountKey;
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
  bonusEntryValueTotal: string;
  bonusCompanyFeeTotal: string;
  bonusCartelasUsed: number;
  expensesTotal: string;
  profitNet: string;
  transactionCount: number;
  expenses: AdminExpense[];
  dailyTotals: FinancialDailyTotal[];
  totalWalletsBalance: string;
  totalWalletsLocked: string;
  totalWalletsLiability: string;
  settlementAccount: FinancialSettlementAccountKey;
  settlementAccounts: FinancialSettlementAccount[];
  settlementBreakdown: FinancialSettlementBreakdownItem[];
}

export interface FinancialSettlementAccount {
  key: Exclude<FinancialSettlementAccountKey, "all">;
  label: string;
  account: string;
  provider: PaymentProvider;
}

export interface FinancialSettlementBreakdownItem {
  key: Exclude<FinancialSettlementAccountKey, "all">;
  label: string;
  account: string;
  provider: PaymentProvider;
  depositsTotal: string;
  depositCount: number;
}

export interface GamesReportWinner {
  gameId: string;
  gameCode: string;
  gameName: string;
  gameType: string;
  finishedAt: string | null;
  /** Prize share credited to this winning cartela. */
  prizeAmount: string;
  /** Full session prize pool (before split). */
  sessionPrizeAmount?: string;
  /** How many winning cartelas shared this game. */
  winnersInGame?: number;
  winnerCartelaId: string | null;
  winnerUser: AdminUser | null;
  cartelaNumber: string | number | null;
}

export interface GamesReport {
  gamesCreated: number;
  gamesFinished: number;
  totalRegistrations: number;
  totalEntryFees: string;
  bonusEntryValueTotal: string;
  bonusCartelasUsed: number;
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

export type PlayerSupportCategory =
  | "FEEDBACK"
  | "COMPLAINT"
  | "ADVICE"
  | "OTHER";

export type PlayerSupportStatus = "OPEN" | "REPLIED" | "CLOSED";

export interface PlayerSupportUserSummary {
  id: string;
  fullName: string;
  phoneNumber: string;
}

export interface PlayerSupportMessage {
  id: string;
  userId: string;
  category: PlayerSupportCategory;
  message: string;
  status: PlayerSupportStatus;
  adminReply: string | null;
  repliedAt: string | null;
  repliedById: string | null;
  createdAt: string;
  updatedAt: string;
  user: PlayerSupportUserSummary;
}

export interface ReplySupportMessagePayload {
  adminReply?: string;
  status?: PlayerSupportStatus;
}

export type LeaderboardPeriod =
  | "today"
  | "week"
  | "last_week"
  | "last_30_days"
  | "all_time"
  | "custom";

export interface HouseChampionsEntry {
  rank: number;
  userId: string;
  displayName: string;
  fullName?: string;
  phoneNumber?: string;
  cartelaWins: number;
  gamesWon: number;
}

export interface HouseChampionsMe {
  rank: number;
  cartelaWins: number;
  gamesWon: number;
}

export interface HouseChampionsResponse {
  period: LeaderboardPeriod;
  timezone: string;
  periodStart: string | null;
  periodEnd: string | null;
  labelStart: string | null;
  labelEnd: string | null;
  metric: string;
  limit: number;
  updatedAt: string;
  entries: HouseChampionsEntry[];
  me: HouseChampionsMe | null;
}

export interface HouseChampionsQueryParams {
  period?: LeaderboardPeriod;
  limit?: number;
  from?: string;
  to?: string;
}
