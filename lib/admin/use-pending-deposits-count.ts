"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getPendingDepositCount } from "@/lib/api/admin";
import { socketService } from "@/lib/socket/socket-service";

export const pendingDepositsCountQueryKey = [
  "admin",
  "deposits",
  "pending-count",
] as const;

export function usePendingDepositsCount() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: pendingDepositsCountQueryKey,
    queryFn: async () => {
      const result = await getPendingDepositCount();
      return result.count;
    },
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  useEffect(() => {
    const refreshPendingCount = () => {
      void queryClient.invalidateQueries({
        queryKey: pendingDepositsCountQueryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "deposits"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "reports", "overview"],
      });
    };

    socketService.on("deposit:updated", refreshPendingCount);
    socketService.on("connect", refreshPendingCount);

    return () => {
      socketService.off("deposit:updated", refreshPendingCount);
      socketService.off("connect", refreshPendingCount);
    };
  }, [queryClient]);

  return {
    count: query.data ?? 0,
    isLoading: query.isLoading,
  };
}
