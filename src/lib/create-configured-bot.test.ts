import { afterEach, describe, expect, it, vi } from "vitest";
import { api, persistBotUpdate, type Bot } from "@/state/store";
import { BotCreationDraft, EMPTY_BOT_DEFAULTS } from "./bot-creation-draft";
import { createConfiguredBot } from "./create-configured-bot";
import { botBodyFor, choosingCompanion, COMPANION_COLORS } from "./aster-blobs";

afterEach(() => vi.unstubAllGlobals());

describe("configured bot creation", () => {
  function fixture(mode: "ask" | "auto" | "full" | "custom", fail = 0, selection?: Bot["modelSelection"]) {
    const draft = new BotCreationDraft(EMPTY_BOT_DEFAULTS, vi.fn());
    draft.patch({ name: "Fixture", approvalMode: mode, notifications: false, confirmFullAccess: true });
    let bot = { ...draft.bot, id: "created", threadId: "initial", approvalMode: "ask" } as Bot;
    if (selection) bot.modelSelection = selection;
    const events: string[] = [];
    const bodies: unknown[] = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      events.push(`${init?.method} ${path}`);
      const body = JSON.parse(String(init?.body ?? "{}"));
      bodies.push(body);
      if (init?.method === "PATCH") bot = { ...bot, ...body };
      return { bot };
    }) as unknown as typeof api;
    let grants = 0;
    const approvals = { setMode: vi.fn(async (_id: string, grant: string, options?: { threadId?: string }) => {
      events.push(`grant ${options?.threadId ?? "bot"}`);
      if (++grants === fail) throw new Error("Grant rejected");
      bot = { ...bot, approvalMode: grant } as Bot;
      return bot;
    }) };
    return { draft, events, bodies, request, approvals };
  }

  it("sets the chosen audience in the first creation request", async () => {
    const f = fixture("ask");
    await createConfiguredBot(f.draft, f.request, persistBotUpdate, f.approvals, "admins");
    expect(f.events[0]).toBe("POST /api/bots");
    expect(f.bodies[0]).toMatchObject({ visibility: "admins", useDefaults: false });
  });

  it("saves the colour and the companion the editor showed, though the server picks a new id", async () => {
    const f = fixture("ask");
    f.draft.patch({ color: "coral" });
    const shown = botBodyFor(f.draft.bot);
    const result = await createConfiguredBot(f.draft, f.request, persistBotUpdate, f.approvals);
    expect(f.bodies[1]).toMatchObject({ color: "coral", mascotBody: shown });
    expect(result.bot.color).toBe("coral");
    expect(botBodyFor(result.bot)).toBe(shown);
  });

  it("a picked companion and an untouched colour are saved as shown: Original, not the server's rotating colour", async () => {
    for (const body of ["luma", "nova", "orbit", "echo"] as const) {
      const f = fixture("ask");
      f.draft.patch(choosingCompanion(f.draft.bot, body));
      expect(f.draft.bot.color).toBe(COMPANION_COLORS[body]);
      const result = await createConfiguredBot(f.draft, f.request, persistBotUpdate, f.approvals);
      expect(f.bodies[1]).toMatchObject({ mascotBody: body, color: COMPANION_COLORS[body], avatarCrop: "mascot" });
      expect(botBodyFor(result.bot)).toBe(body);
    }
  });

  it("a colour picked before the companion survives the companion change", async () => {
    const f = fixture("ask");
    f.draft.patch({ color: "teal" });
    f.draft.patch(choosingCompanion(f.draft.bot, "orbit"));
    await createConfiguredBot(f.draft, f.request, persistBotUpdate, f.approvals);
    expect(f.bodies[1]).toMatchObject({ mascotBody: "orbit", color: "teal" });
  });

  it("keeps the server-completed workspace effort when applying draft settings", async () => {
    const selection = { instanceId: "claude", model: "sonnet", effort: "high" as const };
    const f = fixture("ask", 0, selection);
    f.draft.setModel({ instanceId: selection.instanceId, model: selection.model });
    const result = await createConfiguredBot(f.draft, f.request, persistBotUpdate, f.approvals);
    expect(f.bodies[0]).toMatchObject({ modelSelection: { instanceId: "claude", model: "sonnet" } });
    expect(f.bodies[1]).toMatchObject({ modelSelection: selection });
    expect(result.bot.modelSelection).toEqual(selection);
  });

  for (const mode of ["ask", "auto", "full", "custom"] as const) {
    it(`commits ${mode} settings without reapplying the template`, async () => {
      const f = fixture(mode);
      const result = await createConfiguredBot(f.draft, f.request, persistBotUpdate, f.approvals);
      expect(f.bodies[0]).toMatchObject({ useDefaults: false, name: "Fixture" });
      expect(result.bot).toMatchObject({ approvalMode: mode, notifications: false });
      expect(result.warnings).toEqual([]);
      expect(f.events.filter(event => event.startsWith("grant"))).toEqual(
        mode === "full" || mode === "custom" ? ["grant bot", "grant initial"] : [],
      );
      expect(f.events).not.toContain("DELETE /api/bots/created");
    });
  }

  for (const fail of [1, 2]) {
    it(`rolls back when native grant ${fail} fails`, async () => {
      const f = fixture("full", fail);
      await expect(createConfiguredBot(f.draft, f.request, persistBotUpdate, f.approvals)).rejects.toThrow("Grant rejected");
      expect(f.events.at(-1)).toBe("DELETE /api/bots/created");
    });
  }

  it("does not grant the initial thread when the native bot grant returns the wrong mode", async () => {
    const f = fixture("full");
    f.approvals.setMode.mockImplementation(async () => ({ ...f.draft.bot, id: "created", threadId: "initial", approvalMode: "ask" }));
    await expect(createConfiguredBot(f.draft, f.request, persistBotUpdate, f.approvals)).rejects.toThrow("was not granted");
    expect(f.approvals.setMode).toHaveBeenCalledTimes(1);
    expect(f.events.at(-1)).toBe("DELETE /api/bots/created");
  });
});
