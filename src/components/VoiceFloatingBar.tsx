import { Loader2, Mic, Phone, PhoneOff, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { currentTaskBot, useStore, type Bot } from "@/state/store";
import { useVoiceMode, voiceMode } from "@/lib/voice-mode";
import { cn } from "@/lib/cn";

const STATUS_LABEL: Record<string, string> = {
  listening: "Listening",
  processing: "Thinking",
  speaking: "Speaking",
  error: "Voice unavailable",
  stopped: "Voice mode stopped",
};

/** The compact voice surface opened by the chat header microphone/call icon.
 * It deliberately starts the same voice-mode controller as the composer mic,
 * so speech still travels through the normal ASTER chat pipeline. */
export function VoiceFloatingBar({ bot: profile }: { bot: Bot }) {
  const bot = currentTaskBot(profile);
  const { state, dispatch } = useStore();
  const voice = useVoiceMode();
  const [transcript, setTranscript] = useState("");
  const active = voice.botId === bot.id && voice.threadId === bot.threadId;
  const running = active && !["idle", "stopped", "error"].includes(voice.status);
  const visible = active && voice.status !== "idle";
  const status = active ? voice.status : "idle";
  const supported = Boolean(state.config?.tts?.configured) &&
    (state.config?.tts?.ready !== false || Boolean(bot.voice));

  const start = useCallback(() => {
    setTranscript("");
    voiceMode.start({
      botId: bot.id,
      threadId: bot.threadId,
      onTranscript: setTranscript,
      submit: (text) => {
        setTranscript(text);
        dispatch({ type: "send", botId: bot.id, text, sendId: crypto.randomUUID(), threadId: bot.threadId });
      },
    });
  }, [bot.id, bot.threadId, dispatch]);

  const toggle = () => {
    if (running || status === "speaking" || status === "processing") {
      voiceMode.stop();
      return;
    }
    start();
  };

  useEffect(() => {
    if (!active) return;
    if (voice.status === "stopped" || voice.status === "error") return;
    if (voice.transcript) setTranscript(voice.transcript);
  }, [active, voice.status, voice.transcript]);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={running ? "Stop voice mode" : "Start voice mode"}
        aria-pressed={running}
        title={running ? "Stop voice mode" : "Start voice mode"}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-full transition-colors",
          running ? "bg-accent/20 text-accent" : "text-ink-secondary hover:bg-raised hover:text-ink",
        )}
      >
        {running ? <PhoneOff size={17} /> : <Phone size={17} />}
        {running && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent ring-2 ring-app" aria-hidden="true" />}
      </button>

      {visible && (
        <div
          className="voice-floating-bar pointer-events-auto fixed bottom-5 left-1/2 z-50 flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-hairline/60 bg-panel/95 px-3.5 py-2.5 text-ink shadow-2xl shadow-black/35 backdrop-blur-xl"
          role="status"
          aria-live="polite"
          data-voice-floating-bar
        >
          <div className={cn("voice-orb flex size-9 shrink-0 items-center justify-center rounded-full", status === "error" ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent")}>
            {status === "processing" ? <Loader2 size={17} className="animate-spin" /> : status === "speaking" ? <Volume2 size={17} /> : <Mic size={17} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <span>{STATUS_LABEL[status] ?? "Voice mode"}</span>
              {status !== "error" && <span className="voice-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>}
            </div>
            <div className="truncate text-[11px] text-ink-secondary">
              {voice.error ?? (transcript || (supported ? "Speak naturally to ASTER" : "Set up a voice to hear ASTER"))}
            </div>
          </div>
          <button type="button" onClick={() => voiceMode.stop()} aria-label="Stop voice mode" title="Stop voice mode" className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-raised hover:text-ink">
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
