export type OperationsFallbackControllerOptions = {
  intervalMs: number;
  isEnabled: () => boolean;
  isVisible: () => boolean;
  isFetching: () => boolean;
  onTick: () => void;
  onVisible: () => void;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
};

export type OperationsFallbackController = {
  sync: () => void;
  handleVisibilityChange: (visible: boolean) => void;
  dispose: () => void;
  isRunning: () => boolean;
};

export function createOperationsFallbackController(
  options: OperationsFallbackControllerOptions,
): OperationsFallbackController {
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;

  let timer: ReturnType<typeof setInterval> | null = null;
  let visible = options.isVisible();

  const stop = () => {
    if (timer == null) {
      return;
    }

    clearIntervalFn(timer);
    timer = null;
  };

  const start = () => {
    if (timer != null) {
      return;
    }

    timer = setIntervalFn(() => {
      if (!options.isEnabled() || !visible || options.isFetching()) {
        return;
      }

      options.onTick();
    }, options.intervalMs);
  };

  const sync = () => {
    if (options.isEnabled() && visible) {
      start();
      return;
    }

    stop();
  };

  return {
    sync,
    handleVisibilityChange(nextVisible: boolean) {
      const becameVisible = !visible && nextVisible;
      visible = nextVisible;
      sync();

      if (becameVisible && options.isEnabled()) {
        options.onVisible();
      }
    },
    dispose() {
      stop();
    },
    isRunning() {
      return timer != null;
    },
  };
}
