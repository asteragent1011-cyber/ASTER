# Retell AI Call Integration Audit

**Date:** 2026-10-29  
**Scope:** Read-only audit of the existing ASTER project before implementation  
**Status:** Audit and implementation plan only; no application code was changed.

## Executive summary

ASTER is a React 19 + Vite renderer inside an Electron desktop application, backed by a Node.js/TypeScript harness server. The existing call icon is already wired to a substantial local call-mode experience, but that experience is not Retell-based:

- The button is rendered in the direct-message and group-chat headers.
- A direct-message call starts `src/components/CallView.tsx` call mode.
- Call mode uses an Electron preload bridge to a native Swift `SFSpeechRecognizer` helper for microphone input and endpointing.
- Spoken responses use the existing server-side TTS abstraction (ElevenLabs, Fish Audio, Grok/xAI, system voices, or Chatterbox).
- The current capability gate intentionally disables calls in browsers, on Windows, on Linux, and on remote server pages. The documented supported path is the packaged macOS app.
- No Retell SDK, API call, webhook, agent ID, Retell environment variable, or Retell agent configuration was found.

The current unavailable behavior is therefore caused by the platform contract, not by a missing click handler: browser renderers and non-macOS desktops report dictation as unavailable, and the button opens an explanatory popover instead of starting a call.

## Confirmed architecture

### Project and runtime

| Area | Confirmed implementation |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, `lucide-react` |
| Desktop shell | Electron 43; packaged targets include macOS, Windows, and Ubuntu |
| Backend | Node.js TypeScript harness under `server/`, run with `node --experimental-strip-types` |
| State/API | Renderer store in `src/state/store.tsx`; HTTP API plus SSE event stream |
| Deployment | Local/packaged harness, Docker/Compose and Podman deployment variants |
| Authentication | Existing request/session authorization in `server/request-auth.ts` and `server/sessions.ts`; paired or signed-in clients use session cookies or bearer credentials |
| Agent engines | Local/provider drivers including Claude, Codex, Grok/ACP and OpenAI-compatible paths |
| Tool integrations | Composio, custom MCP servers, browser/computer integrations, phone proxy, agent coordination, skills and routines |

The root package is `openmausbot` version `0.1.92`, with Node `>=24` and pnpm `10.33.0`. The existing server already is the appropriate backend boundary for a Retell integration; a second unrelated backend would duplicate authentication and deployment behavior.

## Relevant files and responsibilities

| File | Responsibility |
|---|---|
| [`src/components/ChatView.tsx`](../src/components/ChatView.tsx) | Places the direct-message call button in the chat header and renders the call overlay. |
| [`src/components/CallView.tsx`](../src/components/CallView.tsx) | `CallButton`, availability popover, local call state machine, microphone lifecycle, spoken approvals/questions, narration, interruption, and hang-up UI. |
| [`src/components/GroupCallView.tsx`](../src/components/GroupCallView.tsx) | Equivalent group-call button and overlay; uses the same native speech/TTS model. |
| [`src/lib/call.ts`](../src/lib/call.ts) | Window-wide current-call ownership, start/end cleanup, and React subscription. |
| [`src/lib/call-capability.ts`](../src/lib/call-capability.ts) | Converts desktop capability failures into user-facing labels, reasons, and the local-workspace action. |
| [`src/lib/desktop.ts`](../src/lib/desktop.ts) | Renderer capability model. Browser and remote pages have dictation disabled; only macOS reports Apple speech dictation. |
| [`electron/capabilities.cjs`](../electron/capabilities.cjs) | Electron-side platform and remote/local capability detection. |
| [`electron/preload.cjs`](../electron/preload.cjs) | Exposes `speechStart`, `speechStop`, transcript events, and speech-end events to the renderer. |
| [`electron/speech.mjs`](../electron/speech.mjs) | Starts/stops the macOS speech helper and streams NDJSON transcripts. Non-macOS returns `unsupported-platform`. |
| [`electron/resources/speech-helper.swift`](../electron/resources/speech-helper.swift) | Native macOS `SFSpeechRecognizer`/`AVAudioEngine` implementation and silence endpointing. |
| [`server/index.ts`](../server/index.ts) | Main HTTP API, SSE, auth enforcement, agent dispatch, integrations, and existing TTS routes. |
| [`server/tts/index.ts`](../server/tts/index.ts) | Existing TTS provider abstraction and server-side credential handling. |
| [`server/tts/speech-text.ts`](../server/tts/speech-text.ts) | Server-side conversion of agent output into speakable utterances. |
| [`server/config.ts`](../server/config.ts) | Persisted configuration schema and environment overrides for provider credentials. |
| [`server/request-auth.ts`](../server/request-auth.ts) | Request/session authorization and scope checks relevant to new routes. |
| [`server/drivers/agents-catalog.ts`](../server/drivers/agents-catalog.ts) | Existing built-in agent tool catalog: bots, threads, routines, skills, profile, memory and related actions. |
| [`server/composio.ts`](../server/composio.ts) | Connected-app/MCP integration surface. |
| [`server/mcp-registry.ts`](../server/mcp-registry.ts) | Custom MCP server configuration and validation. |
| [`docs/voice-mode.md`](../docs/voice-mode.md) | Existing voice/call design decisions and known gaps. |
| [`package.json`](../package.json) | Scripts, dependencies, Electron packaging, and server entry points. |
| [`compose.yaml`](../compose.yaml) | Local container deployment; currently exposes the harness and webhook ports but has no Retell configuration. |

