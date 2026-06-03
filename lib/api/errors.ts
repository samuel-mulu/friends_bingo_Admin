import { ApiError } from "@/lib/api/client";

export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong.",
) {
  if (error instanceof ApiError) {
    return error.message;
  }

  return fallback;
}
