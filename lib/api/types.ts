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
  totalGames: number;
  activeGames: number;
  finishedGamesToday: number;
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
    transactions: number;
  };
}

export type PaymentProvider = "CBE" | "TELEBIRR";

export type DepositStatus =
  | "PENDING"
  | "VERIFYING"
  | "APPROVED"
  | "REJECTED"
  | "MANUAL_REVIEW";

export interface AdminDeposit {
  id: string;
  userId: string;
  provider: PaymentProvider;
  amount: string;
  transactionRef: string;
  status: DepositStatus;
  rejectionReason: string | null;
  createdAt: string;
  verifiedAt: string | null;
  updatedAt: string;
  user: AdminUser;
}

export type WithdrawalStatus =
  | "PENDING"
  | "APPROVED"
  | "PAID"
  | "REJECTED"
  | "FAILED"
  | "REFUNDED";

export interface AdminWithdrawal {
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
  user: AdminUser;
}

export type GameStatus =
  | "NEXT"
  | "CHECKING"
  | "PLAYING"
  | "FINISHED"
  | "CANCELLED";

export interface AdminGame {
  id: string;
  code: string;
  name: string;
  gameType: string;
  entryFee: string;
  prizeAmount: string;
  status: GameStatus;
  startsAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  winnerCartelaId: string | null;
  createdAt: string;
  updatedAt: string;
  registeredCartelasCount: number;
}

export interface CreateGamePayload {
  name: string;
  gameType: string;
  entryFee: string;
  prizeAmount: string;
  startsAt: string;
}

export interface UpdateGameStatusPayload {
  status: GameStatus;
}

export interface CalledNumber {
  id: string;
  gameId: string;
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

export interface FinancialDailyTotal {
  date: string;
  depositsTotal: string;
  withdrawalsTotal: string;
  gameEntryTotal: string;
  prizePaidTotal: string;
  netRevenue: string;
}

export interface FinancialReport {
  depositsTotal: string;
  withdrawalsTotal: string;
  gameEntryTotal: string;
  prizePaidTotal: string;
  netRevenue: string;
  transactionCount: number;
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
