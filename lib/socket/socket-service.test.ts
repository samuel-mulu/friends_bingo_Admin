import { afterEach, describe, expect, it, vi } from "vitest";

const socketInstances: MockSocket[] = [];

class MockSocket {
  connected = false;
  handlers = new Map<string, Set<(data: unknown) => void>>();
  lifecycleHandlers = new Map<string, Set<(data: unknown) => void>>();

  on(event: string, handler: (data: unknown) => void) {
    const bucket =
      event === "connect" || event === "disconnect" || event === "connect_error"
        ? this.lifecycleHandlers
        : this.handlers;

    if (!bucket.has(event)) {
      bucket.set(event, new Set());
    }

    bucket.get(event)!.add(handler);
  }

  off(event: string, handler?: (data: unknown) => void) {
    if (!handler) {
      return;
    }

    this.handlers.get(event)?.delete(handler);
    this.lifecycleHandlers.get(event)?.delete(handler);
  }

  removeAllListeners() {
    this.handlers.clear();
    this.lifecycleHandlers.clear();
  }

  disconnect() {
    this.connected = false;
  }

  connect() {
    this.connected = true;
    this.lifecycleHandlers.get("connect")?.forEach((handler) => handler(undefined));
  }

  emit(event: string, payload: unknown) {
    this.handlers.get(event)?.forEach((handler) => handler(payload));
  }
}

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => {
    const socket = new MockSocket();
    socketInstances.push(socket);
    return socket;
  }),
}));

describe("SocketService", () => {
  afterEach(async () => {
    socketInstances.length = 0;
    vi.resetModules();
  });

  it("keeps handlers registered when connect runs after on()", async () => {
    const { socketService } = await import("./socket-service");
    const handler = vi.fn();

    socketService.on("game:number_called", handler);
    socketService.connect("http://localhost:3002", "token-a");

    const socket = socketInstances.at(-1);
    expect(socket).toBeDefined();

    socket!.emit("game:number_called", { order: 1, number: 12 });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ order: 1, number: 12 }),
    );
  });

  it("re-attaches handlers when connect is called with a new token", async () => {
    const { socketService } = await import("./socket-service");
    const handler = vi.fn();

    socketService.on("game:number_called", handler);
    socketService.connect("http://localhost:3002", "token-a");
    socketService.connect("http://localhost:3002", "token-b");

    const socket = socketInstances.at(-1);
    socket!.emit("game:number_called", { order: 2, number: 34 });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
