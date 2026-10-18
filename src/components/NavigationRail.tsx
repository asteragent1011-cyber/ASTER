import { memo, useState } from "react";
import {
  CalendarDays,
  MessageSquare,
  Plus,
  Puzzle,
  Search,
  Settings,
  Sparkles,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useStore, type Bot } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { applySkin, readAppearancePreference, type AppearanceMode } from "@/lib/skins";
import { SidebarProfileMenu } from "./SidebarProfileMenu";
import { BotAvatar } from "./Avatar";

export interface NavigationRailProps {
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenSearch: () => void;
  onNewConversation: () => void;
  activeBot?: Bot;
  unreadCount?: number;
}

export const NavigationRail = memo(function NavigationRail({
  expanded,
  onToggleExpanded,
  onOpenSearch,
  onNewConversation,
  activeBot,
  unreadCount = 0,
}: NavigationRailProps) {
  const { state, dispatch } = useStore();
  const [appearance, setAppearance] = useState<AppearanceMode | string>(() => readAppearancePreference());

  const cycleAppearance = () => {
    let next: AppearanceMode = "system";
    if (appearance === "system") next = "dark";
    else if (appearance === "dark") next = "light";
    else next = "system";
    setAppearance(next);
    applySkin(next);
  };

  return (
    <nav
      aria-label="Application navigation rail"
      className="z-30 flex h-full w-[60px] shrink-0 flex-col items-center justify-between glass-rail py-3.5 select-none"
    >
      {/* Top Group: Brand + Primary navigation */}
      <div className="flex flex-col items-center gap-2.5">
        {/* Mascot / Aster Brand Icon */}
        <button
          type="button"
          onClick={onToggleExpanded}
          title={expanded ? "Collapse sidebar" : "ASTER Companion (Click to toggle chats)"}
          aria-label="ASTER Companion"
          className="group relative flex size-10 items-center justify-center rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95"
        >
          {activeBot ? (
            <div className="size-9 overflow-hidden rounded-xl ring-1 ring-hairline/30 transition-shadow group-hover:ring-accent/50">
              <BotAvatar bot={activeBot} size={36} animated={true} />
            </div>
          ) : (
            <div className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30 shadow-sm transition-transform group-hover:scale-105">
              <Sparkles size={18} className="animate-pulse" />
            </div>
          )}
        </button>

        <div className="my-1 h-px w-6 bg-hairline/30" />

        {/* Agent Chats Toggle Button */}
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={t("sidebar.aria") || "Agent Chats"}
          title={`Agent Chats ${unreadCount > 0 ? `(${unreadCount} unread)` : ""}`}
          className={cn(
            "relative flex size-10 items-center justify-center rounded-xl text-ink-secondary transition-all duration-150 hover:bg-raised-hover hover:text-ink active:scale-95",
            expanded && "bg-raised text-ink shadow-sm ring-1 ring-hairline/40",
          )}
        >
          <MessageSquare size={19} />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white shadow"
              aria-label={`${unreadCount} unread messages`}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {/* New Conversation Button */}
        <button
          type="button"
          onClick={onNewConversation}
          aria-label="New conversation"
          title="New conversation (⌘N)"
          className="flex size-10 items-center justify-center rounded-xl text-ink-secondary transition-all duration-150 hover:bg-raised-hover hover:text-ink active:scale-95"
        >
          <Plus size={20} />
        </button>

        {/* Search / Command Palette Button */}
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search or command palette"
          title="Search / Command Palette (⌘K)"
          className="flex size-10 items-center justify-center rounded-xl text-ink-secondary transition-all duration-150 hover:bg-raised-hover hover:text-ink active:scale-95"
        >
          <Search size={18} />
        </button>

        {/* Tools & Plugins Button */}
        <button
          type="button"
          onClick={() => dispatch({ type: "togglePlugins", open: true })}
          aria-label="Tools and plugins"
          title="Tools & Plugins"
          className="flex size-10 items-center justify-center rounded-xl text-ink-secondary transition-all duration-150 hover:bg-raised-hover hover:text-ink active:scale-95"
        >
          <Puzzle size={18} />
        </button>

        {/* Routines Button */}
        <button
          type="button"
          onClick={() =>
            dispatch(
              state.activeView === "routines"
                ? { type: "showChat" }
                : { type: "showRoutines" },
            )
          }
          aria-label="Routines and automations"
          title="Routines & Automations"
          className={cn(
            "flex size-10 items-center justify-center rounded-xl text-ink-secondary transition-all duration-150 hover:bg-raised-hover hover:text-ink active:scale-95",
            state.activeView === "routines" && "bg-raised text-accent shadow-sm",
          )}
        >
          <CalendarDays size={18} />
        </button>
      </div>

      {/* Bottom Group: Appearance, Settings, Profile */}
      <div className="flex flex-col items-center gap-2">
        {/* Quick Theme Toggle */}
        <button
          type="button"
          onClick={cycleAppearance}
          aria-label="Toggle theme appearance"
          title={`Appearance: ${appearance} (Click to toggle)`}
          className="flex size-9 items-center justify-center rounded-xl text-ink-secondary transition-all duration-150 hover:bg-raised-hover hover:text-ink active:scale-95"
        >
          {appearance === "light" ? (
            <Sun size={17} />
          ) : appearance === "dark" ? (
            <Moon size={17} />
          ) : (
            <Monitor size={17} />
          )}
        </button>

        {/* Settings Button */}
        <button
          type="button"
          onClick={() => dispatch({ type: "toggleAppSettings", open: true })}
          aria-label={t("settings.title") || "Settings"}
          title="Settings (⌘,)"
          className="flex size-9 items-center justify-center rounded-xl text-ink-secondary transition-all duration-150 hover:bg-raised-hover hover:text-ink active:scale-95"
        >
          <Settings size={18} />
        </button>

        {/* Account / Profile Menu */}
        <div className="relative mt-1">
          <SidebarProfileMenu compact />
        </div>
      </div>
    </nav>
  );
});
