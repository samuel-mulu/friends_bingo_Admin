import { describe, expect, it, vi } from "vitest";

import { createAdminRealtimeBootstrap } from "./admin-realtime-bootstrap";

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("admin-realtime-bootstrap", () => {
  it("connects once when cookie auth hydrates to an authenticated admin", async () => {
    const fetchRealtimeToken = vi.fn().mockResolvedValue("jwt-1");
    const connect = vi.fn();
    const disconnect = vi.fn();
    const listeners = new Map<string, (payload: unknown) => void>();

    const controller = createAdminRealtimeBootstrap({
      socketBaseUrl: "http://localhost:3002",
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
    expect(connect).toHaveBeenCalledWith("http://localhost:3002", "jwt-1");
    expect(disconnect).not.toHaveBeenCalled();

    controller.dispose();
  });

  it("retries token fetch once with forceRefresh after connect_error", async () => {
    const fetchRealtimeToken = vi
      .fn()
      .mockResolvedValueOnce("jwt-1")
      .mockResolvedValueOnce("jwt-2");
    const connect = vi.fn();
    const listeners = new Map<string, (payload: unknown) => void>();

    const controller = createAdminRealtimeBootstrap({
      socketBaseUrl: "http://localhost:3002",
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
      "http://localhost:3002",
      "jwt-1",
    );
    expect(connect).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3002",
      "jwt-2",
    );

    controller.dispose();
  });
});
