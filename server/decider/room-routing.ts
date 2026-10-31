// The decision model's first job: who answers a room message nobody was
// @mentioned in, for rooms set to "Auto".
//
// One Choice over the room's active bots, keyed by bot id and described by
// name, title and description, plus __everyone__ for a message that needs
// several members. The state is the room, its people, the last room lines
// and the new message: the shape that routed 53 of 53 bench messages.
//
// Acting on it: a bot or __everyone__ at p >= 0.6 answers; __nobody__ (the
// message needs no bot at all) is acted on only at p >= 0.85, because staying
// silent by mistake costs more than an unneeded reply. Anything less sure,
// and any failure at all, falls back to the room's lead (or its first
// member), which is exactly what a lead-mode room does today. Nothing here
// throws.
import type { Decider } from "./index.ts";
import type { ChoiceQuestion, ClefEngine, DeciderFailure, DeciderProvider, YesNoQuestion } from "./types.ts";

/** Turn starts take seconds anyway, and people far from the US West Coast
 * see 400–700 ms round trips; 1.5 s keeps a slow answer usable. */
export const ROOM_ROUTING_TIMEOUT_MS = 1_500;
/** A local model runs on the person's own hardware: a loaded 7–14B model
 * answers in about a second, a cold one needs to load first. The room's turn
 * waits for the answer only when its own turn comes up. */
export const LOCAL_ROOM_ROUTING_TIMEOUT_MS = 12_000;
/** Bench calibration: answers at >= 0.6 were right 92–99% of the time. */
export const ROOM_ROUTING_MIN_PROBABILITY = 0.6;
export const EVERYONE_OPTION = "__everyone__";
const EVERYONE_MEANING = "Several members: the message explicitly needs answers or work from more than one member of the room, for example it asks everyone or asks each member for their part.";
/** No bot answers. Offered by option, not by instructions: the instructions
 * stay the fixed string Cloud Pro's relay accepts. */
export const NOBODY_OPTION = "__nobody__";
const NOBODY_MEANING = "No bot: the message needs no answer from any bot in the room, for example the people in the room are talking to each other, or it only acknowledges or closes the conversation (thanks, ok, got it) and asks for nothing.";
/** Silence needs more certainty than a choice of speaker. */
export const ROOM_ROUTING_NOBODY_MIN_PROBABILITY = 0.85;
/** Fixed: Cloud Pro's decision relay accepts room routing only with these
 * exact instructions (relay.ts). */
export const ROOM_ROUTING_INSTRUCTIONS = "Which bot in this room should answer `new_message`? Choose __everyone__ only when the message needs several members to answer.";
/** Every key the state may carry; `recent_messages` is left out when there
 * are none. Cloud Pro's relay accepts no other. */
export const ROOM_ROUTING_STATE_KEYS = ["room", "humans_in_room", "bots_in_room", "recent_messages", "new_message"] as const;

const NAME_MAX = 80;
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 400;
const LINE_MAX = 500;
/** The room context window bounds how many lines; this bounds their size,
 * because large irrelevant state makes the classifier worse, not better. */
const RECENT_BUDGET_CHARS = 6_000;

export interface RoomRoutingMember {
  id: string;
  name: string;
  title?: string;
  description?: string;
}

export interface RoomRoutingInput {
  room: string;
  humans: string[];
  /** Active members only, in room order. */
  members: RoomRoutingMember[];
  /** Oldest first; already limited to the room's context window. */
  recent: Array<{ from: string; text: string }>;
  message: { from: string; text: string };
}

export type RoomRoute =
  | { kind: "member"; botId: string; probability: number; provider?: DeciderProvider }
  /** A Clef room: the message needs several members, and these are they. */
  | { kind: "members"; botIds: string[]; probability: number; provider?: DeciderProvider }
  | { kind: "everyone"; probability: number; provider?: DeciderProvider }
  | { kind: "nobody"; probability: number; provider?: DeciderProvider }
  | { kind: "fallback"; reason: DeciderFailure | "low_confidence" | "no_choice" };

