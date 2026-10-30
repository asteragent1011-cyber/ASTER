import { useSyncExternalStore } from "react";

// The home companion's sounds: a soft boop when it pops and a tiny snore
// while it sleeps. Off unless this computer turns them on (Settings →
// Appearance). Synthesised with Web Audio, so there are no files to ship.

export const COMPANION_SOUNDS_KEY = "aster-companion-sounds";

const listeners = new Set<() => void>();
let sessionChoice: boolean | undefined;

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function companionSoundsEnabled(): boolean {
  if (sessionChoice !== undefined) return sessionChoice;
  try {
    return storage()?.getItem(COMPANION_SOUNDS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCompanionSounds(enabled: boolean): void {
  sessionChoice = enabled;
  try {
    storage()?.setItem(COMPANION_SOUNDS_KEY, enabled ? "1" : "0");
  } catch {
    // the session choice still holds
  }
  for (const listener of listeners) listener();
  if (enabled) boop(1);
}

export function useCompanionSounds(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    companionSoundsEnabled,
    () => false,
  );
}

let context: AudioContext | undefined;
function audio(): AudioContext | undefined {
  if (!companionSoundsEnabled() || typeof AudioContext === "undefined") return undefined;
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume().catch(() => {});
  return context;
}

/** A soft rising boop; [pitch] 1 is the pop, higher for happier moments. */
export function boop(pitch = 1): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(420 * pitch, now);
  osc.frequency.exponentialRampToValueAtTime(820 * pitch, now + 0.11);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.25);
}

/** One snore breath: a low, filtered rumble that swells and fades. */
function snoreBreath(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const length = Math.floor(ctx.sampleRate * 1.3);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // brown noise: soft and low, like breath through the nose
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 380;
  const flutter = ctx.createOscillator();
  const flutterDepth = ctx.createGain();
  flutter.frequency.value = 26;
  flutterDepth.gain.value = 0.015;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.5);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
  flutter.connect(flutterDepth).connect(gain.gain);
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
  flutter.start(now);
  noise.stop(now + 1.3);
  flutter.stop(now + 1.3);
}

/** Snore every few seconds until the returned stop is called. */
export function startSnoring(): () => void {
  const breathe = () => {
    const ctx = audio();
    if (ctx) snoreBreath(ctx);
  };
  breathe();
  const timer = setInterval(breathe, 3_400);
  return () => clearInterval(timer);
}
