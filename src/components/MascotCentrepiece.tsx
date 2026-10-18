import { memo, useMemo } from "react";
import { type Bot, type Message } from "@/state/store";
import { BotAvatar } from "./Avatar";
import { stateForBot, type MausState, type MausMotion } from "@/lib/mascot";
import { cn } from "@/lib/cn";
import { RenameTitle } from "./RenameTitle";
import { api, useStore } from "@/state/store";
import { Code2, Compass, Lightbulb, FileText } from "lucide-react";
import { Badge } from "./glass-ui/badge";
import { Button } from "./glass-ui/button";
import { Card } from "./glass-ui/card";

export interface MascotCentrepieceProps {
  bot: Bot;
  messages: Message[];
  isTyping?: boolean;
  toolInFlight?: boolean;
  speaking?: boolean;
  hasError?: boolean;
  onSuggestionClick?: (text: string) => void;
  motion?: MausMotion;
  motionKey?: number;
}

const DEFAULT_SUGGESTIONS = [
  { icon: Code2, label: "Review or debug code", prompt: "Can you help review or debug some code with me?" },
  { icon: Lightbulb, label: "Brainstorm ideas", prompt: "Let's brainstorm some innovative ideas for my project." },
  { icon: Compass, label: "Explore a topic", prompt: "Explain the architecture and best practices for this." },
  { icon: FileText, label: "Draft a plan", prompt: "Help me create a detailed step-by-step implementation plan." },
];

export const MascotCentrepiece = memo(function MascotCentrepiece({
  bot,
  messages,
  isTyping = false,
  toolInFlight = false,
  speaking = false,
  hasError = false,
  onSuggestionClick,
  motion = "none",
  motionKey = 0,
}: MascotCentrepieceProps) {
  const { dispatch } = useStore();

  // Derive contextual mascot mood / expression
  const currentState: MausState = useMemo(() => {
    if (hasError) return "alerting";
    if (speaking) return "dictating";
    if (toolInFlight) return "working";
    if (bot.busy) return "thinking";
    if (isTyping) return "listening";
    return stateForBot({ ...bot, messages });
  }, [hasError, speaking, toolInFlight, bot, isTyping, messages]);

  const statusLabel = useMemo(() => {
    if (hasError) return "Needs attention";
    if (speaking) return "Speaking...";
    if (toolInFlight) return "Executing tool...";
    if (bot.busy) return "Thinking...";
    if (isTyping) return "Listening...";
    return "Here with you";
  }, [hasError, speaking, toolInFlight, bot.busy, isTyping]);

  return (
    <div data-mascot-centrepiece className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center select-none animate-in fade-in duration-500">
      {/* Floating Mascot Aura & Figure */}
      <div className="group relative flex flex-col items-center">
        {/* Subtle ambient light behind mascot */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-8 rounded-full bg-accent/5 blur-3xl transition-all duration-700 group-hover:bg-accent/10"
        />

        {/* Mascot Avatar with gentle floating idle animation */}
        <div className="animate-mascot-float relative transition-transform duration-300 hover:scale-[1.03]">
          <BotAvatar
            bot={bot}
            state={currentState}
            size={160}
            motion={motion}
            motionKey={motionKey}
            trackPointer={true}
          />
        </div>

        {/* Live Status Chip */}
        <Badge variant="glass" className="mt-4 gap-2 px-3 py-1 text-[12px] font-medium text-ink-secondary">
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors",
              bot.busy ? "bg-accent animate-pulse" : hasError ? "bg-danger" : "bg-success",
            )}
          />
          <span>{statusLabel}</span>
        </Badge>
      </div>

      {/* Bot Name and Description */}
      <div className="mt-3.5 flex flex-col items-center">
        <RenameTitle
          value={bot.name}
          onCommit={(name) => {
            if (window.ogb?.remoteClient?.active) {
              void api(`/api/bots/${bot.id}/profile`, { method: "PATCH", body: JSON.stringify({ name }) })
                .then(({ bot: updated }) => dispatch({ type: "botPatched", bot: updated }))
                .catch((cause) => dispatch({ type: "error", message: cause instanceof Error ? cause.message : String(cause) }));
            } else {
              dispatch({ type: "updateBot", botId: bot.id, patch: { name } });
            }
          }}
          className="text-2xl font-bold tracking-tight text-ink hover:text-accent transition-colors"
          inputClassName="rounded-lg bg-inset px-2.5 py-1 text-center text-2xl font-bold"
        />

        <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-ink-secondary">
          {bot.description || "Your dedicated AI companion. Ask anything or collaborate on complex tasks."}
        </p>
      </div>

      {/* Starter Suggestions in Apple-style Glass Cards */}
      {onSuggestionClick && (
        <div className="mt-7 grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
          {DEFAULT_SUGGESTIONS.map((item, index) => {
            const Icon = item.icon;
            return (
              // Glass UI's Button in its `glass` variant, shaped as a macOS
              // Control Center tile: a large rounded square with the icon in
              // a round crystal well.
              <Button
                key={index}
                type="button"
                variant="glass"
                onClick={() => onSuggestionClick(item.prompt)}
                className="group h-auto w-full justify-start gap-3 rounded-[22px] p-3 text-left font-normal transition-[transform,opacity] duration-150 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
              >
                <div className="glass-crystal flex size-9 shrink-0 items-center justify-center rounded-full text-ink transition-colors group-hover:text-accent">
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink transition-colors group-hover:text-accent">
                    {item.label}
                  </div>
                  <div className="truncate text-[11.5px] text-ink-tertiary">
                    {item.prompt}
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export interface MascotCompanionHeaderProps {
  bot: Bot;
  messages: Message[];
  isTyping?: boolean;
  toolInFlight?: boolean;
  speaking?: boolean;
  hasError?: boolean;
  motion?: MausMotion;
  motionKey?: number;
}

export const MascotCompanionHeader = memo(function MascotCompanionHeader({
  bot,
  messages,
  isTyping = false,
  toolInFlight = false,
  speaking = false,
  hasError = false,
  motion = "none",
  motionKey = 0,
}: MascotCompanionHeaderProps) {
  const currentState: MausState = useMemo(() => {
    if (hasError) return "alerting";
    if (speaking) return "dictating";
    if (toolInFlight) return "working";
    if (bot.busy) return "thinking";
    if (isTyping) return "listening";
    return stateForBot({ ...bot, messages });
  }, [hasError, speaking, toolInFlight, bot, isTyping, messages]);

  const activityText = useMemo(() => {
    if (hasError) return "Attention needed";
    if (speaking) return "Speaking...";
    if (toolInFlight) return "Running tools...";
    if (bot.busy) return "Thinking...";
    if (isTyping) return "Listening to you...";
    return "Ready";
  }, [hasError, speaking, toolInFlight, bot.busy, isTyping]);

  return (
    <Card data-companion-header variant="glass" className="pointer-events-auto mx-auto mb-3 flex-row items-center gap-3 rounded-2xl px-3.5 py-1.5">
      <div className="relative size-9 shrink-0">
        <BotAvatar
          bot={bot}
          state={currentState}
          size={36}
          motion={motion}
          motionKey={motionKey}
          trackPointer={true}
        />
      </div>
      <div className="flex flex-col min-w-0 pr-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-ink">{bot.name}</span>
          <span
            className={cn(
              "size-1.5 rounded-full",
              bot.busy ? "bg-accent animate-pulse" : hasError ? "bg-danger" : "bg-success",
            )}
          />
        </div>
        <span className="truncate text-[11px] text-ink-secondary">{activityText}</span>
      </div>
    </Card>
  );
});
