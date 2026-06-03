import { apiPaginatedRequest, apiRequest } from "@/lib/api/client";
import type {
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

export function getAdminGames(page = 1, pageSize = 20) {
  return apiPaginatedRequest<AdminGame>({
    url: "/admin/games",
    method: "GET",
    params: { page, pageSize },
  });
}

export function createAdminGame(payload: CreateGamePayload) {
  return apiRequest<AdminGame>({
    url: "/admin/games",
    method: "POST",
    data: payload,
  });
}

export function updateAdminGameStatus(
  gameId: string,
  payload: UpdateGameStatusPayload,
) {
  return apiRequest<AdminGame>({
    url: `/admin/games/${gameId}/status`,
    method: "PATCH",
    data: payload,
  });
}

export function startAdminGame(gameId: string) {
  return apiRequest<AdminGame>({
    url: `/admin/games/${gameId}/start`,
    method: "POST",
  });
}

export function callAdminGameNumber(
  gameId: string,
  payload: CallNumberPayload,
) {
  return apiRequest({
    url: `/admin/games/${gameId}/call-number`,
    method: "POST",
    data: payload,
  });
}

export function getGameDetail(gameId: string) {
  return apiRequest<AdminGame>({
    url: `/games/${gameId}`,
    method: "GET",
  });
}

export function getGameCalledNumbers(gameId: string) {
  return apiRequest<CalledNumbersResponse>({
    url: `/games/${gameId}/called-numbers`,
    method: "GET",
  });
}
