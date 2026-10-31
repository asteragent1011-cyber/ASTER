import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StoreProvider, type Bot, type Message, type Task } from "@/state/store";
import { ASTER_MODES, GROWTH_STAGES } from "@/lib/aster-companion";
import { AsterContextPanel } from "./AsterContextPanel";
import { DesktopCapabilitiesProvider } from "../DesktopCapabilities";

const said = (role: Message["role"], kind: Message["kind"] = "text") =>
  ({ id: `${role}-${kind}-${Math.random()}`, role, kind, text: "x", at: 0 }) as unknown as Message;

function makeBot(task: Partial<Task> | null, messages: Message[] = []): Bot {
  return {
    id: "sage", threadId: "t1", name: "Sage", title: "", description: "", notifications: false,
    color: "red", unread: false, modelSelection: { instanceId: "local", model: "m" }, messages,
    ...(task === null ? {} : { tasks: [{ threadId: "t1", title: "Chat", createdAt: 0, ...task }] }),
  } as Bot;
}

const panel = (bot: Bot) => renderToStaticMarkup(
  createElement(StoreProvider, null, createElement(AsterContextPanel, { bot, unreadCount: 0, onOpenSearch: () => {}, onOpenChats: () => {} })),
);
const checkedMode = (markup: string) => /aria-checked="true"[^>]*data-aster-mode="([a-z]+)"/.exec(markup)?.[1];
const currentStage = (markup: string) => /aria-current="step"[\s\S]*?data-growth-stage="([a-z]+)"/.exec(markup)?.[1];

describe("the companion panel reads the open conversation", () => {
  it("shows the mode saved on the conversation, Balanced when none is", () => {
    expect(checkedMode(panel(makeBot({})))).toBe("balanced");
    for (const mode of ASTER_MODES) expect(checkedMode(panel(makeBot({ asterMode: mode })))).toBe(mode);
  });

  it("reads Growth from the messages, and shows a stage set by hand with a way back", () => {
    const answered = [said("user"), said("bot")];
    const auto = panel(makeBot({}, answered));
    expect(currentStage(auto)).toBe("achieved");
    expect(auto).toContain("Where this conversation stands");
    expect(auto).not.toContain("Back to automatic");
    for (const stage of GROWTH_STAGES) {
      const pinned = panel(makeBot({ growthStage: stage }, answered));
      expect(currentStage(pinned)).toBe(stage);
      expect(pinned).toContain("Set by you for this conversation");
      expect(pinned).toContain("Back to automatic");
    }
  });

  it("every mode and stage is a control; they wait while the conversation has not loaded", () => {
    const ready = panel(makeBot({}));
    expect(ready.match(/<button[^>]*data-aster-mode=/g)).toHaveLength(5);
    expect(ready.match(/<button[^>]*data-growth-stage=/g)).toHaveLength(5);
    expect(ready).not.toMatch(/<button[^>]*disabled=""[^>]*data-(aster-mode|growth-stage)/);
    const loading = panel(makeBot(null));
    expect(loading).toContain("Loading this conversation...");
    expect(loading.match(/<button[^>]*disabled=""[^>]*data-(aster-mode|growth-stage)=/g)).toHaveLength(10);
  });
});

describe("the companion panel on Windows", () => {
  const withPlatform = (platform: string | undefined, render: () => string) => {
    const previous = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = platform ? { ogb: { platform } } : undefined;
    try {
      return render();
    } finally {
      (globalThis as { window?: unknown }).window = previous;
    }
  };
  const asideClass = (markup: string) => /<aside[^>]*class="([^"]*)"/.exec(markup)?.[1] ?? "";
  const desktopPanel = (bot: Bot) => renderToStaticMarkup(createElement(DesktopCapabilitiesProvider, null,
    createElement(StoreProvider, null, createElement(AsterContextPanel, { bot, unreadCount: 0, onOpenSearch: () => {}, onOpenChats: () => {} }))));

  it("drops below the renderer-drawn caption buttons, which own the window's top-right corner", () => {
    expect(asideClass(withPlatform("win32", () => desktopPanel(makeBot({}))))).toContain("pt-[28px]");
  });

  it("keeps the macOS and browser layout exactly as it was", () => {
    for (const platform of ["darwin", undefined]) {
      const classes = asideClass(withPlatform(platform, () => desktopPanel(makeBot({}))));
      expect(classes).toContain("py-5");
      expect(classes).not.toContain("pt-[28px]");
    }
  });
});
