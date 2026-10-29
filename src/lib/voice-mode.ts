import { useSyncExternalStore } from "react";
import { speaker } from "./tts/index";

export type VoiceModeStatus = "idle" | "listening" | "processing" | "speaking" | "error" | "stopped";

export type VoiceModeSnapshot = {
  status: VoiceModeStatus;
  botId?: string;
  threadId?: string;
  transcript?: string;
  error?: string;
};

type BrowserRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserRecognitionConstructor = new () => BrowserRecognition;

type VoiceStartOptions = {
  botId: string;
  threadId: string;
  onTranscript: (text: string) => void;
  submit: (text: string) => void;
};

const IDLE: VoiceModeSnapshot = { status: "idle" };

function browserRecognitionConstructor(): BrowserRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const candidate = (window as typeof window & {
    SpeechRecognition?: BrowserRecognitionConstructor;
    webkitSpeechRecognition?: BrowserRecognitionConstructor;
  }).SpeechRecognition ?? (window as typeof window & { webkitSpeechRecognition?: BrowserRecognitionConstructor }).webkitSpeechRecognition;
  return candidate;
}

export function browserSpeechRecognitionAvailable(): boolean {
  return Boolean(browserRecognitionConstructor());
}

class VoiceModeController {
  private snapshot: VoiceModeSnapshot = IDLE;
  private watchers = new Set<() => void>();
  private nativeCleanup: (() => void) | null = null;
  private recognition: BrowserRecognition | null = null;
  private options: VoiceStartOptions | null = null;
  private finalText = "";
  private submitting = false;
  private stoppedByUser = false;
  private responseIds = new Set<string>();

  subscribe = (fn: () => void) => {
    this.watchers.add(fn);
    return () => this.watchers.delete(fn);
  };

  get state() { return this.snapshot; }

  private set(snapshot: VoiceModeSnapshot) {
    this.snapshot = snapshot;
    for (const watcher of Array.from(this.watchers)) watcher();
  }

  start(options: VoiceStartOptions): void {
    this.stop(false);
    this.options = options;
    this.finalText = "";
    this.submitting = false;
    this.stoppedByUser = false;
    this.set({ status: "listening", botId: options.botId, threadId: options.threadId });

    const bridge = window.ogb;
    if (bridge?.speechStart && bridge.onSpeechTranscript && bridge.onSpeechEnd) {
      const offTranscript = bridge.onSpeechTranscript((line) => {
        if (this.stoppedByUser || typeof line.text !== "string") return;
        this.finalText = line.text.trim();
        options.onTranscript(this.finalText);
      });
      const offEnd = bridge.onSpeechEnd(({ code, reason }) => {
        if (this.stoppedByUser) return;
        if (code === 1 || code === 2) {
          this.fail(reason === "speech-not-authorized" ? "Microphone or speech recognition permission was denied." : "Native speech recognition is unavailable.");
          return;
        }
        this.submitFinal();
      });
      this.nativeCleanup = () => { offTranscript(); offEnd(); void bridge.speechStop?.(); };
      void bridge.speechStart().catch(() => this.fail("The microphone could not start."));
      return;
    }

    const Constructor = browserRecognitionConstructor();
    if (!Constructor) {
      this.fail("Speech recognition is not supported in this browser. Use a supported browser or the macOS app.");
      return;
    }
    const recognition = new Constructor();
    this.recognition = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) text += event.results[i]?.[0]?.transcript ?? "";
      text = text.trim();
      if (text) {
        this.finalText = text;
        options.onTranscript(text);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      this.fail(event.error === "not-allowed" ? "Microphone permission was denied." : "Browser speech recognition failed.");
    };
    recognition.onend = () => {
      if (this.stoppedByUser || this.snapshot.status !== "listening") return;
      this.submitFinal();
    };
    try { recognition.start(); } catch { this.fail("The microphone could not start."); }
  }

  private submitFinal() {
    if (this.submitting || this.stoppedByUser) return;
    const text = this.finalText.trim();
    if (!text) {
      this.startListening();
      return;
    }
    this.submitting = true;
    this.set({ ...this.snapshot, status: "processing", transcript: text });
    this.options?.submit(text);
  }

  private startListening() {
    if (this.stoppedByUser || !this.options) return;
    this.finalText = "";
    this.submitting = false;
    this.set({ status: "listening", botId: this.options.botId, threadId: this.options.threadId });
    const Constructor = browserRecognitionConstructor();
    if (!window.ogb?.speechStart && Constructor) {
      const options = this.options;
      const recognition = new Constructor();
      this.recognition = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";
      recognition.onresult = (event) => {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) text += event.results[i]?.[0]?.transcript ?? "";
        if (text.trim()) { this.finalText = text.trim(); options.onTranscript(this.finalText); }
      };
      recognition.onerror = (event) => { if (event.error !== "no-speech" && event.error !== "aborted") this.fail(event.error === "not-allowed" ? "Microphone permission was denied." : "Browser speech recognition failed."); };
      recognition.onend = () => { if (!this.stoppedByUser && this.snapshot.status === "listening") this.submitFinal(); };
      try { recognition.start(); } catch { this.fail("The microphone could not start."); }
    } else if (window.ogb?.speechStart) {
      void window.ogb.speechStart().catch(() => this.fail("The microphone could not start."));
    }
  }

  handleAssistantResponse(threadId: string, messageId: string, text: string, botId: string, voiceId?: string): boolean {
    if (this.snapshot.threadId !== threadId || this.snapshot.botId !== botId || this.snapshot.status !== "processing") return false;
    if (this.responseIds.has(messageId)) return true;
    this.responseIds.add(messageId);
    this.set({ ...this.snapshot, status: "speaking" });
    void this.finishSpeech(text, botId, messageId, voiceId);
    return true;
  }

  private async finishSpeech(text: string, botId: string, messageId: string, voiceId?: string) {
    await speaker.speak(text, { botId, messageId, voiceId });
    if (this.stoppedByUser || this.snapshot.status !== "speaking") return;
    this.startListening();
  }

  private fail(error: string) {
    this.cleanupRecognition();
    this.set({ ...this.snapshot, status: "error", error });
  }

  stop(userInitiated = true): void {
    if (userInitiated) this.stoppedByUser = true;
    this.cleanupRecognition();
    speaker.stop();
    if (this.snapshot.status !== "idle" && this.snapshot.status !== "stopped") this.set({ status: userInitiated ? "stopped" : "idle" });
    this.options = userInitiated ? null : this.options;
  }

  stopIfOwner(botId: string, threadId: string) {
    if (this.snapshot.botId === botId && this.snapshot.threadId === threadId) this.stop();
  }

  private cleanupRecognition() {
    this.nativeCleanup?.();
    this.nativeCleanup = null;
    this.recognition?.abort();
    this.recognition = null;
  }
}

export const voiceMode = new VoiceModeController();

export function useVoiceMode(): VoiceModeSnapshot {
  return useSyncExternalStore(voiceMode.subscribe, () => voiceMode.state, () => voiceMode.state);
}
