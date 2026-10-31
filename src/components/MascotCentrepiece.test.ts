import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Bot } from "@/state/store";
import { ASTER_BLOB_IDS, companionPalette } from "@/lib/aster-blobs";
import { MascotCompanionHeader } from "./MascotCentrepiece";

function makeBot(overrides: Partial<Bot> = {}): Bot {
  return {
    id: "sage-id",
    threadId: "t-sage",
    name: "Sage",
    title: "",
    description: "",
    notifications: false,
    color: "red",
    unread: false,
    modelSelection: { instanceId: "local", model: "m" },
    messages: [],
    ...overrides,
  };
}

const header = (bot: Bot, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(MascotCompanionHeader, { bot, messages: [], ...extra }));

describe("the chat's companion", () => {
  it("is the full living companion on the chat's background: no card, button or toggle", () => {
    const markup = header(makeBot({ mascotBody: "orbit" }));
    expect(markup).toContain("aster-blob--living");
    expect(markup).toContain("aster-blob__ring");
    expect(markup).toContain("aster-blob__particle");
    expect(markup).not.toMatch(/<button|aria-expanded|role="dialog"/);
    expect(markup).not.toMatch(/glass-card|glass-sheet|rounded-2xl|ring-2|shadow/);
    // one companion, not a compact one beside a large one
    expect(markup.match(/data-body=/g)).toHaveLength(1);
  });

  it("names the companion and keeps the bot's name and status beneath it", () => {
    const markup = header(makeBot());
    expect(markup).toContain('aria-label="Sage, your companion"');
    expect(markup).toMatch(/data-body="[a-z]+"[\s\S]*role="status"[\s\S]*>Sage<[\s\S]*>Ready</);
  });

  it("draws the open bot's own companion and colour, whichever of the four it is", () => {
    for (const body of ASTER_BLOB_IDS) {
      const markup = header(makeBot({ id: `${body}-bot`, name: body, mascotBody: body, color: "teal" }));
      expect(markup).toContain(`data-body="${body}"`);
      expect(markup).toContain('data-color="teal"');
      expect(markup).toContain(`stop-color="${companionPalette(body, "teal").deep}"`);
    }
  });

  it("follows the bot's activity: thinking, tools, errors, speaking", () => {
    const busy = header(makeBot({ busy: true }));
    expect(busy).toContain("Thinking...");
    expect(busy).toContain('data-state="thinking"');
    expect(header(makeBot(), { toolInFlight: true })).toContain("Running tools...");
    expect(header(makeBot(), { hasError: true })).toContain("Attention needed");
    expect(header(makeBot(), { speaking: true })).toContain('data-state="speaking"');
  });

  it("sizes down for a phone-width column (the server render is the narrow layout)", () => {
    expect(header(makeBot())).toContain("width:112px");
  });

  it("a bot's own picture stays its avatar here too", () => {
    expect(header(makeBot({ avatarUrl: "/api/attachments/sage.webp", avatarCrop: "circle" }))).toContain("<img");
  });
});
