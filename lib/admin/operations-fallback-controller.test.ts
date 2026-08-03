import { afterEach, describe, expect, it, vi } from "vitest";

import { createOperationsFallbackController } from "./operations-fallback-controller";

describe("operations-fallback-controller", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps at most one fallback timer alive across repeated sync calls", () => {
    vi.useFakeTimers();

    const enabled = true;
    const visible = true;
    const fetching = false;
    const onTick = vi.fn();
    const onVisible = vi.fn();
    const controller = createOperationsFallbackController({
      intervalMs: 1_000,
      isEnabled: () => enabled,
      isVisible: () => visible,
      isFetching: () => fetching,
      onTick,
      onVisible,
    });

    controller.sync();
    controller.sync();
    controller.sync();

    vi.advanceTimersByTime(3_000);

    expect(controller.isRunning()).toBe(true);
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it("does not poll while realtime fallback is disabled or while a fetch is in flight", () => {
    vi.useFakeTimers();

    let enabled = false;
    const visible = true;
    let fetching = false;
    const onTick = vi.fn();
    const controller = createOperationsFallbackController({
      intervalMs: 1_000,
      isEnabled: () => enabled,
      isVisible: () => visible,
      isFetching: () => fetching,
      onTick,
      onVisible: vi.fn(),
    });

    controller.sync();
    vi.advanceTimersByTime(2_000);
    expect(onTick).not.toHaveBeenCalled();

    enabled = true;
    fetching = true;
    controller.sync();
    vi.advanceTimersByTime(2_000);
    expect(onTick).not.toHaveBeenCalled();

    fetching = false;
    vi.advanceTimersByTime(1_000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("pauses while hidden and triggers at most one stale refresh when visible again", () => {
    vi.useFakeTimers();

    const enabled = true;
    let visible = true;
    const onTick = vi.fn();
    const onVisible = vi.fn();
    const controller = createOperationsFallbackController({
      intervalMs: 1_000,
      isEnabled: () => enabled,
      isVisible: () => visible,
      isFetching: () => false,
      onTick,
      onVisible,
    });

    controller.sync();
    vi.advanceTimersByTime(1_000);
    expect(onTick).toHaveBeenCalledTimes(1);

    visible = false;
    controller.handleVisibilityChange(false);
    vi.advanceTimersByTime(3_000);
    expect(onTick).toHaveBeenCalledTimes(1);

    visible = true;
    controller.handleVisibilityChange(true);
    controller.handleVisibilityChange(true);

    expect(onVisible).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it("stops polling on reconnect and on dispose", () => {
    vi.useFakeTimers();

    let enabled = true;
    const visible = true;
    const onTick = vi.fn();
    const controller = createOperationsFallbackController({
      intervalMs: 1_000,
      isEnabled: () => enabled,
      isVisible: () => visible,
      isFetching: () => false,
      onTick,
      onVisible: vi.fn(),
    });

    controller.sync();
    vi.advanceTimersByTime(1_000);
    expect(onTick).toHaveBeenCalledTimes(1);

    enabled = false;
    controller.sync();
    vi.advanceTimersByTime(2_000);
    expect(onTick).toHaveBeenCalledTimes(1);

    enabled = true;
    controller.sync();
    expect(controller.isRunning()).toBe(true);

    controller.dispose();
    expect(controller.isRunning()).toBe(false);

    vi.advanceTimersByTime(2_000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });
});
