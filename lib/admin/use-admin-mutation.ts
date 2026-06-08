"use client";

import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";

import { getApiErrorMessage } from "@/lib/api/errors";
import { adminToast } from "@/lib/admin/admin-toast";

type AdminMutationOptions<TData, TVariables, TContext> = Omit<
  UseMutationOptions<TData, Error, TVariables, TContext>,
  "mutationFn"
> & {
  mutationFn: UseMutationOptions<TData, Error, TVariables, TContext>["mutationFn"];
  successMessage?: string;
  errorMessage?: string;
  invalidateQueryKeys?: QueryKey[];
};

export function useAdminMutation<TData, TVariables, TContext = unknown>(
  options: AdminMutationOptions<TData, TVariables, TContext>,
): UseMutationResult<TData, Error, TVariables, TContext> {
  const queryClient = useQueryClient();
  const {
    mutationFn,
    successMessage,
    errorMessage = "Something went wrong.",
    invalidateQueryKeys = [],
    onSuccess,
    onError,
    ...rest
  } = options;

  return useMutation({
    mutationFn,
    ...rest,
    onSuccess: async (data, variables, onMutateResult, context) => {
      if (successMessage) {
        adminToast.success(successMessage);
      }

      await Promise.all(
        invalidateQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );

      await onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: (error, variables, onMutateResult, context) => {
      adminToast.error(getApiErrorMessage(error, errorMessage));
      onError?.(error, variables, onMutateResult, context);
    },
  });
}

export function isMutationPendingFor<TVariables>(
  mutation: {
    isPending: boolean;
    variables?: TVariables;
  },
  match: TVariables,
): boolean;
export function isMutationPendingFor<TVariables>(
  mutation: {
    isPending: boolean;
    variables?: TVariables;
  },
  match: (variables: TVariables) => boolean,
): boolean;
export function isMutationPendingFor<TVariables>(
  mutation: {
    isPending: boolean;
    variables?: TVariables;
  },
  match: TVariables | ((variables: TVariables) => boolean),
) {
  if (!mutation.isPending || mutation.variables === undefined) {
    return false;
  }

  if (typeof match === "function") {
    return (match as (variables: TVariables) => boolean)(mutation.variables);
  }

  return mutation.variables === match;
}