## Existing call-button execution flow

### Direct-message flow

1. [`ChatView.tsx`](../src/components/ChatView.tsx) renders `<CallButton bot={bot} />` in the top chat header.
2. [`CallButton`](../src/components/CallView.tsx) delegates to `CallTargetButton` with the bot ID, name, voice, and analytics callback.
3. `CallTargetButton` checks:
   - desktop capabilities have loaded;
   - dictation is available;
   - `window.ogb.speechStart` exists;
   - a configured/usable voice exists for the bot.
4. If unavailable, the click toggles a popover. It does not attempt a network call. The popover explains browser, remote-server, unsupported-platform, missing speech service, or missing voice setup conditions.
5. If available, the click calls `startCall(targetId)`. The overlay then mounts and starts the local call loop.
6. The overlay starts native speech recognition with an 850 ms endpoint. Final transcripts are dispatched as ordinary bot messages through the existing store/API flow.
7. Agent replies and selected activity messages are spoken through the existing TTS speaker. The microphone is stopped during playback to avoid feedback; this is intentionally half-duplex.
8. Escape, the hang-up buttons, navigation away, or an ownership-safe cleanup calls `endCall`, stops speech, and stops playback.

### Group flow

`GroupView.tsx` renders `GroupCallButton` and `GroupCallOverlay`. It shares the same macOS dictation restriction, half-duplex behavior, approvals, narration, and current-call ownership model. Spoken member addressing is translated into the existing mention syntax by [`src/lib/group-call.ts`](../src/lib/group-call.ts).

### Tooltip and platform restrictions

The button uses the computed `aria-label`/`title` as its tooltip. The unavailable states include:

- “Calls need the macOS desktop app” for browser/desktop-app-required contexts;
- “Calls currently need macOS” for Windows and Linux;
- “Calls are available on This computer” with a “Choose This computer” action for a remote server page;
- voice-setup guidance when speech is available but no configured voice is ready.

The native speech helper explicitly returns an unsupported-platform result outside macOS. The project README and [`docs/voice-mode.md`](../docs/voice-mode.md) also document calls as macOS-only.

## Existing voice and audio integrations

The project already has a server-side TTS path:

- `POST /api/tts/prepare` returns readiness and server-generated utterances.
- `GET /api/tts/voices` lists available voices.
- `POST /api/tts/speak` returns audio bytes and enforces a 500-character utterance limit.

Supported configured providers are ElevenLabs, Fish Audio, Grok/xAI, system voices, and Chatterbox. Existing credential names include `OMB_TTS_KEY`, `OMB_FISH_AUDIO_API_KEY`, `XAI_API_KEY`, and the Cloud Pro voice relay variables. These are unrelated to Retell and should not be reused as a Retell secret.

The existing renderer never receives provider keys. Configuration reports boolean/status information, while the harness owns provider credentials. This is the correct security pattern to preserve for Retell.

## Retell audit result

The repository search found no confirmed Retell integration:

- no `retell` package or SDK dependency;
- no Retell API URL or client;
- no Retell API key environment variable;
- no Retell agent ID;
- no Retell web-call endpoint;
- no Retell webhook endpoint or signature verification;
- no Retell call status persistence;
- no Retell tool/function registration;
- no Retell-specific tags, workflows, or agent configuration.

