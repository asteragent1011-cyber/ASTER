// The Blob Animation Lab's clock (dev-only; blob-lab.html is never part of the
// app build). The companions move through three time sources, and this page
// alone puts all three on one clock it controls:
//
// - CSS keyframes and transitions (styles.css, `.aster-blob*`), reached through
//   the Web Animations API (document.getAnimations());
// - the living loop in AsterBlobAvatar (requestAnimationFrame + performance.now);
// - motion's springs and keyframes in JellyCompanionStage (requestAnimationFrame,
//   performance.now, and WAAPI for the animations it hands to the browser).
//
// Realtime mode scales time (speed) and can freeze it (pause). Manual mode (the
// `capture=1` URL flag) only moves when step(ms) is called: timers, frames and
// CSS animations all advance by exactly that much, so a frame sequence is the
// same on every run. Import this module FIRST in the lab's entry: it patches
// the globals before React or motion read them.

type FrameCallback = (time: number) => void;
type Timer = { id: number; at: number; fn: () => void; every?: number };

const realNow = performance.now.bind(performance);
const realRaf = window.requestAnimationFrame.bind(window);
const realCancelRaf = window.cancelAnimationFrame.bind(window);
const realSetTimeout = window.setTimeout.bind(window);
const realClearTimeout = window.clearTimeout.bind(window);
const realSetInterval = window.setInterval.bind(window);
const realClearInterval = window.clearInterval.bind(window);

export type ClockMode = "realtime" | "manual";

const state = {
  mode: (new URLSearchParams(location.search).get("capture") === "1" ? "manual" : "realtime") as ClockMode,
  speed: 1,
  paused: false,
  /** ms on the clock every animation sees */
  virtual: 0,
  lastReal: realNow(),
};

/** When each CSS / WAAPI animation was first seen, on the virtual clock. */
let firstSeen = new WeakMap<Animation, number>();

function advanceRealtime(): void {
  const now = realNow();
  if (state.mode === "realtime" && !state.paused) state.virtual += (now - state.lastReal) * state.speed;
  state.lastReal = now;
}

Object.defineProperty(performance, "now", {
  configurable: true,
  value: () => {
    advanceRealtime();
    return state.virtual;
  },
});

// requestAnimationFrame: realtime defers to the browser, manual waits for step()
let nextFrameId = 1;
const manualFrames = new Map<number, FrameCallback>();
const realFrameIds = new Map<number, number>();
window.requestAnimationFrame = (callback: FrameCallback): number => {
  const id = nextFrameId++;
  if (state.mode === "manual") {
    manualFrames.set(id, callback);
  } else {
    realFrameIds.set(id, realRaf(() => {
      realFrameIds.delete(id);
      callback(performance.now());
    }));
  }
  return id;
};
window.cancelAnimationFrame = (id: number): void => {
  manualFrames.delete(id);
  const real = realFrameIds.get(id);
  if (real !== undefined) realCancelRaf(real);
  realFrameIds.delete(id);
};

// Timers: only manual mode moves them onto the virtual clock (beats end and
// the stage's moods change by timer, so a capture must see them on time).
let nextTimerId = 1_000_000;
const manualTimers = new Map<number, Timer>();
const asFn = (handler: TimerHandler): (() => void) => (typeof handler === "function" ? () => (handler as () => void)() : () => undefined);
window.setTimeout = ((handler: TimerHandler, timeout = 0, ...args: unknown[]) => {
  if (state.mode !== "manual") return realSetTimeout(handler, timeout, ...args);
  const id = nextTimerId++;
  manualTimers.set(id, { id, at: state.virtual + Math.max(0, Number(timeout) || 0), fn: asFn(handler) });
  return id;
}) as typeof window.setTimeout;
window.clearTimeout = ((id?: number) => {
  if (id !== undefined && manualTimers.delete(id)) return;
  realClearTimeout(id);
}) as typeof window.clearTimeout;
window.setInterval = ((handler: TimerHandler, timeout = 0, ...args: unknown[]) => {
  if (state.mode !== "manual") return realSetInterval(handler, timeout, ...args);
  const id = nextTimerId++;
  const every = Math.max(1, Number(timeout) || 0);
  manualTimers.set(id, { id, at: state.virtual + every, fn: asFn(handler), every });
  return id;
}) as typeof window.setInterval;
window.clearInterval = ((id?: number) => {
  if (id !== undefined && manualTimers.delete(id)) return;
  realClearInterval(id);
}) as typeof window.clearInterval;

/** Put every CSS and WAAPI animation on the clock. */
function syncAnimations(): void {
  for (const animation of document.getAnimations()) {
    if (!firstSeen.has(animation)) firstSeen.set(animation, state.virtual);
    if (state.mode === "manual") {
      animation.pause();
      animation.currentTime = state.virtual - firstSeen.get(animation)!;
    } else {
      if (animation.playbackRate !== state.speed) animation.playbackRate = state.speed;
      if (state.paused && animation.playState === "running") animation.pause();
      else if (!state.paused && animation.playState === "paused") animation.play();
    }
  }
}

// Realtime: keep newly started animations at the chosen speed. One loop, on
// the real rAF, for the whole page.
(function keepSynced() {
  if (state.mode === "realtime") syncAnimations();
  realRaf(keepSynced);
})();

/** Yield to the event loop without a timer (timers may be virtual): lets React commit. */
function yieldTask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });
}

export const labClock = {
  get mode(): ClockMode {
    return state.mode;
  },
  get now(): number {
    return state.virtual;
  },
  get speed(): number {
    return state.speed;
  },
  get paused(): boolean {
    return state.paused;
  },
  setSpeed(speed: number): void {
    advanceRealtime();
    state.speed = Math.max(0.05, Math.min(4, speed));
    syncAnimations();
  },
  setPaused(paused: boolean): void {
    advanceRealtime();
    state.paused = paused;
    syncAnimations();
  },
  /** Back to time 0. Remount the companions alongside this (the lab keys them). */
  restart(): void {
    state.virtual = 0;
    state.lastReal = realNow();
    firstSeen = new WeakMap();
    for (const animation of document.getAnimations()) animation.cancel();
    manualTimers.clear();
  },
  /** Let React finish rendering (a few event-loop turns, no timers). */
  async settle(turns = 4): Promise<void> {
    for (let i = 0; i < turns; i++) await yieldTask();
  },
  /** Manual mode: move every clock on by exactly `ms`, run what fell due, and
   * render one frame. Resolves once React has committed. */
  async step(ms: number): Promise<void> {
    if (state.mode !== "manual") return;
    const target = state.virtual + Math.max(0, ms);
    // timers due within the step, in time order
    for (;;) {
      const due = [...manualTimers.values()].filter((timer) => timer.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      state.virtual = due.at;
      if (due.every) due.at += due.every;
      else manualTimers.delete(due.id);
      due.fn();
      await yieldTask();
    }
    state.virtual = target;
    // one animation frame: callbacks requested before it run now; ones they request wait for the next step
    const frame = [...manualFrames.entries()];
    manualFrames.clear();
    for (const [, callback] of frame) callback(state.virtual);
    await yieldTask();
    syncAnimations();
    await yieldTask();
    syncAnimations();
    // Let the browser actually paint this frame before anyone screenshots it.
    await new Promise<void>((resolve) => realRaf(() => realRaf(() => resolve())));
  },
};
