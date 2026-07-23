"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getOpenSupportMessageCount } from "@/lib/api/admin";
import { socketService } from "@/lib/socket/socket-service";

export const openFeedbackCountQueryKey = [
  "admin",
  "support",
  "open-count",
] as const;

export function useOpenFeedbackCount() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: openFeedbackCountQueryKey,
    queryFn: async () => {
      const result = await getOpenSupportMessageCount();
      return result.count;
    },
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  useEffect(() => {
    const refreshOpenCount = () => {
      void queryClient.invalidateQueries({
        queryKey: openFeedbackCountQueryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "support"],
      });
    };

    socketService.on("support:new_message", refreshOpenCount);
    socketService.on("support:updated", refreshOpenCount);
    socketService.on("connect", refreshOpenCount);

    return () => {
      socketService.off("support:new_message", refreshOpenCount);
      socketService.off("support:updated", refreshOpenCount);
      socketService.off("connect", refreshOpenCount);
    };
  }, [queryClient]);

  return {
    count: query.data ?? 0,
    isLoading: query.isLoading,
  };
}
