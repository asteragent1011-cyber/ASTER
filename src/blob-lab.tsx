// Blob Animation Lab: a dev-only page (blob-lab.html, served by `pnpm dev`,
// never part of the app build) that shows the real ASTER companions, the same
// components the app draws, with controls for their states, beats, speed and
// background, and a capture mode for motion graphics. See
// docs/MOTION_GRAPHICS_BLOBS.md.
//
// The clock must be installed before React or motion read the time.
import { labClock } from "./blob-lab/clock";
import { StrictMode, useEffect, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { AsterBlobAvatar } from "@/components/aster/AsterBlobAvatar";
import { JellyCompanionStage } from "@/components/aster/JellyCompanionStage";
import { ASTER_BLOB_IDS, companionName, type AsterBlobId, type AsterBlobMotion, type AsterBlobState } from "@/lib/aster-blobs";
import { cueCompanion, napCompanion, popCompanion } from "@/lib/companion-pop";
import { MAUS_COLOR_NAMES, MAUS_COLORS } from "@/lib/mascot";
import "./styles.css";

/** Every mood AsterBlobAvatar draws (AsterBlobState in src/lib/aster-blobs.ts). */
const STATES: AsterBlobState[] = ["idle", "thinking", "speaking", "happy", "sleepy", "alert", "selected"];
/** Every one-shot beat (AsterBlobMotion). */
const BEATS: AsterBlobMotion[] = ["blink", "message-sent", "message-received", "worried"];
type Background = "transparent" | "midnight" | "daylight" | "green" | string;

const BACKGROUNDS: Record<string, string> = {
  midnight: "#0b0d2a",
  daylight: "#f4f3ff",
  // a chroma key for tools without alpha
  green: "#00ff00",
};

/** One companion, exactly as the app draws it: the avatar alone, or on the
 * home hero's stage with the living loop. */
export interface BlobPreviewProps {
  body: AsterBlobId;
  state: AsterBlobState;
  size: number;
  /** The tint (a MausColor), or null for the companion's own colors. */
  color: string | null;
  /** The hero's jelly body and orbiting moons (one requestAnimationFrame loop). */
  living: boolean;
  /** The hero's stage: drift, lean, hop, wink, nap (JellyCompanionStage). */
  stage: boolean;
  beat: AsterBlobMotion | null;
  beatKey: number;
}

export function BlobPreview({ body, state, size, color, living, stage, beat, beatKey }: BlobPreviewProps) {
  const avatar = (
    <AsterBlobAvatar
      body={body}
      size={size}
      state={state}
      color={color}
      living={living}
      motion={beat}
      motionKey={beatKey}
      identity={`lab-${body}`}
      label={`${companionName(body)}, ${state}`}
    />
  );
  return stage ? <JellyCompanionStage body={body}>{avatar}</JellyCompanionStage> : avatar;
}

function params() {
  const query = new URLSearchParams(location.search);
  const blob = query.get("blob") as AsterBlobId | null;
  const state = query.get("state") as AsterBlobState | null;
  const beat = query.get("beat") as AsterBlobMotion | null;
  const color = query.get("color");
  return {
    capture: query.get("capture") === "1",
    blob: blob && ASTER_BLOB_IDS.includes(blob) ? blob : ("luma" as AsterBlobId),
    state: state && STATES.includes(state) ? state : ("idle" as AsterBlobState),
    size: Math.max(32, Math.min(2048, Number(query.get("size")) || 360)),
    bg: (query.get("bg") ?? "transparent") as Background,
    living: query.get("living") !== "0",
    stage: query.get("stage") === "1",
    color: color && color in MAUS_COLORS ? color : null,
    beat: beat && BEATS.includes(beat) ? beat : null,
    /** seconds into the capture when the beat plays */
    beatAt: Math.max(0, Number(query.get("beatAt")) || 0),
  };
}

const backgroundCss = (bg: Background): string => (bg === "transparent" ? "transparent" : BACKGROUNDS[bg] ?? bg);

/** The frame a capture renders: one companion, centred, with room for its
 * rings, moons and (on the stage) its drift and hop. */
export const frameSizeFor = (size: number, stage: boolean) => Math.round(size * (stage ? 1.7 : 1.35));

function CaptureView() {
  const p = params();
  const [beatKey, setBeatKey] = useState(0);
  const frame = frameSizeFor(p.size, p.stage);
  useEffect(() => {
    document.documentElement.style.background = backgroundCss(p.bg);
    document.body.style.background = backgroundCss(p.bg);
    // The capture script drives time through this
    (window as unknown as { blobLab: unknown }).blobLab = {
      frameSize: frame,
      step: async (ms: number) => {
        // A beat due within this step starts first, and React finishes
        // rendering it before the clock moves, so it lands on the same frame
        // on every run.
        if (p.beat && labClock.now <= p.beatAt * 1000 && labClock.now + ms > p.beatAt * 1000) {
          setBeatKey((n) => n + 1);
          // wait until the companion actually shows the beat (two React renders)
          for (let turn = 0; turn < 200 && !document.querySelector(`#blob-capture [data-motion="${p.beat}"]`); turn++) await labClock.settle(1);
          await labClock.settle();
        }
        await labClock.step(ms);
      },
      ready: true,
    };
  }, [frame, p.bg, p.beat, p.beatAt]);
  return (
    <div id="blob-capture" style={{ width: frame, height: frame, display: "grid", placeItems: "center", background: backgroundCss(p.bg), overflow: "hidden" }}>
      <BlobPreview body={p.blob} state={p.state} size={p.size} color={p.color} living={p.living} stage={p.stage} beat={beatKey ? p.beat : null} beatKey={beatKey} />
    </div>
  );
}

function Lab() {
  const initial = params();
  const [bodies, setBodies] = useState<AsterBlobId[]>([initial.blob]);
  const [state, setState] = useState<AsterBlobState>(initial.state);
  const [size, setSize] = useState(initial.size);
  const [color, setColor] = useState<string | null>(initial.color);
  const [living, setLiving] = useState(initial.living);
  const [stage, setStage] = useState(initial.stage);
  const [bg, setBg] = useState<Background>(initial.bg === "transparent" ? "midnight" : initial.bg);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [beat, setBeat] = useState<{ kind: AsterBlobMotion | null; key: number }>({ kind: null, key: 0 });
  const [generation, setGeneration] = useState(0);

  const all = bodies.length === ASTER_BLOB_IDS.length;
  const button = "rounded-lg border border-white/15 px-2.5 py-1.5 text-[13px] hover:bg-white/10";
  const on = "bg-white/20 border-white/40";
  const checker: CSSProperties = {
    backgroundImage: "linear-gradient(45deg,#808080 25%,transparent 25%),linear-gradient(-45deg,#808080 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#808080 75%),linear-gradient(-45deg,transparent 75%,#808080 75%)",
    backgroundSize: "24px 24px",
    backgroundPosition: "0 0,0 12px,12px -12px,-12px 0",
    backgroundColor: "#a0a0a0",
  };

  return (
    <div className="flex min-h-screen bg-[#08091c] font-sans text-[#eceafd]">
      <aside className="w-[300px] shrink-0 space-y-5 overflow-y-auto border-r border-white/10 p-4">
        <h1 className="text-[17px] font-semibold">Blob Animation Lab</h1>

        <section className="space-y-2">
          <h2 className="text-[12px] uppercase tracking-wide opacity-70">Companion</h2>
          <div className="flex flex-wrap gap-1.5">
            {ASTER_BLOB_IDS.map((id) => (
              <button key={id} type="button" aria-pressed={!all && bodies[0] === id} className={`${button} ${!all && bodies[0] === id ? on : ""}`} onClick={() => setBodies([id])}>
                {companionName(id)}
              </button>
            ))}
            <button type="button" aria-pressed={all} className={`${button} ${all ? on : ""}`} onClick={() => setBodies([...ASTER_BLOB_IDS])}>All four</button>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-[12px] uppercase tracking-wide opacity-70">Mood (held)</h2>
          <div className="flex flex-wrap gap-1.5">
            {STATES.map((id) => (
              <button key={id} type="button" aria-pressed={state === id} className={`${button} ${state === id ? on : ""}`} onClick={() => setState(id)}>{id}</button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-[12px] uppercase tracking-wide opacity-70">Beats (one-shot)</h2>
          <div className="flex flex-wrap gap-1.5">
            {BEATS.map((id) => (
              <button key={id} type="button" className={button} onClick={() => setBeat((b) => ({ kind: id, key: b.key + 1 }))}>{id}</button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-[12px] uppercase tracking-wide opacity-70">Hero stage</h2>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={living} onChange={(e) => setLiving(e.target.checked)} /> Living (jelly body, orbiting moons)</label>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={stage} onChange={(e) => setStage(e.target.checked)} /> Stage (drift, lean, hop, wink, nap)</label>
          <div className="flex flex-wrap gap-1.5" aria-disabled={!stage}>
            <button type="button" disabled={!stage} className={button} onClick={() => popCompanion("prompt")}>pop</button>
            <button type="button" disabled={!stage} className={button} onClick={() => cueCompanion("dance")}>dance</button>
            <button type="button" disabled={!stage} className={button} onClick={() => cueCompanion("hearts")}>hearts</button>
            <button type="button" disabled={!stage} className={button} onClick={() => cueCompanion("typing")}>typing glance</button>
            <button type="button" disabled={!stage} className={button} onClick={() => napCompanion()}>nap</button>
          </div>
          <p className="text-[11.5px] opacity-60">Moving the pointer wakes a napping companion, as in the app.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-[12px] uppercase tracking-wide opacity-70">Playback</h2>
          <div className="flex gap-1.5">
            <button type="button" className={button} onClick={() => { labClock.setPaused(!paused); setPaused(!paused); }}>{paused ? "Play" : "Pause"}</button>
            <button type="button" className={button} onClick={() => { labClock.restart(); setGeneration((g) => g + 1); }}>Restart</button>
          </div>
          <label className="block text-[13px]">Speed {speed.toFixed(2)}×
            <input type="range" min={0.1} max={3} step={0.05} value={speed} className="w-full" onChange={(e) => { const v = Number(e.target.value); setSpeed(v); labClock.setSpeed(v); }} />
          </label>
        </section>

        <section className="space-y-2">
          <h2 className="text-[12px] uppercase tracking-wide opacity-70">Look</h2>
          <label className="block text-[13px]">Size {size}px
            <input type="range" min={48} max={720} step={4} value={size} className="w-full" onChange={(e) => setSize(Number(e.target.value))} />
          </label>
          <label className="block text-[13px]">Tint
            <select value={color ?? ""} onChange={(e) => setColor(e.target.value || null)} className="mt-1 w-full rounded bg-white/10 px-2 py-1">
              <option value="">Original</option>
              {MAUS_COLOR_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="block text-[13px]">Background
            <select value={bg} onChange={(e) => setBg(e.target.value)} className="mt-1 w-full rounded bg-white/10 px-2 py-1">
              <option value="midnight">Midnight</option>
              <option value="daylight">Daylight</option>
              <option value="green">Green screen</option>
              <option value="transparent">Transparent (checkerboard)</option>
            </select>
          </label>
        </section>

        <section className="space-y-1 text-[11.5px] opacity-70">
          <p>Capture a companion frame by frame with <code>node scripts/capture-blob-animation.mjs</code> (see docs/MOTION_GRAPHICS_BLOBS.md).</p>
        </section>
      </aside>

      <main className="grid flex-1 place-items-center p-8" style={bg === "transparent" ? checker : { background: backgroundCss(bg) }}>
        <div className={`grid place-items-center gap-10 ${all ? "grid-cols-2" : ""}`}>
          {bodies.map((id) => (
            <div key={`${id}-${generation}-${living}-${stage}`} className="grid place-items-center gap-3">
              <BlobPreview body={id} state={state} size={all ? Math.min(size, 280) : size} color={color} living={living} stage={stage} beat={beat.kind} beatKey={beat.key} />
              <span className={`text-[13px] ${bg === "daylight" ? "text-[#1d1b3a]" : "text-white/80"}`}>{companionName(id)}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>{params().capture ? <CaptureView /> : <Lab />}</StrictMode>,
);
