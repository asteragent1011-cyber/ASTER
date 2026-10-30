import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { COMPANION_NAP_EVENT, COMPANION_POP_EVENT, type CompanionPopKind } from "@/lib/companion-pop";

/** A soft, under-damped spring: the companion overshoots and settles back. */
const LEAN_SPRING = { stiffness: 90, damping: 14, mass: 0.9 };

/** How long without the reader before the companion dozes off. */
const IDLE_MS = 5 * 60_000;

type Mood = "idle" | "wink" | "happy" | "curious" | "sleepy" | "yawn" | "asleep";
/** The moods of a companion on its way to sleep, or already there. */
const DROWSY: ReadonlySet<Mood> = new Set<Mood>(["sleepy", "yawn", "asleep"]);

const clamp =(v: number) => Math.max(-1, Math.min(1, v));

/**
 * The stage the home's hero companion stands on: it drifts on a lazy
 * multi-axis path, leans and looks toward the pointer through a soft spring,
 * squishes when pressed, and answers a popCompanion() with a squash, a hop and
 * a spin. Everything here is a 2D transform on HTML wrappers, so the SVG is
 * never re-rasterised mid-motion; the body's own jelly and the orbiting moons
 * are the avatar's `living` loop.
 */
export function JellyCompanionStage({ children }: { children: ReactNode }) {
  // Motion needs a real DOM: server markup (and its tests) draw the plain companion
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Stage>{children}</Stage> : <>{children}</>;
}

function Stage({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const popping = useRef(false);

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

  // energy: 1 awake, 0 asleep; the drift slows and droops as it falls
  const energy = useSpring(1, { stiffness: 20, damping: 12 });
  useEffect(() => energy.set(mood === "asleep" ? 0 : mood === "sleepy" || mood === "yawn" ? 0.45 : 1), [mood, energy]);

  // the drift: sums of slow sines, so the path never repeats or stops dead.
  // Time is accumulated, not read, so slowing down never jumps the path.
  const roamX = useMotionValue(0);
  const roamY = useMotionValue(0);
  const roamR = useMotionValue(0);
  const clock = useRef(0);
  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const e = energy.get();
    const t = (clock.current += (Math.min(delta, 64) / 1000) * (0.35 + 0.65 * e));
    roamX.set(e * (10 * Math.sin(t * 0.55) + 4 * Math.sin(t * 1.3 + 0.7)));
    roamY.set(-9 * e + (3 + 6 * e) * Math.sin(t * 1.1) + 3 * Math.sin(t * 0.45 + 1.9) + (1 - e) * 10);
    roamR.set(2.5 * Math.sin(t * 0.8 + 0.4) + (1 - e) * 9);
  });

  // A wink is the whole body's: the head tips toward the winking eye with a
  // little hop and squash, then springs back as the eye reopens.
  const wink = async () => {
    flash("wink", 700);
    if (reduce || popping.current || !scope.current) return;
    popping.current = true;
    const target = "[data-jelly-pop]";
    try {
      await animate(target, { rotate: 9, scaleX: 1.05, scaleY: 0.95, y: -7 }, { duration: 0.2, ease: [0.22, 1, 0.36, 1] });
      await animate(target, { rotate: 0, scaleX: 1, scaleY: 1, y: 0 }, { type: "spring", visualDuration: 0.5, bounce: 0.5 });
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
        if (moodRef.current === "idle" || moodRef.current === "curious") void winkRef.current();
        schedule();
      }, 7_000 + Math.random() * 8_000);
    };
    schedule();
    return () => clearTimeout(timer);
    // flash only touches refs and setters
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the shadow tightens and fades as the companion rises
  const shadowScale = useTransform(roamY, [-21, 3], [0.78, 1]);
  const shadowOpacity = useTransform(roamY, [-21, 3], [0.28, 0.5]);

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      const el = scope.current;
      if (!el) return;
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
        const target = "[data-jelly-pop]";
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
  useEffect(() => {
    const onNap = () => napRef.current();
    window.addEventListener(COMPANION_NAP_EVENT, onNap);
    return () => {
      window.removeEventListener(COMPANION_NAP_EVENT, onNap);
      napTimers.current.forEach(clearTimeout);
    };
  }, []);

  // the wake-up: a stretch from a squash, a startled hop, a bouncy landing
  const wake = async () => {
    lastActive.current = Date.now();
    if (!DROWSY.has(moodRef.current)) return;
    napTimers.current.forEach(clearTimeout);
    flash("curious", 1_400);
    if (reduce || popping.current || !scope.current) return;
    popping.current = true;
    const target = "[data-jelly-pop]";
    try {
      await animate(target, { scaleX: 1.14, scaleY: 0.84, y: 8 }, { duration: 0.2, ease: [0.33, 0, 0.67, 1] });
      await animate(target, { scaleX: 0.9, scaleY: 1.14, y: -40 }, { duration: 0.32, ease: [0.22, 1, 0.36, 1] });
      await animate(target, { scaleX: 1, scaleY: 1, y: 0 }, { type: "spring", visualDuration: 0.5, bounce: 0.55 });
    } finally {
      popping.current = false;
    }
    flash("happy", 900);
  };
  const wakeRef = useRef(wake);
  wakeRef.current = wake;

  // nap after IDLE_MS without the reader: drowsy first, then asleep
  const lastActive = useRef(Date.now());
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
    return () => {
      for (const name of events) window.removeEventListener(name, onActivity);
      clearInterval(check);
    };
  }, []);

  // squash, hop and spin; a prompt hops higher than a click into the chat
  const pop = async (kind: CompanionPopKind) => {
    if (DROWSY.has(moodRef.current)) return void wake();
    if (reduce || popping.current || !scope.current) return;
    popping.current = true;
    flash("happy", 1_100);
    const target = "[data-jelly-pop]";
    const hop = kind === "chat" ? -34 : -48;
    try {
      await animate(target, { scaleX: 1.1, scaleY: 0.9, y: 6 }, { duration: 0.16, ease: [0.33, 0, 0.67, 1] });
      await animate(
        target,
        { scaleX: 0.95, scaleY: 1.06, y: hop, rotate: 360 },
        { duration: 0.42, ease: [0.22, 1, 0.36, 1], rotate: { duration: 0.75, ease: [0.45, 0, 0.2, 1] } },
      );
      await animate(target, { scaleX: 1, scaleY: 1, y: 0 }, { type: "spring", visualDuration: 0.45, bounce: 0.45 });
    } finally {
      // the spin landed on a full turn: put the angle home unseen
      animate(target, { rotate: 0 }, { duration: 0 });
      popping.current = false;
    }
  };
  const popRef = useRef(pop);
  popRef.current = pop;

  useEffect(() => {
    const onPop = (e: Event) => void popRef.current((e as CustomEvent<CompanionPopKind>).detail ?? "prompt");
    window.addEventListener(COMPANION_POP_EVENT, onPop);
    return () => window.removeEventListener(COMPANION_POP_EVENT, onPop);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div ref={scope} className="aster-jelly-stage relative" data-mood={mood}>
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
          whileHover={{ scale: 1.03 }}
          whileTap={{ scaleX: 1.07, scaleY: 0.93 }}
          transition={{ type: "spring", visualDuration: 0.35, bounce: 0.5 }}
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