Consequently, there is no existing Retell agent configuration to verify or reuse. Any agent ID, voice settings, tags, tools, functions, workflows, webhook URL, or API credentials must be supplied or configured in Retell before implementation. No secret values were included in this report.

## Existing agent tools, functions, tags, and workflows

### Confirmed implemented surfaces

The existing ASTER agent model supports:

- bot identity/profile and voice selection;
- per-bot approval mode and allowlisted tools;
- Composio connected-app tools, scoped by connector/tool grants;
- custom MCP servers, selected globally or per bot;
- built-in browser and computer tools;
- phone/device proxy tools for Android/device control;
- agent-to-agent coordination and mentions;
- memory search/capture and learned skills;
- routines, webhooks, and proposal/approval cards;
- transcript activity/tool chips, including spoken activity summaries.

The built-in catalog includes tools such as bot/team listing, routine listing/proposals/actions, `skills_list`, `skill_manage`, memory-related tools, coordination, and profile/configuration proposals. These are ASTER harness tools, not Retell tools.

### Not confirmed

No Retell-specific tool or function exists. No repository-level “Retell tags” or “Retell workflows” exist. Existing ASTER tags/mentions and agent-tool catalog entries must not be presented to Retell as if they were already configured. A future integration should explicitly map only approved, backend-owned functions to Retell tools.

## Browser, Windows, and native-app determination

The current application does support browser rendering and Windows packaging for chat and other features, but the current call implementation does not support browser or Windows microphone calling:

- Browser capability defaults set dictation to unavailable because no Electron speech bridge exists.
- Remote server pages are deliberately denied access to the host microphone and local speech capabilities.
- Windows and Linux report `unsupported-platform` for the current native Apple speech implementation.
- The native helper is Swift/macOS-specific and is launched through macOS LaunchServices for privacy/TCC permissions.

This does not mean Retell Web Call is impossible on Windows or in a browser. It means the existing local call path cannot be reused for that purpose. Retell Web Call would require a browser-side audio/WebRTC SDK, microphone permission from `navigator.mediaDevices`, a server-created short-lived call/client token, and a separate call-state model. HTTPS and browser permission policy must be handled for non-local deployments.

## Root cause of unavailable Retell calling

There are two distinct facts:

1. The current call icon is not a Retell entry point at all. It starts local ASTER call mode.
2. The current local call mode is intentionally gated to packaged/local macOS because it depends on Apple on-device speech recognition.

Therefore, adding only a Retell phone-call API call would not make browser audio work. The correct implementation depends on the intended experience:

- **Browser/Windows conversational call:** use Retell Web Call SDK for microphone/audio transport, with the ASTER server creating the call and returning only the client-safe token/configuration.
- **Outbound PSTN/phone call:** use Retell's server API for a phone call, but this is a telephone call and does not automatically provide browser microphone audio. It also requires Retell phone-number/destination configuration and appropriate backend status handling.

## Proposed implementation plan (after approval)

The existing harness should remain the backend. A dedicated module directory could be added as:

```text
server/retell/
  client.ts          # server-only Retell API client; API key never leaves Node
  config.ts          # env/config validation and non-secret status helpers
  calls.ts           # create/retrieve/end call lifecycle and local state mapping
  webhooks.ts        # webhook signature verification and status normalization
  tools.ts           # allowlisted Retell function/tool definitions and dispatch
  types.ts           # narrow validated request/response/status types
  routes.ts          # route registration or handlers used by server/index.ts
```

The exact files should be reconciled with the project’s existing route organization before coding; this is a proposed layout, not a current directory.

### Browser Web Call plan

1. Add a server-only Retell client under `server/retell/`.
2. Add a server route that authenticates the existing user/session and creates or retrieves a Web Call using a configured agent ID.
3. Return only the short-lived/client-safe Retell call credential or token required by the official Web Call SDK; never return `RETELL_API_KEY`.
4. Add a small renderer adapter, preserving `CallButton` styling and header placement. The adapter would start/stop the Retell Web Call client, request microphone permission, map connection states, and surface errors through the existing call UI.
5. Keep `src/components/CallView.tsx` as the UI shell where possible, but separate its local macOS speech transport from the Retell browser transport rather than mixing the two state machines.
6. Add authenticated call ownership so a user can only start/end/read their own call state. Reuse `server/request-auth.ts` and existing session scopes.
7. Add server-side webhook handling for lifecycle events, with signature verification, idempotency, bounded payload logging, and no secret/token logging.
8. Add explicit termination handling for user hang-up, browser unload, SDK disconnect, server errors, and stale calls.
9. Add tests for authorization, missing configuration, Retell API failures, duplicate webhooks, call status transitions, and browser permission/SDK failures.

