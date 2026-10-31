// A local Ollama model as a decision backend: POST {ollama}/api/chat with a
// JSON schema in `format`, so the model can only answer in the typed shapes
// the decider asks for. The answers are then decoded and validated by the same
// strict parser as Clef-Flash (parseClefResponse): a choice must be one of the
// offered keys, every probability a number in [0, 1].
//
// Local means local. The address must be this machine or a private network
// (localDeciderUrl), and Ollama's own cloud-hosted models (a `:cloud` /
// `-cloud` tag) are refused (isLocalOllamaModel): picking a local engine must
// never send a room's messages to a cloud provider. A refused address or model
// is "misconfigured", which every caller treats as "use today's rule".
//
// A local model has no calibrated probabilities. It is asked for its own
// confidence, which the decider's thresholds then gate: an unsure answer still
// falls back to the room's lead.
import { isIP } from "node:net";

import { LOCAL_HOSTS } from "../drivers/local-inject.ts";
import { parseClefResponse } from "./clef.ts";
import type { BackendRequest, BackendResult, DeciderBackend, DeciderQuestion } from "./types.ts";

/** Ollama's native API root, from the host table the model picker uses. */
export const OLLAMA_DEFAULT_URL = (LOCAL_HOSTS.find((host) => host.id === "ollama")?.baseUrl ?? "http://127.0.0.1:11434/v1").replace(/\/v1\/?$/, "");
/** Keep the model loaded between room messages, so a decision does not pay a
 * cold load each time. */
const KEEP_ALIVE = "15m";

function privateIPv4(host: string): boolean {
  const [a, b] = host.split(".").map(Number) as [number, number];
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) ||
    // Tailscale / CGNAT: a person's own machines on their tailnet
    (a === 100 && b >= 64 && b <= 127);
}

function privateIPv6(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
}

/** The address of a local Ollama, or null for anything that could leave the
 * person's own machines: a public host, a credential in the URL, or a scheme
 * other than http(s). */
