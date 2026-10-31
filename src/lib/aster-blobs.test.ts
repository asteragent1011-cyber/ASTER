import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BotAvatar, MausAvatar } from "@/components/Avatar";
import { AsterBlobAvatar } from "@/components/aster/AsterBlobAvatar";
import { MASCOT_BODIES } from "../../shared/mascot-bodies";
import { ASTER_BLOB_IDS, COMPANION_COLORS, COMPANION_PALETTES, asterBlobFor, choosingCompanion, companionBody, companionName, companionPalette, wearsOriginalColor, blobMotionFor, blobPhase, blobStateFor, botBodyFor, isAsterBlob } from "./aster-blobs";

describe("which companion a bot wears", () => {
  it("is stable for a bot and spreads a roster across all four", () => {
    expect(asterBlobFor("5409ef29-6a07-4bfb-b4f7-f3bc2a205330")).toBe(asterBlobFor("5409ef29-6a07-4bfb-b4f7-f3bc2a205330"));
    const worn = new Set(Array.from({ length: 40 }, (_, i) => asterBlobFor(`bot-${i}`)));
    expect([...worn].sort()).toEqual([...ASTER_BLOB_IDS].sort());
  });

  it("ignores a retired geometric body: the bot wears the companion its id picks", () => {
    // The live bots: Yuki saved hexagon, Moss blob, Comet drop. None of it shows.
    for (const legacy of ["hexagon", "blob", "drop", "cursor", "star", "mochi", "nonsense"]) {
      expect(botBodyFor({ id: "koda", mascotBody: legacy })).toBe(asterBlobFor("koda"));
    }
    expect(botBodyFor({ id: "koda", mascotBody: null })).toBe(asterBlobFor("koda"));
    expect(botBodyFor({ name: "Koda" })).toBe(asterBlobFor("Koda"));
    expect(botBodyFor({})).toBe("luma");
  });

  it("honours a saved companion id, the only body that still means anything", () => {
    expect(botBodyFor({ id: "koda", mascotBody: "echo" })).toBe("echo");
    expect(isAsterBlob(botBodyFor({ id: "anything" }))).toBe(true);
  });

  it("every companion is a real catalog body, so the picker and the phones know it", () => {
    for (const id of ASTER_BLOB_IDS) expect(MASCOT_BODIES[id].id).toBe(id);
  });
});

describe("the companions' moods and beats", () => {
  it("busy alone decides thinking when it is known: a coder at rest is not thinking", () => {
    expect(blobStateFor("working", true)).toBe("thinking");
    expect(blobStateFor("working", false)).toBe("idle");
    expect(blobStateFor("working")).toBe("thinking");
    expect(blobStateFor("happy", false)).toBe("happy");
    expect(blobStateFor("drowsy", false)).toBe("sleepy");
    expect(blobStateFor("notifying", false)).toBe("alert");
    expect(blobStateFor("idle", false)).toBe("idle");
  });

  it("maps the avatar's one-shot motions onto the companion beats", () => {
    expect(blobMotionFor("launch")).toBe("message-sent");
    expect(blobMotionFor("success")).toBe("message-received");
    expect(blobMotionFor("blink")).toBe("blink");
    expect(blobMotionFor("none")).toBeNull();
    expect(blobMotionFor("failure")).toBe("worried");
  });

  it("gives each bot its own phase so a roster never moves in step", () => {
    const a = blobPhase("koda");
    expect(a).toEqual(blobPhase("koda"));
    expect(a).not.toEqual(blobPhase("yuki"));
    expect(a.enterDelayMs).toBeGreaterThanOrEqual(0);
    expect(a.enterDelayMs).toBeLessThan(240);
  });
});

describe("AsterBlobAvatar", () => {
  const render = (props: Parameters<typeof AsterBlobAvatar>[0]) => renderToStaticMarkup(createElement(AsterBlobAvatar, props));

  it("draws each companion with its visor, eyes and own details at full size", () => {
    const luma = render({ body: "luma", size: 64, label: "Koda" });
    expect(luma).toContain('data-body="luma"');
    expect(luma).toContain("aster-blob__eyes");
    expect(luma).toContain("aster-blob__star");
    expect(luma).toContain("aster-blob__ring");
    expect(luma).toContain('aria-label="Koda"');
    expect(render({ body: "orbit", size: 64 }).match(/aster-blob__moon/g)).toHaveLength(3);
    expect(render({ body: "echo", size: 64 })).not.toContain("aster-blob__ring");
  });

  it("drops the rings and particles at small sizes so the face still reads", () => {
    const small = render({ body: "orbit", size: 24 });
    expect(small).toContain("aster-blob__eyes");
    expect(small).not.toContain("aster-blob__ring");
    expect(small).not.toContain("aster-blob__moon");
    expect(small).not.toContain("aster-blob__particle");
  });

  it("says its mood, stills itself on request, and hides from assistive tech without a label", () => {
    expect(render({ body: "nova", state: "thinking" })).toContain('data-state="thinking"');
    expect(render({ body: "nova", animated: false })).toContain("aster-blob--still");
    expect(render({ body: "nova" })).toContain('aria-hidden="true"');
  });
});

