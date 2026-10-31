// POST /api/decider/test: Settings → Decision model's Test button. One tiny
// yes/no call with the draft key in the body, or the saved key, whatever the
// switches say, because it tests the key itself. The answer is a verdict
// (and how long it took), never the key and never the vendor's raw body.
// Admin-scoped by default (server/request-auth.ts lists no client rule for
// it): it spends a real, if tiny, amount on the workspace's key.
// GET /api/decider/ollama/models: the models a local Ollama serves, for
// Settings → Clef engine. Only a local address is ever contacted, and
// Ollama's cloud-hosted models are left out (server/decider/ollama.ts).
import type { Decider } from "../decider/index.ts";
import { listLocalOllamaModels } from "../decider/ollama.ts";
import type { AppConfig } from "../config.ts";
import { PASS, type RouteHandler } from "./table.ts";

export interface DeciderRouteDeps {
  decider: Pick<Decider, "testKey">;
  /** Read per request, for the saved Ollama address. */
  config?: () => AppConfig;
  fetch?: typeof fetch;
}

const MAX_KEY_LENGTH = 512;

export function createDeciderRoutes(deps: DeciderRouteDeps): RouteHandler {
  return async ({ req, res, path, method, json, readBody, url }) => {
    if (path === "/api/decider/ollama/models" && method === "GET") {
      // a draft address being tried in Settings, else the saved one
      const draft = url.searchParams.get("url")?.trim();
      if (draft && draft.length > 2048) return json(res, 400, { error: "That address is too long." });
      res.setHeader("cache-control", "no-store");
      const listed = await listLocalOllamaModels(draft || deps.config?.().decider?.ollamaUrl, { fetch: deps.fetch });
      return json(res, 200, listed);
    }
    if (path !== "/api/decider/test" || method !== "POST") return PASS;
    const body = await readBody(req, 8192);
    if (body?.key !== undefined && typeof body.key !== "string") return json(res, 400, { error: "key must be a string" });
    if (body?.accountId !== undefined && typeof body.accountId !== "string") return json(res, 400, { error: "accountId must be a string" });
    if (body?.provider !== undefined && body.provider !== "jev" && body.provider !== "clef-flash" && body.provider !== "ollama") {
      return json(res, 400, { error: "invalid provider" });
    }
    const draft = typeof body?.key === "string" ? body.key.trim() : "";
    const accountId = typeof body?.accountId === "string" ? body.accountId.trim() : "";
    if (draft.length > MAX_KEY_LENGTH) return json(res, 400, { error: "That does not look like an API key." });
    res.setHeader("cache-control", "no-store");
    const result = await deps.decider.testKey({
      key: draft || undefined,
      accountId: accountId || undefined,
      provider: body?.provider,
    });
    if (result.ok) return json(res, 200, { ok: true, latencyMs: result.latencyMs });
    return json(res, 200, { ok: false, reason: result.reason, ...(result.status ? { status: result.status } : {}) });
  };
}
