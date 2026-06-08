import { io, Socket } from "socket.io-client";

export class SocketService {
  private socket: Socket | null = null;
  private token: string | null = null;

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
    });

    this.socket.on("disconnect", () => {
      console.log("[Socket] Disconnected");
    });

    this.socket.on("connect_error", (error: Error) => {
      console.error("[Socket] Connection error:", error);
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
  }

  on(event: string, handler: (data: unknown) => void) {
    this.socket?.on(event, handler);
  }

  off(event: string, handler?: (data: unknown) => void) {
    this.socket?.off(event, handler);
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();
