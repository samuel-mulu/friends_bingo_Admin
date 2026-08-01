"use client";

import { useQuery } from "@tanstack/react-query";

import { getGeezSmsBalance } from "@/lib/api/admin";

export const geezSmsBalanceQueryKey = ["admin", "sms", "balance"] as const;

/** On-demand only: pass enabled=true when the SMS dialog is open. */
export function useGeezSmsBalance(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? false;

  const query = useQuery({
    queryKey: geezSmsBalanceQueryKey,
    queryFn: getGeezSmsBalance,
    enabled,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    staleTime: 30_000,
    retry: false,
  });

  return {
    enabled: query.data?.enabled ?? false,
    balance: query.data?.balance ?? null,
    currency: query.data?.currency ?? null,
    error: query.data?.error ?? null,
    isLoading: enabled && (query.isLoading || query.isFetching),
    isError: query.isError,
    refetch: query.refetch,
  };
}
