import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAdminRealtimeBootstrap,
  resolveBrowserSocketBaseUrl,
} from "./admin-realtime-bootstrap";

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createListeners() {
  return new Map<string, (payload: unknown) => void>();
}

describe("resolveBrowserSocketBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null in production when NEXT_PUBLIC_SOCKET_URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SOCKET_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(resolveBrowserSocketBaseUrl()).toBeNull();
  });

  it("falls back to localhost in development when NEXT_PUBLIC_SOCKET_URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SOCKET_URL", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveBrowserSocketBaseUrl()).toBe("http://localhost:3002");
  });

  it("normalizes trailing slashes on the configured URL", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SOCKET_URL",
      "https://admin.friendschewata.com/",
    );
    vi.stubEnv("NODE_ENV", "production");

    expect(resolveBrowserSocketBaseUrl()).toBe(
      "https://admin.friendschewata.com",
    );
  });
});

describe("admin-realtime-bootstrap", () => {
  it("connects once when cookie auth hydrates to an authenticated admin", async () => {
    const fetchRealtimeToken = vi.fn().mockResolvedValue("jwt-1");
    const connect = vi.fn();
    const disconnect = vi.fn();
    const listeners = createListeners();

    const controller = createAdminRealtimeBootstrap({
      socketBaseUrl: "https://admin.friendschewata.com",
      fetchRealtimeToken,
      connect,
      disconnect,
      on: (event, handler) => {
        listeners.set(event, handler);
      },
      off: (event) => {
        listeners.delete(event);
      },
    });

    controller.syncAuth({ isHydrated: false, isAuthenticated: false });
    controller.syncAuth({ isHydrated: true, isAuthenticated: true });
    await flushAsyncWork();

    expect(fetchRealtimeToken).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(
      "https://admin.friendschewata.com",
      "jwt-1",
    );
    expect(disconnect).not.toHaveBeenCalled();

    controller.dispose();
  });

  it("does not fetch a token or connect when unauthenticated", async () => {
    const fetchRealtimeToken = vi.fn().mockResolvedValue("jwt-1");
    const connect = vi.fn();
    const disconnect = vi.fn();

    const controller = createAdminRealtimeBootstrap({
      socketBaseUrl: "https://admin.friendschewata.com",
      fetchRealtimeToken,
      connect,
      disconnect,
      on: vi.fn(),
      off: vi.fn(),
    });

    controller.syncAuth({ isHydrated: true, isAuthenticated: false });
    await flushAsyncWork();

    expect(fetchRealtimeToken).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  it("disconnects the socket on auth loss/logout", async () => {
    const fetchRealtimeToken = vi.fn().mockResolvedValue("jwt-1");
    const connect = vi.fn();
    const disconnect = vi.fn();

    const controller = createAdminRealtimeBootstrap({
      socketBaseUrl: "https://admin.friendschewata.com",
      fetchRealtimeToken,
      connect,
      disconnect,
      on: vi.fn(),
      off: vi.fn(),
    });

    controller.syncAuth({ isHydrated: true, isAuthenticated: true });
    await flushAsyncWork();

    expect(connect).toHaveBeenCalledTimes(1);

    controller.syncAuth({ isHydrated: true, isAuthenticated: false });
    await flushAsyncWork();

    expect(disconnect).toHaveBeenCalled();

    controller.dispose();
  });

  it("does not duplicate token fetch or connect on repeated auth sync", async () => {
    const fetchRealtimeToken = vi.fn().mockResolvedValue("jwt-1");
    const connect = vi.fn();

    const controller = createAdminRealtimeBootstrap({
      socketBaseUrl: "https://admin.friendschewata.com",
      fetchRealtimeToken,
      connect,
      disconnect: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    });

    controller.syncAuth({ isHydrated: true, isAuthenticated: true });
    controller.syncAuth({ isHydrated: true, isAuthenticated: true });
    await flushAsyncWork();

    expect(fetchRealtimeToken).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  it("keeps the socket disconnected when realtime-token fetch fails", async () => {
    const fetchRealtimeToken = vi.fn().mockResolvedValue(null);
    const connect = vi.fn();
    const disconnect = vi.fn();

    const controller = createAdminRealtimeBootstrap({
      socketBaseUrl: "https://admin.friendschewata.com",
      fetchRealtimeToken,
      connect,
      disconnect,
      on: vi.fn(),
      off: vi.fn(),
    });

    controller.syncAuth({ isHydrated: true, isAuthenticated: true });
    await flushAsyncWork();

    expect(fetchRealtimeToken).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();

    controller.dispose();
  });

  it("retries token fetch once with forceRefresh after connect_error", async () => {
    const fetchRealtimeToken = vi
      .fn()
      .mockResolvedValueOnce("jwt-1")
      .mockResolvedValueOnce("jwt-2");
    const connect = vi.fn();
    const listeners = createListeners();

    const controller = createAdminRealtimeBootstrap({
      socketBaseUrl: "https://admin.friendschewata.com",
      fetchRealtimeToken,
      connect,
      disconnect: vi.fn(),
      on: (event, handler) => {
        listeners.set(event, handler);
      },
      off: (event) => {
        listeners.delete(event);
      },
    });

    controller.syncAuth({ isHydrated: true, isAuthenticated: true });
    await flushAsyncWork();

    listeners.get("connect_error")?.(new Error("expired"));
    await flushAsyncWork();

    expect(fetchRealtimeToken).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchRealtimeToken).toHaveBeenNthCalledWith(2, {
      forceRefresh: true,
    });
    expect(connect).toHaveBeenNthCalledWith(
      1,
      "https://admin.friendschewata.com",
      "jwt-1",
    );
    expect(connect).toHaveBeenNthCalledWith(
      2,
      "https://admin.friendschewata.com",
      "jwt-2",
    );

    controller.dispose();
  });
});
