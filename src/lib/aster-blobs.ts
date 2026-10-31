// The ASTER companions (the brand sheet's Luma, Nova, Orbit and Echo): which
// one a bot wears, and which of the avatar's moods they show. Pure, so every
// place that draws a bot agrees, and it is unit-tested.
import { MASCOT_BODIES, type MascotBodyId } from "../../shared/mascot-bodies";
import { MAUS_COLORS, type MausColor, type MausMotion, type MausState } from "./mascot";

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

/** A companion's display name, from the shared catalog. */
export function companionName(id: AsterBlobId): string {
  return MASCOT_BODIES[id].name;
}

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

/** A companion's swatches: its body gradient, accents, and ring. */
export interface CompanionPalette {
  light: string;
  mid: string;
  deep: string;
  accent: string;
  /** The ring and its glints. */
  ring: string;
}

/** The brand sheet's swatches, per companion. */
export const COMPANION_PALETTES: Record<AsterBlobId, CompanionPalette> = {
  luma: { light: "#F6E3FF", mid: "#BBA0FF", deep: "#8466EE", accent: "#F5B8F2", ring: "#E9DCFF" },
  nova: { light: "#D2F5FF", mid: "#7DB4FF", deep: "#5363F0", accent: "#6FE3FF", ring: "#CFEFFF" },
  orbit: { light: "#D7E4FF", mid: "#8FA4FF", deep: "#5551E2", accent: "#7FD1FF", ring: "#DCE3FF" },
  echo: { light: "#EEE5FF", mid: "#A9A5FF", deep: "#7A68F0", accent: "#9FCBFF", ring: "#E4DEFF" },
};

/**
 * The bot colour each companion is drawn in untouched: the brand sheet's own
 * swatches. Reset mascot restores it; every other colour tints the companion.
 */
export const COMPANION_COLORS: Record<AsterBlobId, MausColor> = {
  luma: "purple",
  nova: "cyan",
  orbit: "blue",
  echo: "purple",
};

/** What the picker says about each companion, under its name. */
export const COMPANION_TRAITS: Record<AsterBlobId, string> = {
  luma: "Calm, with a star",
  nova: "Bright and playful",
  orbit: "Steady, ringed by moons",
  echo: "Soft and layered",
};

/** Whether a bot is drawn in its companion's own colours ("Original"). */
export function wearsOriginalColor(bot: { id?: string; name?: string; mascotBody?: string | null; color?: string | null }): boolean {
  return !bot.color || bot.color === COMPANION_COLORS[botBodyFor(bot)];
}

/**
 * The profile change that puts a bot in [body]. It always shows the companion
 * (a picture never silently wins over a choice made here) and saves the id, so
 * the choice no longer rests on the bot's id. A colour the bot chose is kept;
 * a bot in its old companion's own colours takes the new one's, so Original
 * stays Original instead of turning the new companion another companion's hue.
 */
export function choosingCompanion(
  bot: { id?: string; name?: string; mascotBody?: string | null; color?: string | null },
  body: AsterBlobId,
): { mascotBody: AsterBlobId; avatarCrop: "mascot"; color?: MausColor } {
  return wearsOriginalColor(bot)
    ? { mascotBody: body, avatarCrop: "mascot", color: COMPANION_COLORS[body] }
    : { mascotBody: body, avatarCrop: "mascot" };
}

type Hsl = { h: number; s: number; l: number };

function hexToHsl(hex: string): Hsl {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * A companion's swatches in a bot's colour. The whole palette turns by the
 * hue between the companion's own body and the chosen colour, so each
 * swatch keeps its lightness and its place against the others: the gloss,
 * the pastel highlight, the deep shade and the accent all survive, and the
 * dark visor and white eyes (drawn outside the palette) stay readable.
 * Saturation leans a little toward the chosen colour so a vivid pick reads.
 * The companion's own colour, or none, draws the brand sheet untouched.
 */
export function companionPalette(body: AsterBlobId, color?: string | null): CompanionPalette {
  const base = COMPANION_PALETTES[body];
  if (!color || color === COMPANION_COLORS[body] || !(color in MAUS_COLORS)) return base;
  const target = hexToHsl(MAUS_COLORS[color as MausColor]);
  const turn = target.h - hexToHsl(base.mid).h;
  const tint = (hex: string) => {
    const swatch = hexToHsl(hex);
    return hslToHex({ h: (swatch.h + turn + 360) % 360, s: swatch.s * 0.65 + target.s * 0.35, l: swatch.l });
  };
  return { light: tint(base.light), mid: tint(base.mid), deep: tint(base.deep), accent: tint(base.accent), ring: tint(base.ring) };
}

/** The moods the companions draw, the reusable animation API's states. */
export type AsterBlobState = "idle" | "thinking" | "speaking" | "happy" | "sleepy" | "alert" | "selected";
/** One-shot beats, played once and handed back. */
/** worried: a turn failed; the eyes droop and the body shivers. */
export type AsterBlobMotion = "blink" | "message-sent" | "message-received" | "worried";

const HAPPY: ReadonlySet<MausState> = new Set<MausState>(["happy", "proud", "excited", "celebrate", "laughing", "playful", "bouncing"]);
const SLEEPY: ReadonlySet<MausState> = new Set<MausState>(["sleeping", "drowsy", "bored", "powering-down"]);
const ALERT: ReadonlySet<MausState> = new Set<MausState>(["alerting", "notifying", "surprised", "scared"]);
const SPEAKING: ReadonlySet<MausState> = new Set<MausState>(["dictating", "humming"]);
const WORKING: ReadonlySet<MausState> = new Set<MausState>([
  "thinking", "searching", "working", "loading", "listening", "orbit", "radar", "progress",
  "writing", "uploading", "receiving", "sending",
]);

/**
 * The companion's mood for a bot's mascot state. A bot's resting state is
 * partly about what it does (a coder rests as "working"), so when [busy] is
 * known it alone decides thinking; without it the state does. Speaking
 * (a reply read aloud) shows over everything but an alert.
 */
export function blobStateFor(state: MausState, busy?: boolean): AsterBlobState {
  if (SPEAKING.has(state)) return "speaking";
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
