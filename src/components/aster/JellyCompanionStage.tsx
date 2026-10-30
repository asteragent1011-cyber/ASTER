import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  MotionConfig,
  motion,
  useAnimate,
  useAnimationFrame,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { BLOB_PERSONALITY, type AsterBlobId } from "@/lib/aster-blobs";
import {
  COMPANION_CUE_EVENT,
  COMPANION_NAP_EVENT,
  COMPANION_POP_EVENT,
  type CompanionCue,
  type CompanionPopKind,
} from "@/lib/companion-pop";
import { boop, startSnoring, useCompanionSounds } from "@/lib/companion-sounds";

/** A soft, under-damped spring: the companion overshoots and settles back. */
const LEAN_SPRING = { stiffness: 90, damping: 14, mass: 0.9 };

/** How long without the reader before the companion dozes off. */
const IDLE_MS = 5 * 60_000;
/** After the last keystroke, how long the eyes stay on the prompt box. */
const TYPING_GLANCE_MS = 1_200;
/** Pointer speed (px per ms) that startles a blink, and how often at most. */
const STARTLE_SPEED = 2.6;
const STARTLE_EVERY_MS = 1_500;
/** Back-and-forth strokes over the companion, within PET_WINDOW_MS, that count as petting. */
const PET_STROKES = 4;
const PET_WINDOW_MS = 1_200;

type Mood = "idle" | "wink" | "blink" | "happy" | "curious" | "dance" | "sleepy" | "yawn" | "asleep";
/** The moods of a companion on its way to sleep, or already there. */
const DROWSY: ReadonlySet<Mood> = new Set<Mood>(["sleepy", "yawn", "asleep"]);
/** Moods a passing whim (a wink, a startled blink) may interrupt. */
const IDLE: ReadonlySet<Mood> = new Set<Mood>(["idle", "curious"]);

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

interface Heart {
  id: number;
  /** Start across the box, in % of its width. */
  x: number;
  size: number;
  delayMs: number;
  durationMs: number;
  /** Sideways drift on the way up, in px. */
  drift: number;
  hue: string;
}
const HEART_HUES = ["#F5B8F2", "#BBA0FF", "#FF9AD5", "#8466EE", "#7DB4FF"];
function makeHearts(count: number, spread: number): Heart[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: now + i,
    x: 50 + (Math.random() - 0.5) * spread,
    size: 14 + Math.random() * 18,
    delayMs: Math.random() * (count > 6 ? 1_400 : 300),
    durationMs: 1_800 + Math.random() * 1_400,
    drift: (Math.random() - 0.5) * 80,
    hue: HEART_HUES[i % HEART_HUES.length]!,
  }));
}

function HeartShapes({ hearts, className }: { hearts: Heart[]; className: string }) {
  return (
    <div aria-hidden className={className}>
      {hearts.map((h) => (
        <svg
          key={h.id}
          className="aster-heart"
          viewBox="0 0 24 24"
          width={h.size}
          height={h.size}
          style={{
            left: `${h.x}%`,
            animationDelay: `${h.delayMs}ms`,
            animationDuration: `${h.durationMs}ms`,
            ["--drift" as string]: `${h.drift}px`,
          } as CSSProperties}
        >
          <path fill={h.hue} d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
        </svg>
      ))}
    </div>
  );
}

/**
 * The stage the home's hero companion stands on: it drifts on a lazy
 * multi-axis path, leans and looks toward the pointer through a soft spring,
 * squishes when pressed, and answers a popCompanion() with a squash, a hop and
 * a spin. Everything here is a 2D transform on HTML wrappers, so the SVG is
 * never re-rasterised mid-motion; the body's own jelly and the orbiting moons
 * are the avatar's `living` loop. [body] sets its temperament.
 */
export function JellyCompanionStage({ body, children }: { body: AsterBlobId; children: ReactNode }) {
  // Motion needs a real DOM: server markup (and its tests) draw the plain companion
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Stage body={body}>{children}</Stage> : <>{children}</>;
}

