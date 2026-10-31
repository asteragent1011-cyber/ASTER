import { memo, type ReactNode } from "react";
import {
  Aperture,
  Bell,
  BookMarked,
  ChevronRight,
  Coffee,
  Compass,
  Lightbulb,
  Rocket,
  Search,
  Sparkles,
  Trophy,
  Wrench,
  Waypoints,
} from "lucide-react";
import { useStore, type Bot } from "@/state/store";
import { cn } from "@/lib/cn";
import {
  ASTER_MODES,
  GROWTH_STAGES,
  conversationGrowth,
  conversationMode,
  type AsterMode,
  type GrowthStage,
} from "@/lib/aster-companion";
import { BotAvatar } from "../Avatar";
import { AsterMark } from "./AsterMark";
import { useCaptionChrome } from "../DesktopCapabilities";
import { popCompanion } from "@/lib/companion-pop";

const MODES: Record<AsterMode, { label: string; hint: string; icon: ReactNode }> = {
  balanced: { label: "Balanced", hint: "Everyday help", icon: <Sparkles size={15} /> },
  creative: { label: "Creative", hint: "For ideas & brainstorming", icon: <Aperture size={15} /> },
  technical: { label: "Technical", hint: "For coding & problem solving", icon: <Wrench size={15} /> },
  study: { label: "Study", hint: "For learning & research", icon: <BookMarked size={15} /> },
  relaxed: { label: "Relaxed", hint: "For casual conversations", icon: <Coffee size={15} /> },
};

const STAGES: Record<GrowthStage, { label: string; icon: ReactNode }> = {
  curious: { label: "Curious", icon: <Lightbulb size={16} /> },
  learning: { label: "Learning", icon: <Compass size={16} /> },
  planning: { label: "Planning", icon: <Waypoints size={16} /> },
  working: { label: "Working", icon: <Rocket size={16} /> },
  achieved: { label: "Achieved", icon: <Trophy size={16} /> },
};

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="aster-orb-icon flex size-9 shrink-0 items-center justify-center rounded-full">
        <AsterMark size={18} />
      </span>
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-ink">{title}</div>
        <div className="truncate text-[11.5px] text-ink-tertiary">{subtitle}</div>
      </div>
    </div>
  );
}

/** The home screen's right column: search, notifications and the open
 * bot; how ASTER should help in this conversation (saved on its thread, and
 * part of the bot's system prompt from the next turn); and where the
 * conversation stands, read from its messages unless the person set it. */
