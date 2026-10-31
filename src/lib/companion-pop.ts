// A one-shot "pop" for the home companion: the composer and the mode picker
// announce that the reader clicked into them, and the hero companion (which
// lives in a different subtree) answers with a squash, a hop and a spin.
// A window event keeps the two sides from knowing about each other.

export const COMPANION_POP_EVENT = "aster:companion-pop";

/** chat: clicking into the prompt box; prompt: a quick action or a mode. */
export type CompanionPopKind = "chat" | "prompt";

export function popCompanion(kind: CompanionPopKind): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CompanionPopKind>(COMPANION_POP_EVENT, { detail: kind }));
}

export const COMPANION_NAP_EVENT = "aster:companion-nap";

/** Put the home companion to sleep now: drowsy, a yawn, then asleep. */
export function napCompanion(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COMPANION_NAP_EVENT));
}

export const COMPANION_CUE_EVENT = "aster:companion-cue";

/** typing: the reader is typing on the home; dance and hearts: secret codes. */
export type CompanionCue = "typing" | "dance" | "hearts";

export function cueCompanion(cue: CompanionCue): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CompanionCue>(COMPANION_CUE_EVENT, { detail: cue }));
}
