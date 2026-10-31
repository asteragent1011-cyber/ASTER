import { beforeEach, describe, expect, it, vi } from "vitest";

import { browserSpeechRecognitionAvailable, voiceMode } from "./voice-mode";

class FakeRecognition {
  static instance: FakeRecognition;
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() { FakeRecognition.instance = this; }
}

describe("voice mode browser transport", () => {
  beforeEach(() => {
    voiceMode.stop();
    vi.stubGlobal("window", { SpeechRecognition: FakeRecognition, navigator: { language: "en-US" } });
  });

  it("submits one final transcript and enters processing", () => {
    const submit = vi.fn();
    const onTranscript = vi.fn();
    voiceMode.start({ botId: "bot", threadId: "thread", submit, onTranscript });
    const recognition = FakeRecognition.instance;
    recognition.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "hello ASTER" } }] });
    recognition.onend?.();
    recognition.onend?.();

    expect(browserSpeechRecognitionAvailable()).toBe(true);
    expect(onTranscript).toHaveBeenCalledWith("hello ASTER");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("hello ASTER");
    expect(voiceMode.state.status).toBe("processing");
  });

  it("stops without submitting an interrupted session", () => {
    const submit = vi.fn();
    voiceMode.start({ botId: "bot", threadId: "thread", submit, onTranscript: vi.fn() });
    const recognition = FakeRecognition.instance;
    voiceMode.stop();
    recognition.onend?.();

    expect(submit).not.toHaveBeenCalled();
    expect(voiceMode.state.status).toBe("stopped");
  });
});