export function localDeciderUrl(raw?: string | null): URL | null {
  let url: URL;
  try {
    url = new URL((raw?.trim() || OLLAMA_DEFAULT_URL).replace(/\/v1\/?$/, "").replace(/\/+$/, ""));
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const local = host === "localhost" || host.endsWith(".local")
    || (isIP(host) === 4 && privateIPv4(host))
    || (isIP(host) === 6 && privateIPv6(host));
  return local ? url : null;
}

/** Ollama can proxy a model it does not run (`gpt-oss:120b-cloud`,
 * `qwen3-coder:480b-cloud`): those run on Ollama's servers, so they are not a
 * local choice. */
export function isLocalOllamaModel(model: string): boolean {
  const name = model.trim();
  return Boolean(name) && !/(^|[:\-_])cloud($|[:\-_])/i.test(name) && name.length <= 200;
}

/** The JSON schema one question's answer must follow. */
function answerSchema(question: DeciderQuestion): Record<string, unknown> {
  if (question.type === "choice") {
    return {
      type: "object",
      properties: {
        choice: { type: "string", enum: Object.keys(question.options) },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["choice", "confidence"],
    };
  }
  if (question.type === "score") {
    return {
      type: "object",
      properties: { level: { type: "integer", minimum: 0, maximum: question.levels.length - 1 } },
      required: ["level"],
    };
  }
  return { type: "object", properties: { p: { type: "number", minimum: 0, maximum: 1 } }, required: ["p"] };
}

export function ollamaRequestBody(model: string, state: unknown, questions: Record<string, DeciderQuestion>) {
  const ids = Object.keys(questions);
  const asked = Object.fromEntries(Object.entries(questions).map(([id, question]) => [id,
    question.type === "choice" ? { type: "choice", instructions: question.instructions, options: question.options }
      : question.type === "score" ? { type: "score", instructions: question.instructions, levels: question.levels }
        : { type: "yes/no", instructions: question.instructions, ...(question.criteria ? { criteria: question.criteria } : {}) }]));
  return {
    model,
    stream: false,
    // a thinking model answers the schema directly instead of reasoning first
    think: false,
    keep_alive: KEEP_ALIVE,
    options: { temperature: 0 },
    format: {
      type: "object",
      properties: {
        answers: {
          type: "object",
          properties: Object.fromEntries(Object.entries(questions).map(([id, question]) => [id, answerSchema(question)])),
          required: ids,
        },
      },
      required: ["answers"],
    },
    messages: [
      {
        role: "system",
        content: "You are a fast, careful classifier. Read `state` and answer every question in `questions` as JSON that matches the schema. "
          + "For a choice, pick one of the offered option keys and give `confidence`: your probability, from 0 to 1, that the choice is right. "
          + "For a yes/no question, `p` is the probability that the answer is yes. For a score, `level` is the 0-based index of the best level. "
          + "Be honest about uncertainty: a low confidence is better than a confident wrong answer.",
      },
      { role: "user", content: JSON.stringify({ state, questions: asked }) },
    ],
  };
}

/** The model's answers in the shape parseClefResponse validates. */
function toClefShape(answers: unknown, questions: Record<string, DeciderQuestion>): unknown {
  if (!answers || typeof answers !== "object") return null;
  const shaped: Record<string, unknown> = {};
  for (const [id, question] of Object.entries(questions)) {
    const raw = (answers as Record<string, unknown>)[id];
    if (!raw || typeof raw !== "object") return null;
    const answer = raw as Record<string, unknown>;
    if (question.type === "score") {
      const level = answer.level;
      if (typeof level !== "number" || !Number.isInteger(level)) return null;
      shaped[id] = { score: level, probabilities: question.levels.map((_, index) => (index === level ? 1 : 0)) };
    } else {
      shaped[id] = answer;
    }
  }
  return { answers: shaped };
}

/** A thinking model may still wrap its JSON in reasoning tags. */
function jsonContent(content: string): unknown {
  const stripped = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? stripped.slice(start, end + 1) : stripped);
}

const ms = (from: number, to: number) => Math.max(0, Math.round(to - from));

async function decide(request: BackendRequest): Promise<BackendResult> {
  const root = localDeciderUrl(request.baseUrl);
  const model = request.model?.trim() ?? "";
  if (!root || !isLocalOllamaModel(model) || !Object.keys(request.questions).length) return { ok: false, reason: "misconfigured" };
  const fetchImpl = request.fetch ?? fetch;
  const started = performance.now();
  let response: Response;
  try {
    response = await fetchImpl(new URL("/api/chat", root), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(ollamaRequestBody(model, request.state, request.questions)),
      signal: request.signal,
      redirect: "error",
    });
  } catch {
    return { ok: false, reason: "unreachable", timing: { requestMs: ms(started, performance.now()) } };
  }
  const headersAt = performance.now();
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    // 404: the model is not pulled on this Ollama
    return { ok: false, reason: response.status === 404 ? "misconfigured" : response.status >= 500 ? "overloaded" : "http_error", status: response.status, timing: { requestMs: ms(started, headersAt) } };
  }
  let decoded: unknown;
  let inputTokens: number | undefined;
  try {
    const body = await response.json() as { message?: { content?: unknown }; prompt_eval_count?: unknown };
    if (typeof body.message?.content !== "string") throw new Error("no content");
    decoded = (jsonContent(body.message.content) as { answers?: unknown }).answers;
    if (typeof body.prompt_eval_count === "number" && Number.isFinite(body.prompt_eval_count)) inputTokens = body.prompt_eval_count;
  } catch {
    return { ok: false, reason: "malformed", timing: { requestMs: ms(started, headersAt), responseMs: ms(headersAt, performance.now()) } };
  }
  const bodyAt = performance.now();
  const parsed = parseClefResponse(toClefShape(decoded, request.questions), request.questions);
  const timing = { requestMs: ms(started, headersAt), responseMs: ms(headersAt, bodyAt), parseMs: ms(bodyAt, performance.now()) };
  return parsed.ok
    ? { ok: true, answers: parsed.answers, model, ...(inputTokens !== undefined ? { inputTokens } : {}), timing }
    : { ok: false, reason: "malformed", timing };
}

/** Load the chosen model now, so the first room message does not wait for a
 * cold load (measured: 9-12s for a 12-14B model cold, ~4-6s for 7-9B warm).
 * An empty prompt only loads it. Best effort and only to a local address;
 * never blocks or throws. */
export function warmOllamaModel(rawUrl: string | undefined, model: string | undefined): void {
  const root = localDeciderUrl(rawUrl);
  if (!root || !model || !isLocalOllamaModel(model)) return;
  void fetch(new URL("/api/generate", root), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, prompt: "", keep_alive: KEEP_ALIVE }),
    signal: AbortSignal.timeout(120_000),
    redirect: "error",
  }).then((response) => response.body?.cancel()).catch(() => undefined);
}

/** The models a local Ollama serves, without its cloud-hosted ones. */
export async function listLocalOllamaModels(
  rawUrl: string | undefined,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ ok: true; url: string; models: string[] } | { ok: false; reason: "not_local" | "unreachable" | "malformed" }> {
  const root = localDeciderUrl(rawUrl);
  if (!root) return { ok: false, reason: "not_local" };
  try {
    const response = await (options.fetch ?? fetch)(new URL("/api/tags", root), { signal: AbortSignal.timeout(options.timeoutMs ?? 3_000), redirect: "error" });
    if (!response.ok) return { ok: false, reason: "unreachable" };
    const body = await response.json() as { models?: Array<{ name?: unknown; model?: unknown }> };
    if (!Array.isArray(body.models)) return { ok: false, reason: "malformed" };
    const models = body.models
      .map((entry) => (typeof entry.name === "string" ? entry.name : typeof entry.model === "string" ? entry.model : ""))
      .filter((name) => name && isLocalOllamaModel(name))
      .sort();
    return { ok: true, url: root.origin, models };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

export const ollamaBackend: DeciderBackend = { id: "ollama", decide };
