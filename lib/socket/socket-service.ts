import { io, Socket } from "socket.io-client";

export class SocketService {
  private socket: Socket | null = null;
  private token: string | null = null;

  connect(apiBaseUrl: string, token: string) {
    if (this.socket?.connected) {
      return;
    }

    this.token = token;

    this.socket = io(`${apiBaseUrl}/realtime`, {
      transports: ["websocket"],
      auth: { token },
      extraHeaders: { Authorization: `Bearer ${token}` },
      autoConnect: true,
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
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
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
