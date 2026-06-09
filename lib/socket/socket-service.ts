import { io, Socket } from "socket.io-client";

type ConnectionListener = (connected: boolean) => void;

export class SocketService {
  private socket: Socket | null = null;
  private token: string | null = null;
  private connectionListeners = new Set<ConnectionListener>();

  connect(socketBaseUrl: string, token: string) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      return;
    }

    if (this.socket && this.token === normalizedToken) {
      return;
    }

    this.disconnect();

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

    this.socket.connect();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.removeAllListeners();
      this.socket = null;
    }
    this.token = null;
    this.notifyConnectionListeners(false);
  }

  on(event: string, handler: (data: unknown) => void) {
    this.socket?.on(event, handler);
  }

  off(event: string, handler?: (data: unknown) => void) {
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

  private notifyConnectionListeners(connected: boolean) {
    this.connectionListeners.forEach((listener) => listener(connected));
  }
}

export const socketService = new SocketService();
