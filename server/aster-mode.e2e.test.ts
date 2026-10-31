import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { launchVerificationServer, runControlOmb } from "../scripts/control-omb.ts";
import { ASTER_MODES, GROWTH_STAGES } from "../shared/aster-mode.ts";

// Aster Mode and Growth live on a conversation's thread: a mode reaches that
// conversation's next system prompt and no other's, and both survive a reload.
it("saves Aster Mode and Growth per conversation and sends the mode to the bot's next turn", async () => {
  const fixture = await launchVerificationServer();
  const api = async (method: string, path: string, body?: unknown, status?: number) => {
    const response = await fetch(`${fixture.info.url}${path}`, {
      method, headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json() as any;
    if (status) expect(response.status, JSON.stringify(result)).toBe(status);
    else expect(response.ok, JSON.stringify(result)).toBe(true);
    return result;
  };
  const control = (args: string[]) => runControlOmb([...args, "--url", fixture.info.url]) as Promise<any>;
  // the fake engine records the exact system prompt of the turn it ran
  const lastSystemPrompt = () => JSON.parse(readFileSync(fixture.fixtureDumpPath, "utf8")).systemPrompt as string;
  const turn = async (botId: string, threadId: string, text: string) => {
    await control(["send", "--bot", botId, "--task", threadId, "--text", text]);
    expect((await control(["wait", "--bot", botId, "--task", threadId, "--timeout", "30"])).status).toBe("settled");
    return lastSystemPrompt();
  };
  const taskOf = async (botId: string, threadId: string) =>
    ((await api("GET", "/api/bots?messages=0")).bots as any[]).find((bot) => bot.id === botId).tasks.find((task: any) => task.threadId === threadId);

  try {
    const catalog = await control(["models"]);
    const model = catalog.instances.find((item: any) => item.instanceId === "claude").models.options[0].id;
    const { bot } = await api("POST", "/api/bots", { name: "Mode helper", title: "Helper", modelSelection: { instanceId: "claude", model } });

    // Balanced (no mode saved) adds nothing to the prompt
    expect(await turn(bot.id, bot.threadId, "Say hi.")).not.toContain("Conversation mode");
    expect((await taskOf(bot.id, bot.threadId)).asterMode).toBeUndefined();

    // every other mode reaches the very next turn, and only its own guidance
    for (const mode of ASTER_MODES.filter((each) => each !== "balanced")) {
      await api("PATCH", `/api/bots/${bot.id}/tasks/${bot.threadId}`, { asterMode: mode });
      expect((await taskOf(bot.id, bot.threadId)).asterMode).toBe(mode);
      const system = await turn(bot.id, bot.threadId, `A ${mode} question.`);
      const label = mode[0]!.toUpperCase() + mode.slice(1);
      expect(system).toContain(`Conversation mode (${label}`);
      for (const other of ASTER_MODES.filter((each) => each !== mode && each !== "balanced")) {
        expect(system).not.toContain(`Conversation mode (${other[0]!.toUpperCase() + other.slice(1)}`);
      }
    }

    // back to Balanced: the section goes away, and the thread stores nothing
    await api("PATCH", `/api/bots/${bot.id}/tasks/${bot.threadId}`, { asterMode: "balanced" });
    expect((await taskOf(bot.id, bot.threadId)).asterMode).toBeUndefined();
    expect(await turn(bot.id, bot.threadId, "Back to normal.")).not.toContain("Conversation mode");

    // a second conversation keeps its own mode; the first is unaffected
    await api("PATCH", `/api/bots/${bot.id}/tasks/${bot.threadId}`, { asterMode: "study" });
    const { task: sibling } = await api("POST", `/api/bots/${bot.id}/tasks`, { title: "Sibling" });
    await api("PATCH", `/api/bots/${bot.id}/tasks/${sibling.threadId}`, { asterMode: "relaxed" });
    expect(await turn(bot.id, sibling.threadId, "Casual chat.")).toContain("Conversation mode (Relaxed");
    expect(await turn(bot.id, bot.threadId, "Teach me.")).toContain("Conversation mode (Study");

    // Growth: each stage can be set by hand, and null hands it back
    for (const stage of GROWTH_STAGES) {
      await api("PATCH", `/api/bots/${bot.id}/tasks/${sibling.threadId}`, { growthStage: stage });
      expect((await taskOf(bot.id, sibling.threadId)).growthStage).toBe(stage);
    }
    expect((await taskOf(bot.id, bot.threadId)).growthStage).toBeUndefined();

    // bad values are refused by name
    expect((await api("PATCH", `/api/bots/${bot.id}/tasks/${bot.threadId}`, { asterMode: "loud" }, 400)).error).toContain("asterMode must be one of");
    expect((await api("PATCH", `/api/bots/${bot.id}/tasks/${bot.threadId}`, { growthStage: "done" }, 400)).error).toContain("growthStage must be one of");

    // persisted to disk with the thread, so a reload reads them back
    const saved = JSON.parse(readFileSync(join(fixture.info.dataDir, "bots.json"), "utf8"));
    const savedTasks = (Array.isArray(saved) ? saved : saved.bots).find((each: any) => each.id === bot.id).tasks;
    expect(savedTasks.find((task: any) => task.threadId === bot.threadId).asterMode).toBe("study");
    expect(savedTasks.find((task: any) => task.threadId === sibling.threadId)).toMatchObject({ asterMode: "relaxed", growthStage: "achieved" });

    await api("PATCH", `/api/bots/${bot.id}/tasks/${sibling.threadId}`, { growthStage: null });
    expect((await taskOf(bot.id, sibling.threadId)).growthStage).toBeUndefined();
  } finally {
    await fixture.close();
  }
}, 180_000);