function clip(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** What one bot is, as an option: "Maya, Product Designer. Owns UI…". */
export function memberOption(member: RoomRoutingMember): string {
  const name = clip(member.name, NAME_MAX) || "Unnamed bot";
  const title = member.title ? clip(member.title, TITLE_MAX) : "";
  const description = member.description ? clip(member.description, DESCRIPTION_MAX) : "";
  return `${name}${title ? `, ${title}` : ""} bot.${description ? ` ${description}` : ""}`;
}

/** The newest lines that fit the budget, oldest first, each clipped. */
function recentWithinBudget(recent: RoomRoutingInput["recent"]): RoomRoutingInput["recent"] {
  const kept: RoomRoutingInput["recent"] = [];
  let used = 0;
  for (let index = recent.length - 1; index >= 0; index--) {
    const line = recent[index]!;
    const text = clip(line.text, LINE_MAX);
    if (!text) continue;
    const size = text.length + line.from.length;
    if (used + size > RECENT_BUDGET_CHARS) break;
    used += size;
    kept.unshift({ from: clip(line.from, NAME_MAX), text });
  }
  return kept;
}

export function roomRoutingRequest(input: RoomRoutingInput) {
  const options: Record<string, string> = {};
  for (const member of input.members) options[member.id] = memberOption(member);
  options[EVERYONE_OPTION] = EVERYONE_MEANING;
  options[NOBODY_OPTION] = NOBODY_MEANING;
  const recent = recentWithinBudget(input.recent);
  const state = {
    room: clip(input.room, NAME_MAX),
    humans_in_room: input.humans.map((human) => clip(human, NAME_MAX)),
    bots_in_room: input.members.map((member) => clip(member.name, NAME_MAX)),
    ...(recent.length ? { recent_messages: recent } : {}),
    new_message: { from: clip(input.message.from, NAME_MAX), text: input.message.text.trim().slice(0, 8_000) },
  };
  return { state, question: { instructions: ROOM_ROUTING_INSTRUCTIONS, options } };
}

/** For a Clef room: one yes/no per member, asked in the same call, so a
 * message that needs several members can name which ones. */
const MEMBER_QUESTION_PREFIX = "member_";
export function memberQuestions(members: RoomRoutingMember[]): Record<string, YesNoQuestion> {
  return Object.fromEntries(members.map((member, index) => [`${MEMBER_QUESTION_PREFIX}${index}`, {
    type: "yesno" as const,
    instructions: `Should ${clip(member.name, NAME_MAX)} answer or do part of the work for \`new_message\`? (${memberOption(member)})`,
  }]));
}

/** Ask once and turn the answer into a route. Never throws.
 *
 * `engine` asks a Clef room's engine instead of the app's Auto engine, and
 * then also asks which members a several-member message needs: the subset
 * with p >= 0.6 answers (one of them alone if only one qualifies), else the
 * whole room, as Auto does. */
export async function decideRoomResponder(
  decider: Pick<Decider, "choose"> & Partial<Pick<Decider, "ask">>,
  input: RoomRoutingInput,
  options: { signal?: AbortSignal; timeoutMs?: number; engine?: ClefEngine } = {},
): Promise<RoomRoute> {
  try {
    if (input.members.length < 2) return { kind: "fallback", reason: "no_choice" };
    const { state, question } = roomRoutingRequest(input);
    const timeoutMs = options.timeoutMs ?? (options.engine === "ollama" ? LOCAL_ROOM_ROUTING_TIMEOUT_MS : ROOM_ROUTING_TIMEOUT_MS);
    let answers: Record<string, { choice?: string; pTop?: number; p?: number }>;
    let provider: DeciderProvider | undefined;
    if (options.engine) {
      if (!decider.ask) return { kind: "fallback", reason: "misconfigured" };
      // A Clef room: its own engine, and which members a several-member message needs.
      const answer: ChoiceQuestion = { type: "choice", instructions: question.instructions, options: question.options };
      const result = await decider.ask("roomRouting", state, { answer, ...memberQuestions(input.members) }, {
        timeoutMs, signal: options.signal, provider: options.engine,
      });
      if (!result.ok) return { kind: "fallback", reason: result.reason };
      answers = result.answers as typeof answers;
      provider = result.provider;
    } else {
      // Auto: exactly the request it has always sent (Cloud Pro's relay accepts only this).
      const result = await decider.choose("roomRouting", state, question, { timeoutMs, signal: options.signal });
      if (!result.ok) return { kind: "fallback", reason: result.reason };
      answers = { answer: result.answers };
      provider = result.provider;
    }
    const choice = answers.answer!.choice!;
    const pTop = answers.answer!.pTop!;
    const result = { provider };
    if (pTop < ROOM_ROUTING_MIN_PROBABILITY) return { kind: "fallback", reason: "low_confidence" };
    if (choice === EVERYONE_OPTION) {
      if (options.engine) {
        const wanted = input.members.filter((_, index) => (answers[`${MEMBER_QUESTION_PREFIX}${index}`]?.p ?? 0) >= ROOM_ROUTING_MIN_PROBABILITY);
        if (wanted.length === 1) return { kind: "member", botId: wanted[0]!.id, probability: pTop, provider: result.provider };
        if (wanted.length > 1 && wanted.length < input.members.length) {
          return { kind: "members", botIds: wanted.map((member) => member.id), probability: pTop, provider: result.provider };
        }
      }
      return { kind: "everyone", probability: pTop, provider: result.provider };
    }
    if (choice === NOBODY_OPTION) {
      return pTop >= ROOM_ROUTING_NOBODY_MIN_PROBABILITY
        ? { kind: "nobody", probability: pTop, provider: result.provider }
        : { kind: "fallback", reason: "low_confidence" };
    }
    if (!input.members.some((member) => member.id === choice)) return { kind: "fallback", reason: "malformed" };
    return { kind: "member", botId: choice, probability: pTop, provider: result.provider };
  } catch {
    return { kind: "fallback", reason: "malformed" };
  }
}
