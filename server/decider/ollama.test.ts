import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../config.ts";
import { clefEngine, clefReady, createDecider, deciderSavePatch, describeDecider } from "./index.ts";
import { isLocalOllamaModel, listLocalOllamaModels, localDeciderUrl, ollamaBackend, ollamaRequestBody, OLLAMA_DEFAULT_URL } from "./ollama.ts";
import { decideRoomResponder, type RoomRoutingInput } from "./room-routing.ts";

const chat = (content: unknown, status = 200) => new Response(
  JSON.stringify({ message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) }, prompt_eval_count: 120 }),
  { status, headers: { "content-type": "application/json" } },
);

describe("an Ollama decision stays on the person's own machines", () => {
  it("accepts this computer and private networks, and nothing public", () => {
    for (const ok of [undefined, "", "http://127.0.0.1:11434", "http://localhost:11434/v1", "http://[::1]:11434", "http://192.168.1.20:11434",
      "http://10.0.0.5:11434", "http://172.20.1.1:11434", "http://100.101.5.6:11434", "http://studio.local:11434"]) {
      expect(localDeciderUrl(ok), String(ok)).not.toBeNull();
    }
    for (const bad of ["https://ollama.com", "http://8.8.8.8:11434", "http://172.32.0.1:11434", "http://example.com:11434",
      "http://user:pass@127.0.0.1:11434", "ftp://127.0.0.1", "not a url"]) {
      expect(localDeciderUrl(bad), bad).toBeNull();
    }
    expect(OLLAMA_DEFAULT_URL).toBe("http://127.0.0.1:11434");
  });

  it("refuses Ollama's cloud-hosted models", () => {
    for (const local of ["qwen3:14b", "gemma4:12b", "qwen2.5-coder:latest", "deepseek-r1:7b", "llama3.2"]) expect(isLocalOllamaModel(local), local).toBe(true);
    for (const cloud of ["gpt-oss:120b-cloud", "qwen3-coder:480b-cloud", "deepseek-v3.1:671b-cloud", "kimi:cloud", ""]) expect(isLocalOllamaModel(cloud), cloud).toBe(false);
  });

  it("never calls a public address or a cloud model: misconfigured, nothing sent", async () => {
    const fetch = vi.fn();
    const questions = { answer: { type: "yesno" as const, instructions: "Is it so?" } };
    for (const [baseUrl, model] of [["https://api.example.com", "qwen3:14b"], ["http://127.0.0.1:11434", "gpt-oss:120b-cloud"], ["http://127.0.0.1:11434", ""]]) {
      const result = await ollamaBackend.decide({ key: "", baseUrl, model, state: {}, questions, signal: new AbortController().signal, fetch });
      expect(result).toEqual({ ok: false, reason: "misconfigured" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("asking a local model", () => {
  const questions = {
    answer: { type: "choice" as const, instructions: "Who answers?", options: { maya: "Maya, designer", raj: "Raj, engineer" } },
    member_0: { type: "yesno" as const, instructions: "Should Maya answer?" },
  };

  it("sends a schema-constrained, deterministic chat to /api/chat", async () => {
    const fetch = vi.fn(async () => chat({ answers: { answer: { choice: "raj", confidence: 0.9 }, member_0: { p: 0.1 } } }));
    const result = await ollamaBackend.decide({ key: "", baseUrl: "http://127.0.0.1:11434", model: "qwen3:14b", state: { new_message: "fix the build" }, questions, signal: new AbortController().signal, fetch });
    expect(result).toMatchObject({ ok: true, model: "qwen3:14b", inputTokens: 120, answers: { answer: { type: "choice", choice: "raj", pTop: 0.9 }, member_0: { type: "yesno", p: 0.1 } } });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://127.0.0.1:11434/api/chat");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "qwen3:14b", stream: false, think: false, options: { temperature: 0 } });
    expect(body.format.properties.answers.required).toEqual(["answer", "member_0"]);
    expect(body.format.properties.answers.properties.answer.properties.choice.enum).toEqual(["maya", "raj"]);
  });

  it("reads JSON a thinking model wrapped in reasoning", async () => {
    const fetch = vi.fn(async () => chat(`<think>hmm</think>\n{"answers":{"answer":{"choice":"maya","confidence":0.8},"member_0":{"p":0.7}}}`));
    const result = await ollamaBackend.decide({ key: "", baseUrl: "http://127.0.0.1:11434", model: "deepseek-r1:7b", state: {}, questions, signal: new AbortController().signal, fetch });
    expect(result).toMatchObject({ ok: true, answers: { answer: { choice: "maya" } } });
  });

  it("refuses an answer it cannot trust, and reports a missing model or a down server", async () => {
    const ask = (fetch: typeof globalThis.fetch) =>
      ollamaBackend.decide({ key: "", baseUrl: "http://127.0.0.1:11434", model: "qwen3:14b", state: {}, questions, signal: new AbortController().signal, fetch });
    expect(await ask(vi.fn(async () => chat({ answers: { answer: { choice: "nobody-offered", confidence: 0.9 }, member_0: { p: 0.1 } } })))).toMatchObject({ ok: false, reason: "malformed" });
    expect(await ask(vi.fn(async () => chat({ answers: { answer: { choice: "raj", confidence: 7 }, member_0: { p: 0.1 } } })))).toMatchObject({ ok: false, reason: "malformed" });
    expect(await ask(vi.fn(async () => chat("not json at all")))).toMatchObject({ ok: false, reason: "malformed" });
    expect(await ask(vi.fn(async () => new Response("model not found", { status: 404 })))).toMatchObject({ ok: false, reason: "misconfigured", status: 404 });
    expect(await ask(vi.fn(async () => { throw new Error("ECONNREFUSED"); }))).toMatchObject({ ok: false, reason: "unreachable" });
  });

  it("builds the request from the questions, never anything else", () => {
    const body = ollamaRequestBody("qwen3:14b", { new_message: "hi" }, questions);
    expect(JSON.parse(body.messages[1]!.content)).toEqual({ state: { new_message: "hi" }, questions: {
      answer: { type: "choice", instructions: "Who answers?", options: { maya: "Maya, designer", raj: "Raj, engineer" } },
      member_0: { type: "yes/no", instructions: "Should Maya answer?" },
    } });
  });

  it("lists a local Ollama's models without its cloud ones, and only ever asks a local address", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ models: [{ name: "qwen3:14b" }, { name: "gpt-oss:120b-cloud" }, { model: "gemma4:12b" }] })));
    expect(await listLocalOllamaModels(undefined, { fetch })).toEqual({ ok: true, url: "http://127.0.0.1:11434", models: ["gemma4:12b", "qwen3:14b"] });
    expect(await listLocalOllamaModels("https://ollama.com", { fetch })).toEqual({ ok: false, reason: "not_local" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("the Clef engine's settings", () => {
  const cfg = (decider: AppConfig["decider"]) => ({ decider } as AppConfig);

  it("defaults to the local model, and is ready only once a model is chosen", () => {
    expect(clefEngine(cfg({}))).toBe("ollama");
    expect(clefReady(cfg({}), "roomRouting")).toBe(false);
    expect(clefReady(cfg({ ollamaModel: "qwen3:14b" }), "roomRouting")).toBe(true);
    // the Auto engine's master switch does not gate a room that chose Clef; its job switch does
    expect(clefReady(cfg({ ollamaModel: "qwen3:14b", enabled: false }), "roomRouting")).toBe(true);
    expect(clefReady(cfg({ ollamaModel: "qwen3:14b", jobs: { roomRouting: false } }), "roomRouting")).toBe(false);
    expect(clefReady(cfg({ ollamaModel: "gpt-oss:120b-cloud" }), "roomRouting")).toBe(false);
    expect(clefReady(cfg({ clefEngine: "clef-flash", ollamaModel: "qwen3:14b" }), "roomRouting")).toBe(false);
    expect(clefReady(cfg({ clefEngine: "clef-flash", cloudflareToken: "t", cloudflareAccountId: "acct" }), "roomRouting")).toBe(true);
    expect(describeDecider(cfg({ ollamaModel: "qwen3:14b" }))).toMatchObject({ clefReady: true, ollamaModel: "qwen3:14b" });
    // nothing about Clef in the status until it is set up
    expect(describeDecider(cfg({}))).not.toHaveProperty("clefReady");
    expect(describeDecider(cfg({}))).not.toHaveProperty("clefEngine");
  });

  it("refuses to save a public Ollama address or a cloud model", () => {
    expect(deciderSavePatch({ ollamaUrl: "https://ollama.com" }, {})).toMatchObject({ ok: false });
    expect(deciderSavePatch({ ollamaModel: "gpt-oss:120b-cloud" }, {})).toMatchObject({ ok: false });
    expect(deciderSavePatch({ clefEngine: "ollama", ollamaUrl: "http://192.168.1.4:11434", ollamaModel: "qwen3:14b" }, {}))
      .toEqual({ ok: true, patch: { clefEngine: "ollama", ollamaUrl: "http://192.168.1.4:11434", ollamaModel: "qwen3:14b" } });
  });
});

describe("a room set to Clef", () => {
  const members = [
    { id: "maya", name: "Maya", title: "Designer" },
    { id: "raj", name: "Raj", title: "Engineer" },
    { id: "ana", name: "Ana", title: "Writer" },
  ];
  const input: RoomRoutingInput = { room: "Launch", humans: ["Sam"], members, recent: [], message: { from: "Sam", text: "Design and build the page" } };
  const deciderAnswering = (answers: unknown) => {
    const fetch = vi.fn(async () => chat({ answers }));
    const decider = createDecider({ config: () => ({ decider: { ollamaModel: "qwen3:14b" } } as AppConfig), fetch });
    return { decider, fetch };
  };

  it("asks the local engine, and a several-member message goes to the members it names", async () => {
    const { decider, fetch } = deciderAnswering({ answer: { choice: "__everyone__", confidence: 0.9 }, member_0: { p: 0.9 }, member_1: { p: 0.85 }, member_2: { p: 0.1 } });
    expect(await decideRoomResponder(decider, input, { engine: "ollama" })).toEqual({ kind: "members", botIds: ["maya", "raj"], probability: 0.9, provider: "ollama" });
    expect(String((fetch.mock.calls[0] as unknown as [URL])[0])).toBe("http://127.0.0.1:11434/api/chat");
  });

  it("one named member answers alone; nobody named means the whole room", async () => {
    expect(await decideRoomResponder(deciderAnswering({ answer: { choice: "__everyone__", confidence: 0.9 }, member_0: { p: 0.1 }, member_1: { p: 0.9 }, member_2: { p: 0.2 } }).decider, input, { engine: "ollama" }))
      .toMatchObject({ kind: "member", botId: "raj" });
    expect(await decideRoomResponder(deciderAnswering({ answer: { choice: "__everyone__", confidence: 0.9 }, member_0: { p: 0.1 }, member_1: { p: 0.1 }, member_2: { p: 0.1 } }).decider, input, { engine: "ollama" }))
      .toMatchObject({ kind: "everyone" });
  });

  it("picks one bot, or no bot when sure enough, and falls back on doubt or failure", async () => {
    const yes = { member_0: { p: 0 }, member_1: { p: 0 }, member_2: { p: 0 } };
    expect(await decideRoomResponder(deciderAnswering({ answer: { choice: "ana", confidence: 0.8 }, ...yes }).decider, input, { engine: "ollama" })).toMatchObject({ kind: "member", botId: "ana", provider: "ollama" });
    expect(await decideRoomResponder(deciderAnswering({ answer: { choice: "__nobody__", confidence: 0.9 }, ...yes }).decider, input, { engine: "ollama" })).toMatchObject({ kind: "nobody" });
    expect(await decideRoomResponder(deciderAnswering({ answer: { choice: "__nobody__", confidence: 0.7 }, ...yes }).decider, input, { engine: "ollama" })).toEqual({ kind: "fallback", reason: "low_confidence" });
    expect(await decideRoomResponder(deciderAnswering({ answer: { choice: "ana", confidence: 0.4 }, ...yes }).decider, input, { engine: "ollama" })).toEqual({ kind: "fallback", reason: "low_confidence" });
    expect(await decideRoomResponder(deciderAnswering({ answer: { choice: "who?", confidence: 0.9 }, ...yes }).decider, input, { engine: "ollama" })).toEqual({ kind: "fallback", reason: "malformed" });
    // no model chosen: the room's lead, and nothing is sent anywhere
    const fetch = vi.fn();
    const unset = createDecider({ config: () => ({ decider: {} } as AppConfig), fetch });
    expect(await decideRoomResponder(unset, input, { engine: "ollama" })).toEqual({ kind: "fallback", reason: "no_key" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a slow local model times out to the lead instead of holding the room", async () => {
    const fetch = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    const decider = createDecider({ config: () => ({ decider: { ollamaModel: "qwen3:14b" } } as AppConfig), fetch: fetch as unknown as typeof globalThis.fetch });
    expect(await decideRoomResponder(decider, input, { engine: "ollama", timeoutMs: 60 })).toEqual({ kind: "fallback", reason: "timeout" });
  });
});
