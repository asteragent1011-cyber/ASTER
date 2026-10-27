import { describe, expect, it } from "vitest";

import { companionMood, greetingFor, growthStage, readAsterMode, saveAsterMode } from "./aster-companion";
import type { Message } from "@/state/store";

const msg = (role: Message["role"], kind: Message["kind"] = "text"): Message =>
  ({ id: `${role}-${kind}-${Math.random()}`, role, kind, text: "", at: 0 }) as unknown as Message;

describe("growthStage", () => {
  it("is curious before anything is asked, even with a bot greeting", () => {
    expect(growthStage({ messages: [] })).toBe("curious");
    expect(growthStage({ messages: [msg("bot")] })).toBe("curious");
  });

  it("is learning when asked and not started", () => {
    expect(growthStage({ messages: [msg("user")] })).toBe("learning");
  });

  it("is planning while thinking, working while a tool runs", () => {
    expect(growthStage({ busy: true, messages: [msg("user")] })).toBe("planning");
    expect(growthStage({ busy: true, messages: [msg("user"), msg("bot", "activity")] })).toBe("working");
  });

  it("is achieved once answered, ignoring receipts after the answer", () => {
    expect(growthStage({ messages: [msg("user"), msg("bot"), msg("bot", "digest")] })).toBe("achieved");
  });
});

describe("companionMood", () => {
  it("maps busy, streaming and typing to the four moods", () => {
    expect(companionMood({})).toBe("idle");
    expect(companionMood({ typing: true })).toBe("listening");
    expect(companionMood({ busy: true })).toBe("thinking");
    expect(companionMood({ busy: true, streaming: true })).toBe("responding");
  });
});

describe("greetingFor", () => {
  it("splits the day", () => {
    expect(greetingFor(8)).toBe("morning");
    expect(greetingFor(14)).toBe("afternoon");
    expect(greetingFor(21)).toBe("evening");
    expect(greetingFor(2)).toBe("evening");
  });
});

describe("aster mode preference", () => {
  it("round-trips a valid mode and falls back to balanced", () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    expect(readAsterMode(storage)).toBe("balanced");
    saveAsterMode("technical", storage);
    expect(readAsterMode(storage)).toBe("technical");
    map.set("aster.mode", "bogus");
    expect(readAsterMode(storage)).toBe("balanced");
  });

  it("survives storage that throws", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(readAsterMode(broken)).toBe("balanced");
    expect(() => saveAsterMode("study", broken)).not.toThrow();
  });
});