function Stage({ body, children }: { body: AsterBlobId; children: ReactNode }) {
  const me = BLOB_PERSONALITY[body];
  const reduce = useReducedMotion() ?? false;
  const sounds = useCompanionSounds();
  const companionSoundsOn = useRef(sounds);
  companionSoundsOn.current = sounds;
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const popping = useRef(false);
  const target = "[data-jelly-pop]";

  // the pointer, -1..1 around the stage, through a spring
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, LEAN_SPRING);
  const sy = useSpring(py, LEAN_SPRING);
  const leanX = useTransform(sx, [-1, 1], [-12, 12]);
  const leanY = useTransform(sy, [-1, 1], [-8, 8]);
  const leanR = useTransform(sx, [-1, 1], [-5, 5]);
  // the eyes follow too: CSS vars read by .aster-blob__look, no re-render
  useMotionValueEvent(sx, "change", (v) => scope.current?.style.setProperty("--aster-look-x", `${(v * 7).toFixed(2)}px`));
  useMotionValueEvent(sy, "change", (v) => scope.current?.style.setProperty("--aster-look-y", `${(v * 5).toFixed(2)}px`));

  // What the eyes say (styles.css, .aster-jelly-stage[data-mood]): a wink now
  // and then, ^ ^ after a pop, wide on hover, drowsy and then asleep when idle.
  const [mood, setMood] = useState<Mood>("idle");
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const hovered = useRef(false);
  const moodTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Show [next] for [ms], then fall back to idle (or curious while hovered). */
  const flash = (next: Mood, ms: number) => {
    clearTimeout(moodTimer.current);
    setMood(next);
    moodTimer.current = setTimeout(() => setMood(hovered.current ? "curious" : "idle"), ms);
  };
  useEffect(() => () => clearTimeout(moodTimer.current), []);

  // a pop flings the moons outward; the avatar's loop reads when
  const scatterMoons = () => {
    if (scope.current) scope.current.dataset.scatter = String(performance.now());
  };

  // hearts: a little burst from the companion, or a whole screenful
  const [burst, setBurst] = useState<Heart[]>([]);
  const [shower, setShower] = useState<Heart[]>([]);
  const heartTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const hearts = (screen: boolean) => {
    const set = screen ? setShower : setBurst;
    const made = makeHearts(screen ? 30 : 4, screen ? 100 : 50);
    set(made);
    heartTimers.current.push(setTimeout(() => set((now) => (now === made ? [] : now)), screen ? 4_500 : 2_600));
  };
  useEffect(() => () => heartTimers.current.forEach(clearTimeout), []);

  // energy: 1 awake, 0 asleep; the drift slows and droops as it falls
  const energy = useSpring(1, { stiffness: 20, damping: 12 });
  useEffect(() => energy.set(mood === "asleep" ? 0 : mood === "sleepy" || mood === "yawn" ? 0.45 : 1), [mood, energy]);
  // a keystroke dips it in a little nod
  const nod = useSpring(0, { stiffness: 420, damping: 13 });

  // the drift: sums of slow sines, so the path never repeats or stops dead.
  // Time is accumulated, not read, so slowing down never jumps the path.
  const roamX = useMotionValue(0);
  const roamY = useMotionValue(0);
  const roamR = useMotionValue(0);
  const clock = useRef(0);
  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const e = energy.get();
    const t = (clock.current += (Math.min(delta, 64) / 1000) * (0.35 + 0.65 * e) * me.roamSpeed);
    const reach = me.roamReach;
    roamX.set(e * reach * (10 * Math.sin(t * 0.55) + 4 * Math.sin(t * 1.3 + 0.7)));
    roamY.set(reach * (-9 * e + (3 + 6 * e) * Math.sin(t * 1.1) + 3 * Math.sin(t * 0.45 + 1.9)) + (1 - e) * 10 + nod.get());
    roamR.set(2.5 * Math.sin(t * 0.8 + 0.4) + (1 - e) * 9);
  });
  // the shadow tightens and fades as the companion rises
  const shadowScale = useTransform(roamY, [-21, 3], [0.78, 1]);
  const shadowOpacity = useTransform(roamY, [-21, 3], [0.28, 0.5]);

  // A wink is the whole body's: the head tips toward the winking eye with a
  // little hop and squash, then springs back as the eye reopens.
  const wink = async () => {
    flash("wink", 700);
    if (reduce || popping.current || !scope.current) return;
    popping.current = true;
    try {
      await animate(target, { rotate: 9, scaleX: 1.05, scaleY: 0.95, y: -7 }, { duration: 0.2, ease: [0.22, 1, 0.36, 1] });
      await animate(target, { rotate: 0, scaleX: 1, scaleY: 1, y: 0 }, { type: "spring", visualDuration: 0.5, bounce: me.bounce });
    } finally {
      popping.current = false;
    }
  };
  const winkRef = useRef(wink);
  winkRef.current = wink;

  // a wink every so often, while awake and not busy with anything else
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (IDLE.has(moodRef.current)) void winkRef.current();
        schedule();
      }, 7_000 + Math.random() * 8_000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  // While the reader types on the home, the eyes drop to the prompt box.
  const typingUntil = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastNod = useRef(0);
  const typing = () => {
    if (DROWSY.has(moodRef.current)) return;
    typingUntil.current = Date.now() + TYPING_GLANCE_MS;
    px.set(0);
    py.set(1);
    const now = Date.now();
    if (now - lastNod.current > 220) {
      lastNod.current = now;
      nod.set(4);
      setTimeout(() => nod.set(0), 90);
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => py.set(0), TYPING_GLANCE_MS);
  };
  useEffect(() => () => clearTimeout(typingTimer.current), []);

  // the pointer: lean and look toward it; a fast dart past startles a blink
  const lastStartle = useRef(0);
  useEffect(() => {
    if (reduce) return;
    let last: { x: number; y: number; at: number } | undefined;
    const onMove = (e: PointerEvent) => {
      const el = scope.current;
      if (!el) return;
      const at = performance.now();
      if (last && at > last.at) {
        const speed = Math.hypot(e.clientX - last.x, e.clientY - last.y) / (at - last.at);
        if (speed > STARTLE_SPEED && at - lastStartle.current > STARTLE_EVERY_MS && IDLE.has(moodRef.current)) {
          lastStartle.current = at;
          flash("blink", 260);
        }
      }
      last = { x: e.clientX, y: e.clientY, at };
      if (Date.now() < typingUntil.current) return;
      const r = el.getBoundingClientRect();
      px.set(clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
      py.set(clamp((e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
    };
    const onLeave = () => {
      px.set(0);
      py.set(0);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [reduce, px, py, scope]);

  // Petting: stroking back and forth over it makes it squish with joy.
  const strokes = useRef<{ dir: number; travel: number; turns: number[] }>({ dir: 0, travel: 0, turns: [] });
  const lastPet = useRef(0);
  const pet = async () => {
    const now = Date.now();
    if (now - lastPet.current < 1_800 || DROWSY.has(moodRef.current)) return;
    lastPet.current = now;
    flash("happy", 1_600);
    hearts(false);
    if (sounds) boop(1.3);
    if (reduce || popping.current || !scope.current) return;
    popping.current = true;
    try {
      await animate(target, { scaleX: [1, 1.09, 0.95, 1.06, 0.98, 1], scaleY: [1, 0.91, 1.05, 0.95, 1.02, 1] }, { duration: 0.9, ease: "easeInOut" });
    } finally {
      popping.current = false;
    }
  };
  const onStroke = (e: ReactPointerEvent) => {
    const s = strokes.current;
    const dir = Math.sign(e.movementX);
    if (!dir) return;
    if (dir === s.dir) {
      s.travel += Math.abs(e.movementX);
      return;
    }
    // a turn only counts after a real stroke, not a jitter
    if (s.dir !== 0 && s.travel > 12) {
      const now = Date.now();
      s.turns = [...s.turns.filter((at) => now - at < PET_WINDOW_MS), now];
      if (s.turns.length >= PET_STROKES) {
        s.turns = [];
        void pet();
      }
    }
    s.dir = dir;
    s.travel = Math.abs(e.movementX);
  };

  // the nap: drowsy, then a big stretching yawn, then asleep
  const napTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const graceUntil = useRef(0);
  const nap = () => {
    if (DROWSY.has(moodRef.current)) return;
    clearTimeout(moodTimer.current);
    // the keystroke or click that asked for the nap must not wake it again
    graceUntil.current = Date.now() + 1_200;
    setMood("sleepy");
    napTimers.current = [
      setTimeout(() => {
        setMood("yawn");
        if (reduce || popping.current || !scope.current) return;
        // stretch up through the yawn, then sag into sleep
        void animate(target, { scaleX: [1, 0.93, 0.93, 1.03, 1], scaleY: [1, 1.1, 1.1, 0.97, 1], y: [0, -8, -8, 2, 0] }, {
          duration: 1.8,
          times: [0, 0.3, 0.65, 0.85, 1],
          ease: "easeInOut",
        });
      }, 2_200),
      setTimeout(() => setMood("asleep"), 4_200),
    ];
  };
  const napRef = useRef(nap);
  napRef.current = nap;

  // snoring, when this computer has the companion's sounds on
  useEffect(() => {
    if (mood !== "asleep" || !sounds) return;
    return startSnoring();
  }, [mood, sounds]);

  // the wake-up: a stretch from a squash, a startled hop, a bouncy landing
  const lastActive = useRef(Date.now());
  const wake = async () => {
    lastActive.current = Date.now();
    if (!DROWSY.has(moodRef.current)) return;
    napTimers.current.forEach(clearTimeout);
    flash("curious", 1_400);
    if (sounds) boop(1.2);
    if (reduce || popping.current || !scope.current) return;
    popping.current = true;
    try {
      await animate(target, { scaleX: 1.14, scaleY: 0.84, y: 8 }, { duration: 0.2, ease: [0.33, 0, 0.67, 1] });
      await animate(target, { scaleX: 0.9, scaleY: 1.14, y: -40 * me.hop }, { duration: 0.32, ease: [0.22, 1, 0.36, 1] });
      await animate(target, { scaleX: 1, scaleY: 1, y: 0 }, { type: "spring", visualDuration: 0.5, bounce: Math.max(me.bounce, 0.45) });
    } finally {
      popping.current = false;
    }
    flash("happy", 900);
  };
  const wakeRef = useRef(wake);
  wakeRef.current = wake;

  // nap after IDLE_MS without the reader: drowsy first, then asleep
  useEffect(() => {
    const onActivity = () => {
      if (Date.now() < graceUntil.current) return;
      lastActive.current = Date.now();
      if (DROWSY.has(moodRef.current)) void wakeRef.current();
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const name of events) window.addEventListener(name, onActivity, { passive: true });
    const check = setInterval(() => {
      if (!DROWSY.has(moodRef.current) && Date.now() - lastActive.current >= IDLE_MS) napRef.current();
    }, 2_000);
    const timers = napTimers.current;
    return () => {
      for (const name of events) window.removeEventListener(name, onActivity);
      clearInterval(check);
      timers.forEach(clearTimeout);
    };
  }, []);

  // squash, hop and spin; a prompt hops higher than a click into the chat
  const pop = async (kind: CompanionPopKind) => {
    if (DROWSY.has(moodRef.current)) return void wake();
    if (reduce || popping.current || !scope.current) return;
    popping.current = true;
    flash("happy", 1_100);
    scatterMoons();
    if (sounds) boop(1);
    const hop = (kind === "chat" ? -34 : -48) * me.hop;
    try {
      await animate(target, { scaleX: 1.1, scaleY: 0.9, y: 6 }, { duration: 0.16, ease: [0.33, 0, 0.67, 1] });
      await animate(
        target,
        { scaleX: 0.95, scaleY: 1.06, y: hop, rotate: 360 },
        { duration: 0.42 / Math.sqrt(me.roamSpeed), ease: [0.22, 1, 0.36, 1], rotate: { duration: 0.75, ease: [0.45, 0, 0.2, 1] } },
      );
      await animate(target, { scaleX: 1, scaleY: 1, y: 0 }, { type: "spring", visualDuration: 0.45, bounce: me.bounce });
    } finally {
      // the spin landed on a full turn: put the angle home unseen
      animate(target, { rotate: 0 }, { duration: 0 });
      popping.current = false;
    }
  };

  // the :) code: a happy little dance, side to side with hops
  const dance = async () => {
    if (DROWSY.has(moodRef.current)) return void wake();
    if (popping.current || !scope.current) return;
    flash("dance", 2_000);
    scatterMoons();
    if (sounds) [1, 1.25, 1.5].forEach((pitch, i) => setTimeout(() => boop(pitch), i * 260));
    if (reduce) return;
    popping.current = true;
    try {
      await animate(
        target,
        {
          x: [0, -16, 16, -16, 16, 0],
          y: [0, -14 * me.hop, 0, -14 * me.hop, 0, 0],
          rotate: [0, -14, 14, -14, 14, 0],
          scaleX: [1, 0.95, 1.06, 0.95, 1.06, 1],
          scaleY: [1, 1.06, 0.93, 1.06, 0.93, 1],
        },
        { duration: 1.8, ease: "easeInOut" },
      );
    } finally {
      popping.current = false;
    }
  };

  // events from the composer and the mode picker
  const handlers = useRef({ pop, nap, typing, dance, hearts });
  handlers.current = { pop, nap, typing, dance, hearts };
  useEffect(() => {
    const onPop = (e: Event) => void handlers.current.pop((e as CustomEvent<CompanionPopKind>).detail ?? "prompt");
    const onNap = () => handlers.current.nap();
    const onCue = (e: Event) => {
      const cue = (e as CustomEvent<CompanionCue>).detail;
      if (cue === "typing") handlers.current.typing();
      else if (cue === "dance") void handlers.current.dance();
      else if (cue === "hearts") {
        handlers.current.hearts(true);
        handlers.current.hearts(false);
        if (!DROWSY.has(moodRef.current)) flash("happy", 1_800);
        if (companionSoundsOn.current) boop(1.5);
      }
    };
    window.addEventListener(COMPANION_POP_EVENT, onPop);
    window.addEventListener(COMPANION_NAP_EVENT, onNap);
    window.addEventListener(COMPANION_CUE_EVENT, onCue);
    return () => {
      window.removeEventListener(COMPANION_POP_EVENT, onPop);
      window.removeEventListener(COMPANION_NAP_EVENT, onNap);
      window.removeEventListener(COMPANION_CUE_EVENT, onCue);
    };
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <div ref={scope} className="aster-jelly-stage relative" data-mood={mood} data-body={body}>
        {/* a twinkle off the winking eye */}
        {mood === "wink" && (
          <span aria-hidden className="aster-wink-spark pointer-events-none absolute left-[60%] top-[30%] select-none">✦</span>
        )}
        {mood === "asleep" && (
          <span aria-hidden className="aster-zzz pointer-events-none absolute right-[14%] top-[6%] select-none">
            <span>z</span>
            <span>z</span>
            <span>z</span>
          </span>
        )}
        {burst.length > 0 && <HeartShapes hearts={burst} className="aster-hearts pointer-events-none absolute inset-x-0 top-[25%] z-10 h-0" />}
        {shower.length > 0 && createPortal(<HeartShapes hearts={shower} className="aster-hearts aster-hearts--screen pointer-events-none fixed inset-x-0 bottom-0 z-[60] h-0" />, document.body)}
        <motion.div
          style={{ x: leanX, y: leanY, rotate: leanR }}
          onHoverStart={() => {
            hovered.current = true;
            if (moodRef.current === "idle") setMood("curious");
          }}
          onHoverEnd={() => {
            hovered.current = false;
            if (moodRef.current === "curious") setMood("idle");
          }}
          onPointerMove={onStroke}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scaleX: 1.07, scaleY: 0.93 }}
          transition={{ type: "spring", visualDuration: 0.35, bounce: me.bounce }}
          onTap={() => void pop("prompt")}
          className="cursor-pointer"
        >
          <motion.div style={{ x: roamX, y: roamY, rotate: roamR }}>
            <div data-jelly-pop className="origin-[50%_60%]">{children}</div>
          </motion.div>
        </motion.div>
        <motion.div
          aria-hidden
          className="aster-jelly-shadow pointer-events-none mx-auto -mt-2 h-4 w-2/5 rounded-[50%]"
          style={{ scaleX: shadowScale, opacity: shadowOpacity }}
        />
      </div>
    </MotionConfig>
  );
}
