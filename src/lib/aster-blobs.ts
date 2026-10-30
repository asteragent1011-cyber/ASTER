// The ASTER companions (the brand sheet's Luma, Nova, Orbit and Echo): which
// one a bot wears, and which of the avatar's moods they show. Pure, so every
// place that draws a bot agrees, and it is unit-tested.
import type { MascotBodyId } from "../../shared/mascot-bodies";
import type { MausMotion, MausState } from "./mascot";

export const ASTER_BLOB_IDS = ["luma", "nova", "orbit", "echo"] as const satisfies readonly MascotBodyId[];
export type AsterBlobId = (typeof ASTER_BLOB_IDS)[number];

export function isAsterBlob(id: string | null | undefined): id is AsterBlobId {
  return (ASTER_BLOB_IDS as readonly string[]).includes(id ?? "");
}

/** FNV-1a: small, stable across runs and platforms, good enough to spread ids. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The companion a bot wears when it has not chosen a body: the same bot always
 * gets the same one, on every screen, and a roster gets a mix.
 */
export function asterBlobFor(identity: string): AsterBlobId {
  return ASTER_BLOB_IDS[hash(identity) % ASTER_BLOB_IDS.length]!;
}

/** The default companion, for an avatar that stands for no bot in particular. */
export const DEFAULT_COMPANION: AsterBlobId = "luma";

/** A companion id as given, or the default for anything else: an unknown
 * value, or a body from the retired geometric catalog (cursor, hexagon...). */
export function companionBody(value: string | null | undefined): AsterBlobId {
  return isAsterBlob(value) ? value : DEFAULT_COMPANION;
}

/**
 * The companion a bot wears. A saved companion id is honoured; anything else
 * saved (a retired geometric body such as hexagon or drop) is ignored, never
 * migrated or deleted, and the bot wears the companion its id picks.
 */
export function botBodyFor(bot: { id?: string; name?: string; mascotBody?: string | null }): AsterBlobId {
  if (isAsterBlob(bot.mascotBody)) return bot.mascotBody;
  const identity = bot.id || bot.name;
  return identity ? asterBlobFor(identity) : DEFAULT_COMPANION;
}

/** The moods the companions draw, the reusable animation API's states. */
export type AsterBlobState = "idle" | "thinking" | "happy" | "sleepy" | "alert" | "selected";
/** One-shot beats, played once and handed back. */
/** worried: a turn failed; the eyes droop and the body shivers. */
export type AsterBlobMotion = "blink" | "message-sent" | "message-received" | "worried";

const HAPPY: ReadonlySet<MausState> = new Set<MausState>(["happy", "proud", "excited", "celebrate", "laughing", "playful", "bouncing"]);
const SLEEPY: ReadonlySet<MausState> = new Set<MausState>(["sleeping", "drowsy", "bored", "powering-down"]);
const ALERT: ReadonlySet<MausState> = new Set<MausState>(["alerting", "notifying", "surprised", "scared"]);
const WORKING: ReadonlySet<MausState> = new Set<MausState>([
  "thinking", "searching", "working", "loading", "listening", "orbit", "radar", "progress",
  "humming", "writing", "dictating", "uploading", "receiving", "sending",
]);

/**
 * The companion's mood for a bot's mascot state. A bot's resting state is
 * partly about what it does (a coder rests as "working"), so when [busy] is
 * known it alone decides thinking; without it the state does.
 */
export function blobStateFor(state: MausState, busy?: boolean): AsterBlobState {
  if (busy === true) return "thinking";
  if (ALERT.has(state)) return "alert";
  if (HAPPY.has(state)) return "happy";
  if (SLEEPY.has(state)) return "sleepy";
  if (busy === undefined && WORKING.has(state)) return "thinking";
  return "idle";
}

/** The avatar's one-shot motions as companion beats; null where none fits. */
export function blobMotionFor(motion: MausMotion): AsterBlobMotion | null {
  switch (motion) {
    case "launch":
    case "arrive":
    case "switch":
      return "message-sent";
    case "success":
    case "celebrate":
    case "customize":
      return "message-received";
    case "blink":
    case "surprise":
      return "blink";
    case "failure":
      return "worried";
    default:
      return null;
  }
}

/** A per-bot phase, so a roster of companions never bobs or blinks in step. */
export function blobPhase(identity: string): { floatDelayS: number; blinkDelayS: number; enterDelayMs: number } {
  const h = hash(identity);
  return {
    floatDelayS: -((h % 4600) / 1000),
    blinkDelayS: -(((h >>> 8) % 6200) / 1000),
    enterDelayMs: (h >>> 16) % 240,
  };
}

/** How a living companion moves: its temperament, as numbers the hero's
 * frame loops and springs read. 1 is Luma's, the baseline. */
export interface BlobPersonality {
  /** How fast it drifts, and how far. */
  roamSpeed: number;
  roamReach: number;
  /** How hard and how fast the body squishes as it breathes. */
  squish: number;
  squishSpeed: number;
  /** Spring bounce (0..1) for its landings and settles. */
  bounce: number;
  /** How high a pop throws it. */
  hop: number;
  /** Seconds per lap for the moons on its ring. */
  orbitS: number;
  /** 0 floats its moons evenly; up to 1 they swing like weights, slow over
   * the top and fast through the bottom, and drag the ring after them. */
  moonWeight: number;
}

export const BLOB_PERSONALITY: Record<AsterBlobId, BlobPersonality> = {
  luma: { roamSpeed: 1, roamReach: 1, squish: 1, squishSpeed: 1, bounce: 0.45, hop: 1, orbitS: 9, moonWeight: 0 },
  // quick and bouncy
  nova: { roamSpeed: 1.6, roamReach: 0.8, squish: 1.35, squishSpeed: 1.7, bounce: 0.68, hop: 1.3, orbitS: 5.5, moonWeight: 0 },
  // heavy moons that swing and tug the ring
  orbit: { roamSpeed: 0.85, roamReach: 0.9, squish: 0.85, squishSpeed: 0.9, bounce: 0.35, hop: 0.85, orbitS: 11, moonWeight: 1 },
  // slow and floaty
  echo: { roamSpeed: 0.55, roamReach: 1.45, squish: 0.75, squishSpeed: 0.6, bounce: 0.25, hop: 0.8, orbitS: 14, moonWeight: 0 },
};
