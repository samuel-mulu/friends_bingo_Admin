"use client";

export type AdminRealtimeBootstrapAuthState = {
  isHydrated: boolean;
  isAuthenticated: boolean;
};

type SocketLifecycleEvent = "connect" | "connect_error";

export type AdminRealtimeBootstrapOptions = {
  socketBaseUrl: string;
  fetchRealtimeToken: (options?: { forceRefresh?: boolean }) => Promise<string | null>;
  connect: (socketBaseUrl: string, token: string) => void;
  disconnect: () => void;
  on: (event: SocketLifecycleEvent, handler: (payload: unknown) => void) => void;
  off: (event: SocketLifecycleEvent, handler: (payload: unknown) => void) => void;
};

export type AdminRealtimeBootstrapController = {
  syncAuth: (state: AdminRealtimeBootstrapAuthState) => void;
  dispose: () => void;
};

export function createAdminRealtimeBootstrap(
  options: AdminRealtimeBootstrapOptions,
): AdminRealtimeBootstrapController {
  let disposed = false;
  let authState: AdminRealtimeBootstrapAuthState = {
    isHydrated: false,
    isAuthenticated: false,
  };
  let tokenFetchInFlight: Promise<string | null> | null = null;
  let connectAttemptInFlight: Promise<void> | null = null;
  let forceRefreshRetryAvailable = true;

  const handleConnected = () => {
    forceRefreshRetryAvailable = true;
  };

  const handleConnectError = () => {
    if (
      disposed ||
      !authState.isHydrated ||
      !authState.isAuthenticated ||
      !forceRefreshRetryAvailable
    ) {
      return;
    }

    forceRefreshRetryAvailable = false;
    void ensureConnected({ forceRefresh: true });
  };

  const fetchToken = async (
    optionsForFetch?: { forceRefresh?: boolean },
  ): Promise<string | null> => {
    if (tokenFetchInFlight) {
      return tokenFetchInFlight;
    }

    tokenFetchInFlight = options
      .fetchRealtimeToken(optionsForFetch)
      .finally(() => {
        tokenFetchInFlight = null;
      });

    return tokenFetchInFlight;
  };

  const ensureConnected = async (
    optionsForConnect?: { forceRefresh?: boolean },
  ): Promise<void> => {
    if (
      disposed ||
      !authState.isHydrated ||
      !authState.isAuthenticated ||
      connectAttemptInFlight
    ) {
      return connectAttemptInFlight ?? Promise.resolve();
    }

    connectAttemptInFlight = (async () => {
      const token = await fetchToken(optionsForConnect);

      if (
        disposed ||
        !authState.isHydrated ||
        !authState.isAuthenticated ||
        !token
      ) {
        if (!token) {
          options.disconnect();
        }
        return;
      }

      options.connect(options.socketBaseUrl, token);
    })().finally(() => {
      connectAttemptInFlight = null;
    });

    return connectAttemptInFlight;
  };

  options.on("connect", handleConnected);
  options.on("connect_error", handleConnectError);

  return {
    syncAuth(nextState) {
      authState = nextState;

      if (!authState.isHydrated) {
        return;
      }

      if (!authState.isAuthenticated) {
        forceRefreshRetryAvailable = true;
        options.disconnect();
        return;
      }

      void ensureConnected();
    },
    dispose() {
      disposed = true;
      options.off("connect", handleConnected);
      options.off("connect_error", handleConnectError);
      options.disconnect();
    },
  };
}