describe("bots wear their companion everywhere BotAvatar draws them", () => {
  it("an unbodied bot and a bot with a retired body both get their companion; an uploaded image is kept", () => {
    const unbodied = renderToStaticMarkup(createElement(BotAvatar, { bot: { id: "koda", name: "Koda", color: "green" }, animated: false }));
    expect(unbodied).toContain(`data-body="${asterBlobFor("koda")}"`);
    const legacy = renderToStaticMarkup(createElement(BotAvatar, { bot: { id: "koda", name: "Koda", color: "green", mascotBody: "hexagon" }, animated: false }));
    expect(legacy).toContain(`data-body="${asterBlobFor("koda")}"`);
    const photo = renderToStaticMarkup(createElement(BotAvatar, { bot: { id: "koda", name: "Koda", color: "green", avatarUrl: "/api/attachments/koda.webp", avatarCrop: "circle" } }));
    expect(photo).toContain("<img");
    expect(photo).not.toContain("aster-blob");
  });

  it("a busy bot thinks; a selected one shows it", () => {
    expect(renderToStaticMarkup(createElement(BotAvatar, { bot: { id: "koda", color: "green", busy: true } }))).toContain('data-state="thinking"');
    expect(renderToStaticMarkup(createElement(MausAvatar, { color: "green", bodyId: "luma", selected: true }))).toContain('data-state="selected"');
  });
});

describe("the home's central mascot is the open bot's companion", () => {
  // MascotCentrepiece reads the bot ChatView is showing, so switching chats is
  // switching this prop; no mascot state of its own to get stuck.
  const hero = async (bot: { id: string; name: string; mascotBody?: string }) => {
    const { MascotCentrepiece } = await import("@/components/MascotCentrepiece");
    const full = { threadId: `t-${bot.id}`, title: "", description: "", notifications: false, color: "green", unread: false,
      modelSelection: { instanceId: "local", model: "m" }, messages: [], ...bot } as never;
    const markup = renderToStaticMarkup(createElement(MascotCentrepiece, { bot: full, messages: [] }));
    return /data-mascot-companion[\s\S]*?data-body="([a-z]+)"/.exec(markup)?.[1];
  };

  it("draws the bot's own companion, and switching bots switches it", async () => {
    const bots = ["yuki-id", "moss-id", "comet-id", "koda-id"].map((id) => ({ id, name: id.split("-")[0]! }));
    for (const bot of bots) expect(await hero(bot)).toBe(asterBlobFor(bot.id));
    expect(new Set(await Promise.all(bots.map(hero))).size).toBeGreaterThan(1);
  });

  it("is the bot's companion even when the bot saved a retired body", async () => {
    expect(await hero({ id: "yuki-id", name: "Yuki", mascotBody: "hexagon" })).toBe(asterBlobFor("yuki-id"));
  });
});

describe("a bot's colour tints its companion", () => {
  const hue = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number];
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return h * 60;
  };
  const lightness = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return (Math.max(...v) + Math.min(...v)) / 510;
  };

  it("each companion's own colour, or none, draws the brand sheet untouched", () => {
    for (const id of ASTER_BLOB_IDS) {
      expect(companionPalette(id)).toEqual(COMPANION_PALETTES[id]);
      expect(companionPalette(id, COMPANION_COLORS[id])).toEqual(COMPANION_PALETTES[id]);
      expect(companionPalette(id, "not-a-colour")).toEqual(COMPANION_PALETTES[id]);
    }
  });

  it("another colour turns the whole palette to it, keeping each swatch's lightness", () => {
    for (const id of ASTER_BLOB_IDS) {
      const green = companionPalette(id, "green");
      expect(green).not.toEqual(COMPANION_PALETTES[id]);
      expect(Math.abs(hue(green.mid) - hue("#009957"))).toBeLessThan(2);
      for (const key of ["light", "mid", "deep", "accent", "ring"] as const) {
        expect(Math.abs(lightness(green[key]) - lightness(COMPANION_PALETTES[id][key]))).toBeLessThan(0.01);
      }
      // the highlight stays the lightest swatch and the shade the deepest: still glossy, never flat
      expect(lightness(green.light)).toBeGreaterThan(lightness(green.mid));
      expect(lightness(green.mid)).toBeGreaterThan(lightness(green.deep));
    }
  });

  it("every avatar context draws the bot's colour, the face untouched", () => {
    const bot = { id: "koda", name: "Koda", color: "orange" as const };
    const tinted = companionPalette(asterBlobFor("koda"), "orange");
    // sidebar, header, messages and group rows all draw through BotAvatar at their sizes
    for (const size of [24, 36, 44, 250]) {
      const markup = renderToStaticMarkup(createElement(BotAvatar, { bot, size, animated: false }));
      expect(markup).toContain('data-color="orange"');
      expect(markup).toContain(`stop-color="${tinted.deep}"`);
      expect(markup).toContain('stop-color="#14163A"');
    }
  });

  it("the home's central mascot wears the bot's colour", async () => {
    const { MascotCentrepiece } = await import("@/components/MascotCentrepiece");
    const bot = { id: "koda", threadId: "t", name: "Koda", title: "", description: "", notifications: false, color: "teal", unread: false,
      modelSelection: { instanceId: "local", model: "m" }, messages: [] } as never;
    const markup = renderToStaticMarkup(createElement(MascotCentrepiece, { bot, messages: [] }));
    expect(markup).toMatch(/data-mascot-companion[\s\S]*?data-color="teal"/);
  });

  it("a bot with its own picture shows it in a circle, whatever older shape it saved", () => {
    for (const crop of ["circle", "rounded", "square"] as const) {
      const markup = renderToStaticMarkup(createElement(BotAvatar, {
        bot: { id: "koda", name: "Koda", color: "green", avatarUrl: "/api/attachments/koda.webp", avatarCrop: crop },
      }));
      expect(markup).toContain("border-radius:50%");
    }
  });
});


