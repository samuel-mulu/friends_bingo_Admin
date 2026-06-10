import { ApiError } from "@/lib/api/client";

export function isApiRateLimitError(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 429;
}

export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong.",
) {
  if (error instanceof ApiError) {
    return error.message;
  }

  return fallback;
}
