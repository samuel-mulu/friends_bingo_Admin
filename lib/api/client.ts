import axios, { AxiosError, type AxiosRequestConfig } from "axios";

import { clearStoredSession, getStoredAccessToken } from "@/lib/auth/storage";
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  PaginatedResult,
} from "@/lib/api/types";

const baseURL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:3002";

export class ApiError extends Error {
  statusCode?: number;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode?: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const apiClient = axios.create({
  baseURL,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = getStoredAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const apiError = toApiError(error);

      if (typeof window !== "undefined" && apiError.statusCode === 401) {
        clearStoredSession();
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }

      return Promise.reject(apiError);
    }

    return Promise.reject(new ApiError("Unexpected network error."));
  },
);

export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.request<ApiSuccessEnvelope<T>>(config);
  return response.data.data;
}

export async function apiEnvelopeRequest<T>(
  config: AxiosRequestConfig,
): Promise<ApiSuccessEnvelope<T>> {
  const response = await apiClient.request<ApiSuccessEnvelope<T>>(config);
  return response.data;
}

export async function apiPaginatedRequest<T>(
  config: AxiosRequestConfig,
): Promise<PaginatedResult<T>> {
  const envelope = await apiEnvelopeRequest<T[]>(config);
  const pagination = envelope.meta?.pagination ?? {
    page: 1,
    pageSize: envelope.data.length,
    totalItems: envelope.data.length,
    totalPages: 1,
  };

  return {
    items: envelope.data,
    pagination,
  };
}

function toApiError(error: AxiosError<ApiErrorEnvelope>) {
  const envelope = error.response?.data;
  const errorNode = envelope?.error;
  const message = Array.isArray(errorNode?.message)
    ? errorNode.message.join(", ")
    : errorNode?.message || error.message || "Request failed.";

  return new ApiError(message, errorNode?.statusCode, errorNode?.details);
}
