import { describe, expect, it } from "vitest";

import { resolveStandardRegistrationOpenGame } from "./standard-registration-head";

describe("resolveStandardRegistrationOpenGame", () => {
  it("keeps an explicit standard registrationOpenGame", () => {
    const head = {
      slotId: "std",
      rawStatus: "READY",
      category: "NORMAL",
    };
    expect(
      resolveStandardRegistrationOpenGame(head, [
        { slotId: "q1", rawStatus: "NEXT", category: "NORMAL" },
      ]),
    ).toBe(head);
  });

  it("promotes FIFO READY from queue when registrationOpenGame is Big Game", () => {
    const ready = {
      slotId: "s24",
      rawStatus: "READY",
      category: "NORMAL",
      staticCode: "ONE_COLUMN-S24",
    };
    expect(
      resolveStandardRegistrationOpenGame(
        {
          slotId: "bg",
          rawStatus: "READY",
          category: "BIG_GAME",
          isBigGame: true,
        },
        [
          { slotId: "next", rawStatus: "NEXT", category: "BONUS" },
          ready,
        ],
      ),
    ).toEqual(ready);
  });

  it("promotes READY when registrationOpenGame is null", () => {
    const ready = {
      slotId: "gotd",
      rawStatus: "READY",
      category: "BIG_GOTD",
    };
    expect(resolveStandardRegistrationOpenGame(null, [ready])).toEqual(ready);
  });

  it("returns null when only NEXT standards are queued", () => {
    expect(
      resolveStandardRegistrationOpenGame(
        { slotId: "bg", category: "BIG_GAME", isBigGame: true },
        [{ slotId: "n1", rawStatus: "NEXT", category: "CHAIN_GAME" }],
      ),
    ).toBeNull();
  });

  it("ignores Big Game rows in the queue", () => {
    expect(
      resolveStandardRegistrationOpenGame(null, [
        {
          slotId: "bg",
          rawStatus: "READY",
          category: "BIG_GAME",
          isBigGame: true,
        },
      ]),
    ).toBeNull();
  });
});
