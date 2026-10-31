import { memo, useEffect, useMemo, useRef, useState } from "react";
import { type Bot, type Message } from "@/state/store";
import { BotAvatar } from "./Avatar";
import { stateForBot, type MausState, type MausMotion } from "@/lib/mascot";
import { cn } from "@/lib/cn";
import { Grip } from "lucide-react";
import { greetingFor } from "@/lib/aster-companion";
import { botBodyFor } from "@/lib/aster-blobs";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Badge } from "./glass-ui/badge";
import { JellyCompanionStage } from "./aster/JellyCompanionStage";

export interface MascotCentrepieceProps {
  bot: Bot;
  messages: Message[];
  isTyping?: boolean;
  toolInFlight?: boolean;
  speaking?: boolean;
  hasError?: boolean;
}

/** The home screen of an empty conversation: a greeting and headline on
 * the left, the ASTER companion floating on the right. The quick actions
 * live in the composer below (Composer's `hero`). */
export const MascotCentrepiece = memo(function MascotCentrepiece({
  bot,
  isTyping = false,
  toolInFlight = false,
  speaking = false,
  hasError = false,
}: MascotCentrepieceProps) {
  const statusLabel = useMemo(() => {
    if (hasError) return "Needs attention";
    if (speaking) return "Speaking...";
    if (toolInFlight) return "Executing tool...";
    if (bot.busy) return "Thinking...";
    if (isTyping) return "Listening...";
    return "Here with you";
  }, [hasError, speaking, toolInFlight, bot.busy, isTyping]);
  const greeting = greetingFor(new Date().getHours());

  return (
    <div data-mascot-centrepiece className="aster-hero flex flex-1 select-none items-center px-6 pb-6 pt-2 animate-in fade-in duration-500 md:px-10">
      <div className="mx-auto grid w-full max-w-[62rem] grid-cols-[minmax(0,1fr)] items-center gap-2 md:grid-cols-[minmax(0,1.15fr)_auto]">
        <div className="order-2 text-center md:order-1 md:text-left">
          <p className="flex items-center justify-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-secondary md:justify-start">
            <Grip size={13} aria-hidden />
            Good {greeting},
          </p>
          <h1 className="aster-headline mt-4 text-[clamp(2rem,3.4vw,2.9rem)] font-light leading-[1.08] tracking-[-0.02em] text-ink">
            Let&rsquo;s create <br className="hidden md:block" />
            something amazing <span className="aster-gradient-text">today.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[26rem] text-[14px] leading-relaxed text-ink-secondary md:mx-0">
            I&rsquo;m {bot.name} &mdash; your AI companion. Ask me anything, plan, build, or just have a chat.
          </p>
          <Badge variant="glass" className="mt-5 gap-2 px-3 py-1 text-[12px] font-medium text-ink-secondary">
            <span
              className={cn(
                "size-1.5 rounded-full transition-colors",
                bot.busy ? "bg-accent animate-pulse" : hasError ? "bg-danger" : "bg-success",
              )}
            />
            <span>{statusLabel}</span>
          </Badge>
        </div>
        {/* The open bot's own companion, drawn by the same renderer as its
            sidebar avatar; keyed so switching bots replays its entrance. */}
        <div className="order-1 mx-auto md:order-2" data-mascot-companion>
          <JellyCompanionStage body={botBodyFor(bot)}>
            <BotAvatar key={bot.id} bot={bot} size={250} living state={speaking ? "dictating" : isTyping ? "listening" : "idle"} label={`${bot.name}, your companion`} />
          </JellyCompanionStage>
        </div>
      </div>
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

  // a failed turn (an "error:" row) makes the companion look worried, once
  const failedId = useMemo(() => {
    const newest = messages.at(-1);
    return newest?.tool?.name.startsWith("error:") ? newest.id : null;
  }, [messages]);
  const [worried, setWorried] = useState(0);
  const seenFailure = useRef(failedId);
  useEffect(() => {
    if (failedId && failedId !== seenFailure.current) setWorried((n) => n + 1);
    seenFailure.current = failedId;
  }, [failedId]);

  const activityText = useMemo(() => {
    if (hasError) return "Attention needed";
    if (speaking) return "Speaking...";
    if (toolInFlight) return "Running tools...";
    if (bot.busy) return "Thinking...";
    if (isTyping) return "Listening to you...";
    return "Ready";
  }, [hasError, speaking, toolInFlight, bot.busy, isTyping]);

  // The bot's companion, always shown in full above the transcript: the home
  // hero's stage (JellyCompanionStage + the living avatar), standing on the
  // chat's own background, with its name and status beneath. Smaller on a
  // phone-width column so the messages keep their room.
  const roomy = useMediaQuery("(min-width: 640px)");
  const statusDot = cn("size-1.5 shrink-0 rounded-full", bot.busy ? "bg-accent animate-pulse" : hasError ? "bg-danger" : "bg-success");

  return (
    <div data-companion-header className="pointer-events-auto flex w-full shrink-0 flex-col items-center px-5 pb-2">
      <JellyCompanionStage body={botBodyFor(bot)}>
        <BotAvatar
          key={bot.id}
          bot={bot}
          size={roomy ? 168 : 112}
          living
          state={currentState}
          motion={worried ? "failure" : motion}
          motionKey={worried ? -worried : motionKey}
          label={`${bot.name}, your companion`}
        />
      </JellyCompanionStage>
      <div role="status" className="mt-1 flex max-w-full items-center gap-1.5 text-[13px]">
        <span className="truncate font-semibold text-ink">{bot.name}</span>
        <span className={statusDot} />
        <span className="truncate text-ink-secondary">{activityText}</span>
      </div>
    </div>
  );
});