### Retell agent tools/functions plan

Retell tools should be a deliberately small allowlist. A Retell tool request should reach an authenticated ASTER backend endpoint, be validated with the project’s existing schema conventions, and dispatch into existing ASTER capabilities only where safe. Candidate functions require product approval; none are currently configured. Examples could include read-only bot context or a narrowly scoped action, but destructive operations, arbitrary shell/file access, approvals, credentials, and unrestricted MCP dispatch should not be exposed automatically to a phone agent.

Existing Composio, MCP, skills, routines, browser, computer, and coordination tools should remain owned by the ASTER harness. They should not be copied wholesale into Retell. If a Retell function needs one of them, the backend should mediate it with explicit authorization, audit logging, timeout, and input/output limits.

## Proposed configuration values to provide

These names are proposed and are not currently present in the repository:

| Name | Purpose |
|---|---|
| `RETELL_API_KEY` | Server-only Retell API credential. Never use a `NEXT_PUBLIC_`/`VITE_` variant. |
| `RETELL_AGENT_ID` | Retell agent used for the call experience. |
| `RETELL_API_BASE_URL` | Optional server-side API base override, useful for tests; otherwise use the official default. |
| `RETELL_WEBHOOK_SECRET` | Server-only webhook signature verification secret, if Retell’s configured webhook mode requires it. |
| `RETELL_FROM_NUMBER` | Required only for an outbound PSTN flow, if the selected Retell API requires a configured caller number. |
| `RETELL_DEFAULT_DESTINATION` | Optional destination policy for PSTN calls; should not be accepted from an untrusted browser without authorization. |

The implementation must confirm the exact current Retell API/SDK contract before adding these values. The user must also decide whether the target is browser Web Call, outbound PSTN, or both, and provide the Retell agent ID and approved Retell tool/function configuration.

## Files likely to change after approval

This is a proposed change set only; none of these files were modified during the audit.

- New `server/retell/` module described above.
- [`server/index.ts`](../server/index.ts) to register authenticated Retell routes and webhook handling, or a route-registration seam if one is introduced.
- [`package.json`](../package.json) only if the official Retell SDK is selected instead of a minimal `fetch` client.
- [`src/components/CallView.tsx`](../src/components/CallView.tsx) to select the Retell transport while preserving the existing button, overlay, and styling.
- A new renderer adapter such as `src/lib/retell-call.ts` for browser SDK lifecycle and permissions.
- [`src/lib/desktop.ts`](../src/lib/desktop.ts) and related capability types only if browser/Windows Retell calling is deliberately enabled as a separate capability; the native macOS path should remain intact.
- [`src/types/ogb.d.ts`](../src/types/ogb.d.ts) only if the Electron bridge must expose an additional desktop-only operation; Web Call itself should not require exposing the Retell secret through preload.
- Deployment documentation/configuration such as [`compose.yaml`](../compose.yaml) and the relevant deployment manifests, after the environment-variable contract is finalized.
- Focused tests beside the new server and renderer modules.

No existing file should be deleted or replaced. Any modification to the current local call path should be limited to transport selection and shared lifecycle/error handling after the intended Retell experience is approved.

## Open decisions required before implementation

1. Is the desired experience browser/Web Call, outbound PSTN, or both?
2. Which Retell agent ID should be used?
3. Should Retell calls map to the currently selected ASTER bot, or always use one Retell agent?
4. Should call transcripts be written into the existing ASTER thread, and if so, in which direction and format?
5. Which Retell tools/functions are approved, and what exact ASTER operations may they invoke?
6. Should the existing macOS local call mode remain available as a fallback, or should the header button switch entirely to Retell where configured?
7. What authentication scope should be required for starting, ending, and viewing call status on shared/remote deployments?

Until these decisions and the Retell configuration are supplied, implementation would require assumptions that this audit intentionally avoids.
