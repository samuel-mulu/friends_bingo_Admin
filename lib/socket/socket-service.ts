import { io, Socket } from "socket.io-client";

type ConnectionListener = (connected: boolean) => void;
type EventHandler = (data: unknown) => void;

export class SocketService {
  private socket: Socket | null = null;
  private token: string | null = null;
  private connectionListeners = new Set<ConnectionListener>();
  private eventHandlers = new Map<string, Set<EventHandler>>();

  connect(socketBaseUrl: string, token: string) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      return;
    }

    if (this.socket && this.token === normalizedToken) {
      return;
    }

    this.detachRegisteredHandlers();
    this.disconnectSocketOnly();

    this.token = normalizedToken;

    this.socket = io(`${socketBaseUrl}/realtime`, {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      auth: { token: normalizedToken },
      autoConnect: false,
      forceNew: true,
      multiplex: false,
      reconnection: true,
    });

    this.socket.on("connect", () => {
      console.log("[Socket] Connected");
      this.notifyConnectionListeners(true);
    });

    this.socket.on("disconnect", () => {
      console.log("[Socket] Disconnected");
      this.notifyConnectionListeners(false);
    });

    this.socket.on("connect_error", (error: Error) => {
      console.error("[Socket] Connection error:", error);
      this.notifyConnectionListeners(false);
    });

    this.attachRegisteredHandlers();
    this.socket.connect();
  }

  disconnect() {
    this.detachRegisteredHandlers();
    this.disconnectSocketOnly();
    this.token = null;
    this.notifyConnectionListeners(false);
  }

  on(event: string, handler: EventHandler) {
    let handlers = this.eventHandlers.get(event);
    if (!handlers) {
      handlers = new Set<EventHandler>();
      this.eventHandlers.set(event, handlers);
    }

    handlers.add(handler);
    this.socket?.on(event, handler);
  }

  off(event: string, handler?: EventHandler) {
    if (!handler) {
      return;
    }

    this.eventHandlers.get(event)?.delete(handler);
    this.socket?.off(event, handler);
  }

  onConnectionChange(listener: ConnectionListener) {
    this.connectionListeners.add(listener);
    listener(this.isConnected);

    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  private attachRegisteredHandlers() {
    if (!this.socket) {
      return;
    }

    for (const [event, handlers] of this.eventHandlers) {
      for (const handler of handlers) {
        this.socket.on(event, handler);
      }
    }
  }

  private detachRegisteredHandlers() {
    if (!this.socket) {
      return;
    }

    for (const [event, handlers] of this.eventHandlers) {
      for (const handler of handlers) {
        this.socket.off(event, handler);
      }
    }
  }

  private disconnectSocketOnly() {
    if (!this.socket) {
      return;
    }

    this.socket.disconnect();
    this.socket.removeAllListeners();
    this.socket = null;
  }

  private notifyConnectionListeners(connected: boolean) {
    this.connectionListeners.forEach((listener) => listener(connected));
  }
}

export const socketService = new SocketService();
