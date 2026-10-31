import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StoreProvider, type Bot } from "@/state/store";
import { ASTER_BLOB_IDS, asterBlobFor, COMPANION_COLORS, companionPalette } from "@/lib/aster-blobs";
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

  it("previews the bot's own companion, whatever retired body it saved", () => {
    const companion = asterBlobFor("bot-1");
    for (const saved of [undefined, "hexagon", "drop", "cursor"]) {
      const markup = renderCard(makeBot(saved ? { mascotBody: saved as Bot["mascotBody"] } : {}));
      expect(preview(markup)).toBe(companion);
      expect(checkedCompanion(markup)).toBe(companion);
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

  it("offers the four companions as characters, live, named, and keyboard-reachable", () => {
    const markup = renderCard(makeBot({ mascotBody: "orbit" }));
    expect(markup).toContain('role="radiogroup"');
    for (const [id, name] of [["luma", "Luma"], ["nova", "Nova"], ["orbit", "Orbit"], ["echo", "Echo"]] as const) {
      const option = new RegExp(`<button[^>]*data-companion-option="${id}"[^>]*>[\\s\\S]*?data-body="${id}"[\\s\\S]*?>${name}</span>`);
      expect(markup).toMatch(option);
    }
    // one tab stop: the chosen companion; the rest are reached with the arrow keys
    expect(markup.match(/data-companion-option="[a-z]+"/g)).toHaveLength(4);
    expect(markup).toMatch(/role="radio" aria-checked="true" tabindex="0"[^>]*data-companion-option="orbit"/);
    expect(markup.match(/role="radio" aria-checked="false" tabindex="-1"[^>]*data-companion-option/g)).toHaveLength(3);
  });

  it("each saved companion is the one previewed and checked", () => {
    for (const id of ASTER_BLOB_IDS) {
      const markup = renderCard(makeBot({ mascotBody: id }));
      expect(preview(markup)).toBe(id);
      expect(checkedCompanion(markup)).toBe(id);
    }
  });

  it("the old expression grid and Reset mascot are gone", () => {
    const markup = renderCard(makeBot());
    expect(markup).not.toContain(">Expression<");
    expect(markup).not.toMatch(/expression"/);
    expect(markup).not.toContain("Reset mascot");
  });

  it("previews the companion in the bot's colour and marks that colour chosen", () => {
    const markup = renderCard(makeBot({ mascotBody: "nova", color: "coral" }));
    expect(markup).toMatch(/data-avatar-preview[\s\S]*?data-color="coral"/);
    expect(markup).toContain(`stop-color="${companionPalette("nova", "coral").mid}"`);
    expect(checkedSwatch(markup)).toBe("coral");
  });

  it("a reopened editor restores the saved colour, the companion unchanged", () => {
    for (const color of ["teal", "yellow", "pink"] as const) {
      const markup = renderCard(makeBot({ mascotBody: "echo", color }));
      expect(checkedSwatch(markup)).toBe(color);
      expect(preview(markup)).toBe("echo");
    }
  });

  it("a bot in its companion's own colour has Original chosen, listed first", () => {
    for (const id of ASTER_BLOB_IDS) {
      const markup = renderCard(makeBot({ mascotBody: id, color: COMPANION_COLORS[id] }));
      expect(checkedSwatch(markup)).toBe(COMPANION_COLORS[id]);
      expect(markup).toMatch(/data-swatch="([a-z]+)"/);
      expect(/data-swatch="([a-z]+)"/.exec(markup)?.[1]).toBe(COMPANION_COLORS[id]);
      expect(markup).toContain('aria-label="Original color"');
      // every colour once: Original stands in for the companion's own
      expect(markup.match(/data-swatch=/g)).toHaveLength(10);
    }
  });

  it("a shown picture leaves no companion chosen; a hidden one can be brought back", () => {
    const picture = renderCard(makeBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "circle" }));
    expect(checkedCompanion(picture)).toBeUndefined();
    expect(picture).not.toContain("data-swatch");
    const companion = renderCard(makeBot({ mascotBody: "luma", avatarUrl: "/api/attachments/cat.webp", avatarCrop: "mascot" }));
    expect(checkedCompanion(companion)).toBe("luma");
    expect(companion).toContain(">Use picture<");
  });
});

function preview(markup: string) {
  return /data-avatar-preview[\s\S]*?data-body="([a-z]+)"/.exec(markup)?.[1];
}
function checkedCompanion(markup: string) {
  return /aria-checked="true"[^>]*data-companion-option="([a-z]+)"/.exec(markup)?.[1];
}
function checkedSwatch(markup: string) {
  return /aria-checked="true"[^>]*data-swatch="([a-z]+)"/.exec(markup)?.[1];
}