describe("choosing a companion", () => {
  it("saves the companion id and shows it, even over a picture the bot had", () => {
    for (const id of ASTER_BLOB_IDS) {
      const patch = choosingCompanion({ id: "koda", color: "teal", avatarUrl: "/api/attachments/k.webp" } as never, id);
      expect(patch).toEqual({ mascotBody: id, avatarCrop: "mascot" });
    }
  });

  it("keeps a colour the bot chose; Original follows the new companion", () => {
    expect(choosingCompanion({ id: "koda", mascotBody: "nova", color: "coral" }, "orbit").color).toBeUndefined();
    expect(choosingCompanion({ id: "koda", mascotBody: "nova", color: COMPANION_COLORS.nova }, "orbit").color).toBe(COMPANION_COLORS.orbit);
    expect(wearsOriginalColor({ id: "koda", mascotBody: "luma", color: "purple" })).toBe(true);
    expect(wearsOriginalColor({ id: "koda", mascotBody: "luma", color: "green" })).toBe(false);
  });

  it("a saved companion beats the id's pick and any legacy setting; unknown ids fall back to Luma", () => {
    for (const id of ASTER_BLOB_IDS) {
      const markup = renderToStaticMarkup(createElement(BotAvatar, {
        bot: { id: "koda", color: "green", mascotBody: id, avatarUrl: "/api/attachments/k.webp", avatarCrop: "mascot" },
        animated: false,
      }));
      expect(markup).toContain(`data-body="${id}"`);
      expect(markup).not.toContain("<img");
    }
    for (const unknown of [undefined, null, "", "hexagon", "LUMA", "nonsense"]) expect(companionBody(unknown)).toBe("luma");
    expect(renderToStaticMarkup(createElement(MausAvatar, { bodyId: "nonsense" }))).toContain('data-body="luma"');
  });

  it("names every companion from the shared catalog", () => {
    expect(ASTER_BLOB_IDS.map(companionName)).toEqual(["Luma", "Nova", "Orbit", "Echo"]);
  });
});

describe("speaking", () => {
  it("a reply read aloud speaks, even while busy; an alert still wins", () => {
    expect(blobStateFor("dictating", true)).toBe("speaking");
    expect(blobStateFor("humming")).toBe("speaking");
    expect(blobStateFor("writing", false)).toBe("idle");
  });
});

describe("switching chats switches the header companion", () => {
  it("each bot's header draws its own saved companion and colour", async () => {
    const { MascotCompanionHeader } = await import("@/components/MascotCentrepiece");
    const make = (id: string, mascotBody: string, color: string) => ({ id, threadId: `t-${id}`, name: id, title: "", description: "",
      notifications: false, color, unread: false, modelSelection: { instanceId: "local", model: "m" }, messages: [], mascotBody }) as never;
    const header = (bot: never) => renderToStaticMarkup(createElement(MascotCompanionHeader, { bot, messages: [] }));
    const first = header(make("yuki", "echo", "teal"));
    const second = header(make("moss", "nova", "cyan"));
    expect(first).toContain('data-body="echo"');
    expect(first).toContain('data-color="teal"');
    expect(second).toContain('data-body="nova"');
    expect(second).toContain('data-color="cyan"');
    expect(second).not.toContain('data-body="echo"');
  });
});
