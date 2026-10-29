import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StoreProvider, type Bot } from "@/state/store";
import { asterBlobFor, COMPANION_COLORS, companionPalette } from "@/lib/aster-blobs";
import { BotProfileAvatarCard } from "./BotProfileAvatarCard";

function makeBot(overrides: Partial<Bot> = {}): Bot {
  return {
    id: "bot-1",
    threadId: "thread-1",
    name: "Maus",
    title: "Maus",
    description: "",
    notifications: false,
    color: "green",
    unread: false,
    modelSelection: { instanceId: "local", model: "test-model" },
    messages: [],
    ...overrides,
  };
}

function renderCard(bot: Bot) {
  return renderToStaticMarkup(
    createElement(
      StoreProvider,
      null,
      createElement(BotProfileAvatarCard, {
        bot,
        activeState: "idle",
        mascotMotion: null,
        onPatch: vi.fn(),
      }),
    ),
  );
}

describe("BotProfileAvatarCard and the companions", () => {
  it("offers no body picker: a bot's body is its companion", () => {
    const markup = renderCard(makeBot());
    expect(markup).not.toContain(">Body<");
    expect(markup).not.toMatch(/aria-label="Use the [A-Za-z]+ body"/);
  });

  it("shows the bot's own companion everywhere in the card, whatever retired body it saved", () => {
    const companion = asterBlobFor("bot-1");
    for (const saved of [undefined, "hexagon", "drop", "cursor"]) {
      const markup = renderCard(makeBot(saved ? { mascotBody: saved as Bot["mascotBody"] } : {}));
      const bodies = [...markup.matchAll(/data-body="([a-z]+)"/g)].map((match) => match[1]);
      expect(bodies.length).toBeGreaterThan(1);
      expect(new Set(bodies)).toEqual(new Set([companion]));
    }
  });

  it("offers zoom and drag framing for a custom image", () => {
    const markup = renderCard(makeBot({
      avatarUrl: "/api/attachments/cat.webp",
      avatarCrop: "circle",
      avatarZoom: 1.5,
    }));
    expect(markup).toContain('aria-label="Zoom avatar"');
    expect(markup).toContain("Drag the picture to reposition it");
    expect(markup).toContain("150%");
    expect(markup).toContain("Reset framing");
  });

  it("hides zoom controls for the mascot", () => {
    const markup = renderCard(makeBot());
    expect(markup).not.toContain('aria-label="Zoom avatar"');
  });

  it("keeps an uploaded image's framing controls, on purpose: a photo is the person's own", () => {
    const markup = renderCard(makeBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "rounded" }));
    expect(markup).toContain('aria-label="Zoom avatar"');
    expect(markup).not.toContain(">Body<");
  });

  it("offers no shape choice: Circle, Rounded and Square are gone, the companion is the shape", () => {
    for (const bot of [makeBot(), makeBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "square" })]) {
      const markup = renderCard(bot);
      expect(markup).not.toContain(">Shape<");
      for (const shape of ["Circle", "Rounded", "Square"]) expect(markup).not.toContain(`>${shape}<`);
    }
  });

  it("previews the companion in the bot's colour and marks that colour chosen", () => {
    const markup = renderCard(makeBot({ color: "coral" }));
    // the preview and every expression wear the colour, tinted, not flat
    const colours = [...markup.matchAll(/data-color="([a-z]+)"/g)].map((match) => match[1]);
    expect(colours.length).toBeGreaterThan(1);
    expect(new Set(colours)).toEqual(new Set(["coral"]));
    const tinted = companionPalette(asterBlobFor("bot-1"), "coral");
    expect(markup).toContain(`stop-color="${tinted.mid}"`);
    expect(markup).toMatch(/aria-pressed="true"[^>]*aria-label="Use coral mascot color"/);
    expect(markup).not.toMatch(/aria-pressed="true"[^>]*aria-label="Use green mascot color"/);
  });

  it("a reopened editor restores the saved colour, and switching colour keeps the companion", () => {
    for (const color of ["teal", "yellow", "pink"] as const) {
      const markup = renderCard(makeBot({ color }));
      expect(markup).toMatch(new RegExp(`aria-pressed="true"[^>]*aria-label="Use ${color} mascot color"`));
      expect(new Set([...markup.matchAll(/data-body="([a-z]+)"/g)].map((match) => match[1]))).toEqual(new Set([asterBlobFor("bot-1")]));
    }
  });

  it("Reset mascot restores the companion's own colour, the brand sheet untouched", () => {
    const body = asterBlobFor("bot-1");
    expect(companionPalette(body, COMPANION_COLORS[body])).toEqual(companionPalette(body));
  });
});

