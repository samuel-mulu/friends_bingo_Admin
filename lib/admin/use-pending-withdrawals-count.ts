"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getPendingWithdrawalCount } from "@/lib/api/admin";
import { socketService } from "@/lib/socket/socket-service";

export const pendingWithdrawalsCountQueryKey = [
  "admin",
  "withdrawals",
  "pending-count",
] as const;

export function usePendingWithdrawalsCount() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: pendingWithdrawalsCountQueryKey,
    queryFn: async () => {
      const result = await getPendingWithdrawalCount();
      return result.count;
    },
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  useEffect(() => {
    const refreshPendingCount = () => {
      void queryClient.invalidateQueries({
        queryKey: pendingWithdrawalsCountQueryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "withdrawals"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "reports", "overview"],
      });
    };

    socketService.on("withdrawal:updated", refreshPendingCount);
    socketService.on("connect", refreshPendingCount);

    return () => {
      socketService.off("withdrawal:updated", refreshPendingCount);
      socketService.off("connect", refreshPendingCount);
    };
  }, [queryClient]);

  return {
    count: query.data ?? 0,
    isLoading: query.isLoading,
  };
}