export const AsterContextPanel = memo(function AsterContextPanel({
  bot,
  unreadCount,
  onOpenSearch,
  onOpenChats,
}: {
  bot: Bot;
  unreadCount: number;
  onOpenSearch: () => void;
  onOpenChats: () => void;
}) {
  const { dispatch } = useStore();
  // On Windows the renderer-drawn caption buttons own the window's top-right
  // corner, which is this panel's: drop it below them like any docked panel.
  const { dragClass, padClass } = useCaptionChrome();
  // Both live on the open conversation's thread, so they follow it across
  // reloads, devices and thread switches. A bot whose threads have not
  // arrived yet has nowhere to save them: the controls wait.
  const task = bot.tasks?.find((each) => each.threadId === bot.threadId);
  const mode = conversationMode(task);
  const { stage, manual } = conversationGrowth(bot, task);
  const reached = GROWTH_STAGES.indexOf(stage);
  const unavailable = !task;
  const setMode = (next: AsterMode) => {
    if (!task || next === mode) return;
    dispatch({ type: "updateTask", botId: bot.id, threadId: task.threadId, patch: { asterMode: next } });
    popCompanion("prompt");
  };
  // Picking a stage pins it; picking the pinned stage again, or "Automatic",
  // hands it back to the messages.
  const setStage = (next: GrowthStage | null) => {
    if (!task) return;
    dispatch({ type: "updateTask", botId: bot.id, threadId: task.threadId, patch: { growthStage: next } });
  };

  return (
    <aside aria-label="ASTER companion panel" className={cn("aster-context relative z-10 hidden w-[312px] shrink-0 flex-col gap-3 overflow-y-auto py-5 pr-5 xl:flex", padClass)}>
      {/* the panel's top bar is a drag handle for the frameless window */}
      <div className={cn("flex items-center gap-3", dragClass)}>
        <button
          type="button"
          onClick={onOpenSearch}
          className="glass-chip flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full px-4 text-[13px] text-ink-tertiary transition-colors hover:text-ink-secondary"
        >
          <Search size={15} />
          <span>Search...</span>
          <kbd className="ml-auto text-[11px] text-ink-tertiary">⌘K</kbd>
        </button>
        <button
          type="button"
          onClick={onOpenChats}
          aria-label={unreadCount > 0 ? `Notifications: ${unreadCount} unread` : "Notifications"}
          title="Unread conversations"
          className="relative flex size-10 items-center justify-center rounded-full text-ink-secondary transition-colors hover:text-ink"
        >
          <Bell size={18} />
          {unreadCount > 0 && <span aria-hidden className="absolute right-2.5 top-2.5 size-2 rounded-full bg-accent ring-2 ring-[var(--color-app)]" />}
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "toggleSettings", open: true })}
          aria-label={`${bot.name} profile`}
          title={`${bot.name} profile`}
          className="aster-avatar-ring size-10 shrink-0 overflow-hidden rounded-full"
        >
          <BotAvatar bot={bot} size={40} />
        </button>
      </div>

      <section aria-label="Aster Mode" className="aster-card flex flex-col gap-2 rounded-[22px] p-3.5">
        <PanelHeader title="Aster Mode" subtitle={unavailable ? "Loading this conversation..." : "How Aster helps in this conversation"} />
        <div role="radiogroup" aria-label="Aster Mode" aria-disabled={unavailable || undefined} className="mt-1 flex flex-col gap-0.5">
          {ASTER_MODES.map((id) => {
            const item = MODES[id];
            const selected = id === mode;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={unavailable}
                onClick={() => setMode(id)}
                data-aster-mode={id}
                className={cn("aster-mode-row flex items-center gap-3 rounded-2xl px-2 py-1.5 text-left disabled:opacity-50", selected && "is-selected")}
              >
                <span className="aster-mode-icon flex size-8 shrink-0 items-center justify-center rounded-full">{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink">{item.label}</span>
                  {!selected && <span className="block truncate text-[11px] text-ink-tertiary">{item.hint}</span>}
                </span>
                {selected && <ChevronRight size={15} className="text-ink-secondary" />}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Aster's Growth" className="aster-card flex flex-col gap-3 rounded-[22px] p-3.5">
        <PanelHeader title="Aster's Growth" subtitle={manual ? "Set by you for this conversation" : "Where this conversation stands"} />
        <ol className="flex items-start justify-between px-0.5">
          {GROWTH_STAGES.map((id, index) => {
            const item = STAGES[id];
            const current = id === stage;
            return (
              <li
                key={id}
                aria-current={current ? "step" : undefined}
                className={cn("aster-stage flex w-12 flex-col items-center gap-1.5", index <= reached && "is-reached", current && "is-current")}
              >
                <button
                  type="button"
                  disabled={unavailable}
                  onClick={() => setStage(manual && current ? null : id)}
                  aria-pressed={current}
                  aria-label={manual && current ? `${item.label}, set by you: use automatic` : `Set stage to ${item.label}`}
                  title={manual && current ? "Set by you. Click to go back to automatic" : `Set stage to ${item.label}`}
                  data-growth-stage={id}
                  className="flex flex-col items-center gap-1.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent-border disabled:opacity-50"
                >
                  <span className="aster-stage-orb flex size-9 items-center justify-center rounded-full">{item.icon}</span>
                  <span className="text-[10.5px] text-ink-tertiary">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {manual && (
          <button
            type="button"
            onClick={() => setStage(null)}
            className="self-center rounded-full px-2.5 py-1 text-[11.5px] text-ink-secondary hover:bg-control hover:text-ink"
          >
            Back to automatic
          </button>
        )}
      </section>
    </aside>
  );
});
