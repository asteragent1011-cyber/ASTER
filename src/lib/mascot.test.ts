import { describe, expect, it } from "vitest";

import { stateForBot } from "./mascot";

describe("stateForBot", () => {
  it("still alerts on a failed tool call when a digest receipt follows it", () => {
    // Phase 0 writes a digest row after every turn, so the failed chip is
    // no longer the last row; the mood must read past the receipt.
    expect(stateForBot({
      name: "Atlas",
      messages: [
        { kind: "activity", tool: { ok: false } },
        { kind: "digest" },
      ],
    })).toBe("alerting");
  });

  it("keeps reading a pending card as curious behind a receipt", () => {
    expect(stateForBot({ name: "Atlas", messages: [{ kind: "options" }, { kind: "digest" }] })).toBe("curious");
  });
});

describe("a retired pinned expression", () => {
  it("no longer fixes the companion's mood: a saved expression is kept in the profile but not drawn", () => {
    const bot = { name: "Koda", title: "", description: "", busy: true, mascotExpression: "sleeping" };
    expect(stateForBot(bot)).toBe("working");
  });
});
