// Aster Mode and Aster's Growth, per conversation. The desktop panel, the
// server's thread PATCH and the system prompt all read these, so the mode a
// person picks is the instruction the bot's next turn actually receives.

export const ASTER_MODES = ["balanced", "creative", "technical", "study", "relaxed"] as const;
export type AsterMode = (typeof ASTER_MODES)[number];

export const GROWTH_STAGES = ["curious", "learning", "planning", "working", "achieved"] as const;
export type GrowthStage = (typeof GROWTH_STAGES)[number];

export function isAsterMode(value: unknown): value is AsterMode {
  return typeof value === "string" && (ASTER_MODES as readonly string[]).includes(value);
}

export function isGrowthStage(value: unknown): value is GrowthStage {
  return typeof value === "string" && (GROWTH_STAGES as readonly string[]).includes(value);
}

/** How each mode asks the bot to answer. Balanced adds nothing: it is the
 * bot's own standing instructions, unchanged. */
const MODE_GUIDANCE: Record<Exclude<AsterMode, "balanced">, string> = {
  creative: "Favour ideas over certainty: offer several distinct options or angles, think expansively, and build on the person's ideas before narrowing down.",
  technical: "Be precise and implementation-focused: give exact steps, code, commands and reasoning about trade-offs and edge cases; skip pleasantries.",
  study: "Teach: explain concepts step by step from what the person already knows, use small examples, check understanding, and point to how to learn more.",
  relaxed: "Keep it light and conversational: short, friendly replies in a casual tone, without heavy structure unless the person asks for it.",
};

/** The system-prompt section for a conversation's mode; empty for Balanced.
 * It shapes tone and approach only: it never overrides the bot's standing
 * instructions, safety rules or approvals. */
export function asterModeSystemPrompt(mode: AsterMode | undefined): string {
  if (!mode || mode === "balanced") return "";
  const label = mode[0]!.toUpperCase() + mode.slice(1);
  return `\n\nConversation mode (${label}, chosen by the person for this conversation): ${MODE_GUIDANCE[mode]} This shapes your tone and approach only; your standing instructions and every rule above still apply.\n`;
}
