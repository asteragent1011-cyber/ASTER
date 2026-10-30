import { memo, useEffect, useId, useRef, useState } from "react";
import { MASCOT_BODIES } from "../../../shared/mascot-bodies";
import { blobPhase, type AsterBlobId, type AsterBlobMotion, type AsterBlobState } from "@/lib/aster-blobs";

/** The face box every catalog body is solved in (scripts/gen-mascot-bodies.ts). */
const FACE_BOX = 228.541;
/** Below this the details would be noise: drop them and let the face fill. */
const COMPACT_AT = 36;
/** Room around the body for rings, moons and particles at full detail. */
const PAD = 36;
/** How long a one-shot beat holds, matching its CSS keyframes. */
const BEAT_MS: Record<AsterBlobMotion, number> = { blink: 320, "message-sent": 700, "message-received": 1_200 };

interface Palette {
  light: string;
  mid: string;
  deep: string;
  accent: string;
  /** The ring and its glints. */
  ring: string;
}

/** The brand sheet's swatches, per companion. */
const PALETTES: Record<AsterBlobId, Palette> = {
  luma: { light: "#F6E3FF", mid: "#BBA0FF", deep: "#8466EE", accent: "#F5B8F2", ring: "#E9DCFF" },
  nova: { light: "#D2F5FF", mid: "#7DB4FF", deep: "#5363F0", accent: "#6FE3FF", ring: "#CFEFFF" },
  orbit: { light: "#D7E4FF", mid: "#8FA4FF", deep: "#5551E2", accent: "#7FD1FF", ring: "#DCE3FF" },
  echo: { light: "#EEE5FF", mid: "#A9A5FF", deep: "#7A68F0", accent: "#9FCBFF", ring: "#E4DEFF" },
};

type Ring = { rx: number; ry: number; tilt: number; width: number };
/** Each body's ring, tilted about the body's centre (114, 124). */
const RINGS: Record<AsterBlobId, Ring | null> = {
  orbit: { rx: 146, ry: 40, tilt: -14, width: 3 },
  luma: { rx: 140, ry: 34, tilt: -16, width: 2.5 },
  nova: { rx: 150, ry: 30, tilt: 8, width: 1.6 },
  echo: null,
};
/** A living companion's ring when its body draws none (Echo). */
const LIVING_RING = { rx: 144, ry: 34, tilt: -12, width: 2.4 };
/** Seconds per lap for the moons, and for the faster glints. */
const ORBIT_S = 9;
const GLINT_S = 3.8;
type Orbiter = { at: number; r: number; tone: "accent" | "mid" | "light" };
/** The moons riding a living companion's ring: start (in turns), radius, tone. */
const ORBITERS: Record<AsterBlobId, Orbiter[]> = {
  luma: [{ at: 0, r: 9, tone: "accent" }, { at: 0.55, r: 7, tone: "mid" }],
  nova: [{ at: 0.1, r: 6, tone: "accent" }, { at: 0.6, r: 5, tone: "accent" }],
  orbit: [{ at: 0, r: 14, tone: "mid" }, { at: 0.36, r: 9, tone: "accent" }, { at: 0.68, r: 11, tone: "accent" }],
  echo: [{ at: 0.2, r: 8, tone: "mid" }, { at: 0.7, r: 6, tone: "light" }],
};
const GLINTS = [0, 0.5];

const STAR = "M16,1.5c1.1,7.6 6.9,13.4 14.5,14.5 -7.6,1.1 -13.4,6.9 -14.5,14.5C14.9,22.9 9.1,17.1 1.5,16 9.1,14.9 14.9,9.1 16,1.5Z";

/** The outline each body is drawn and clipped by, parsed once. */
const OUTLINE: Record<AsterBlobId, { d: string; fit: string; ax: number; ay: number }> = Object.fromEntries(
  (["luma", "nova", "orbit", "echo"] as const).map((id) => {
    const body = MASCOT_BODIES[id];
    const d = /d="([^"]+)"/.exec(body.clip)?.[1] ?? "";
    return [id, { d, fit: body.fit, ax: body.anchor.x, ay: body.anchor.y }];
  }),
) as Record<AsterBlobId, { d: string; fit: string; ax: number; ay: number }>;

export interface AsterBlobAvatarProps {
  body: AsterBlobId;
  size?: number;
  /** The mood: idle, thinking, happy, sleepy, alert or selected. */
  state?: AsterBlobState;
  /** A one-shot beat; replayed whenever [motionKey] changes. */
  motion?: AsterBlobMotion | null;
  motionKey?: number;
  /** True while the bot is working: going true plays message-sent, going false message-received. */
  busy?: boolean;
  /** Off draws the companion still: no float, blink or beats. For long lists. */
  animated?: boolean;
  /** Spreads float and blink phases so a roster never moves in step. */
  identity?: string;
  label?: string | null;
  /** The home's hero: a jelly body that breathes and moons that orbit the
   * ring, passing behind and in front of it. One per screen; it runs a frame loop. */
  living?: boolean;
}

/**
 * The ASTER companions from the brand sheet: glossy space blobs with a dark
 * visor and two glowing eyes. One SVG per avatar; every movement is a CSS
 * animation (styles.css, `.aster-blob`), so a roster costs no frames on the
 * main thread and reduced motion stills all of it.
 */
export const AsterBlobAvatar = memo(function AsterBlobAvatar({
  body,
  size = 44,
  state = "idle",
  motion = null,
  motionKey = 0,
  busy,
  animated = true,
  identity,
  label,
  living: livingProp = false,
}: AsterBlobAvatarProps) {
  const uid = useId().replace(/:/g, "");
  const palette = PALETTES[body];
  const shape = OUTLINE[body];
  const compact = size < COMPACT_AT;
  const living = livingProp && animated && !compact;
  const phase = blobPhase(identity ?? body);

  // A beat plays once: from the caller's motion, or from busy turning on/off.
  const [beat, setBeat] = useState<{ kind: AsterBlobMotion; nonce: number } | null>(null);
  const play = (kind: AsterBlobMotion) => setBeat({ kind, nonce: Date.now() });
  useEffect(() => {
    if (motion && animated) play(motion);
  }, [motion, motionKey, animated]);
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current === busy) return;
    if (animated && busy !== undefined && wasBusy.current !== undefined) play(busy ? "message-sent" : "message-received");
    wasBusy.current = busy;
  }, [busy, animated]);
  useEffect(() => {
    if (!beat) return;
    const timer = setTimeout(() => setBeat(null), BEAT_MS[beat.kind]);
    return () => clearTimeout(timer);
  }, [beat]);

  // Compact: a little padding only, and a larger face so 24px still reads.
  const pad = compact ? 6 : PAD;
  const viewBox = `${-pad} ${-pad} ${FACE_BOX + pad * 2} ${FACE_BOX + pad * 2}`;
  const face = compact ? 1.25 : 1;
  const visor = { rx: 47 * face, ry: 31 * face };
  const eyeR = 7.5 * face;
  const eyeGap = 15 * face;
  const { ax, ay } = shape;
  const g = (name: string) => `${name}-${body}-${uid}`;

  const ringBack = (rx: number, ry: number) => `M${114 - rx},124 A${rx},${ry} 0 0 1 ${114 + rx},124`;
  const ringFront = (rx: number, ry: number) => `M${114 + rx},124 A${rx},${ry} 0 0 1 ${114 - rx},124`;
  const ring = RINGS[body] ?? (living ? LIVING_RING : null);
  const orbiters = living ? ORBITERS[body] : [];

  // The living loop: one rAF writes the squish, the face's lag, the ring's
  // precession and every orbiter. Sums of sines, so nothing ever stops dead.
  const squishRef = useRef<SVGGElement>(null);
  const lookRef = useRef<SVGGElement>(null);
  const ringRefs = useRef<Array<SVGGElement | null>>([]);
  const orbitRefs = useRef<Array<SVGGElement | null>>([]);
  const glintRefs = useRef<Array<SVGCircleElement | null>>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const loopRing = living ? ring : null;
  useEffect(() => {
    if (!loopRing) return;
    const lap = ORBITERS[body];
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const place = (el: SVGElement | null | undefined, theta: number, front: boolean) => {
      if (!el) return;
      const sin = Math.sin(theta);
      el.setAttribute(
        "transform",
        `translate(${(114 + loopRing.rx * Math.cos(theta)).toFixed(2)} ${(124 + loopRing.ry * sin).toFixed(2)}) scale(${(0.8 + 0.2 * sin).toFixed(3)})`,
      );
      // the near half of the lap is drawn over the body, the far half under it
      el.style.opacity = front !== sin >= 0 ? "0" : front ? "1" : (0.55 + 0.45 * (1 + sin)).toFixed(3);
    };
    let raf = 0;
    const frame = (now: number) => {
      const t = still ? 0 : now / 1000 - phase.floatDelayS;
      const tilt = `rotate(${(loopRing.tilt + 5 * Math.sin(t * 0.5)).toFixed(2)} 114 124)`;
      for (const el of ringRefs.current) el?.setAttribute("transform", tilt);
      lap.forEach((o, i) => {
        const theta = 2 * Math.PI * (o.at + t / ORBIT_S);
        place(orbitRefs.current[i * 2], theta, false);
        place(orbitRefs.current[i * 2 + 1], theta, true);
      });
      GLINTS.forEach((at, i) => {
        const theta = 2 * Math.PI * (at + t / GLINT_S);
        place(glintRefs.current[i * 2], theta, false);
        place(glintRefs.current[i * 2 + 1], theta, true);
      });
      // squash and stretch that keeps its volume: x wide means y short
      const sx = 1 + 0.028 * Math.sin(t * 1.8) + 0.01 * Math.sin(t * 3.1 + 1.1);
      if (squishRef.current) squishRef.current.style.transform = `scale(${sx.toFixed(4)}, ${(1 / sx).toFixed(4)})`;
      // the face trails the body a beat, like something set in jelly
      const think = stateRef.current === "thinking";
      if (lookRef.current) {
        const lx = (think ? 4 : 0) + 1.2 * Math.sin(t * 1.8 - 0.9);
        const ly = (think ? -4 : 0) + 2 * Math.sin(t * 1.8 - 1.2);
        lookRef.current.style.transform = `translate(${lx.toFixed(2)}px, ${ly.toFixed(2)}px)`;
      }
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [loopRing, body, phase.floatDelayS]);

  const moon = (x: number, y: number, r: number, color: string, key: string) => (
    <g key={key} className="aster-blob__moon">
      <circle cx={x} cy={y} r={r} fill={`url(#${g("moon")})`} />
      <circle cx={x} cy={y} r={r} fill={color} opacity={0.45} />
      <circle cx={x - r * 0.35} cy={y - r * 0.35} r={r * 0.35} fill="#fff" opacity={0.7} />
    </g>
  );
  // an orbiter is drawn twice, once per half of the ring; the loop shows one
  const orbiter = (o: Orbiter, i: number, front: boolean) => (
    <g key={`o${i}${front ? "f" : "b"}`} ref={(el) => { orbitRefs.current[i * 2 + (front ? 1 : 0)] = el; }} style={{ opacity: 0 }}>
      <circle r={o.r * 1.9} fill={palette[o.tone]} opacity={0.18} />
      <circle r={o.r} fill={`url(#${g("moon")})`} />
      <circle r={o.r} fill={palette[o.tone]} opacity={0.45} />
      <circle cx={-o.r * 0.35} cy={-o.r * 0.35} r={o.r * 0.35} fill="#fff" opacity={0.75} />
    </g>
  );
  const glint = (i: number, front: boolean) => (
    <circle key={`g${i}${front ? "f" : "b"}`} ref={(el) => { glintRefs.current[i * 2 + (front ? 1 : 0)] = el; }} r={2.6} fill="#fff" style={{ opacity: 0 }} />
  );
  const sparks = (points: Array<[number, number, number]>) =>
    points.map(([x, y, r], i) => (
      <circle key={`p${i}`} className="aster-blob__particle" cx={x} cy={y} r={r} fill={palette.ring} style={{ animationDelay: `${-i * 0.7}s` }} />
    ));

  return (
    <span
      className={`aster-blob inline-flex shrink-0${animated ? "" : " aster-blob--still"}${living ? " aster-blob--living" : ""}`}
      data-body={body}
      data-state={state}
      data-motion={beat?.kind}
      role={label ? "img" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      style={{
        width: size,
        height: size,
        ["--aster-blob-float" as string]: `${phase.floatDelayS}s`,
        ["--aster-blob-blink" as string]: `${phase.blinkDelayS}s`,
        ["--aster-blob-enter" as string]: `${phase.enterDelayMs}ms`,
      }}
    >
      <svg viewBox={viewBox} width={`${size}px`} height={`${size}px`} overflow="visible">
        <defs>
          <radialGradient id={g("body")} cx="34%" cy="28%" r="78%">
            <stop offset="0" stopColor={palette.light} />
            <stop offset="0.48" stopColor={palette.mid} />
            <stop offset="1" stopColor={palette.deep} />
          </radialGradient>
          <radialGradient id={g("gloss")} cx="32%" cy="22%" r="42%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={g("tint")} cx="78%" cy="82%" r="55%">
            <stop offset="0" stopColor={palette.accent} stopOpacity="0.55" />
            <stop offset="1" stopColor={palette.accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={g("visor")} cx="50%" cy="40%" r="65%">
            <stop offset="0" stopColor="#2A2C66" />
            <stop offset="1" stopColor="#14163A" />
          </radialGradient>
          <radialGradient id={g("eye")} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={g("moon")} cx="35%" cy="30%" r="70%">
            <stop offset="0" stopColor="#fff" />
            <stop offset="1" stopColor={palette.mid} />
          </radialGradient>
          <clipPath id={g("clip")}>
            <path d={shape.d} transform={shape.fit} />
          </clipPath>
        </defs>

        <g className="aster-blob__enter">
          <g className="aster-blob__lift">
            <g className="aster-blob__float">
              {/* behind the body: the far half of the ring */}
              {!compact && ring && (
                <g className="aster-blob__ring" ref={(el) => { ringRefs.current[0] = el; }} transform={`rotate(${ring.tilt} 114 124)`}>
                  <g className={living ? undefined : "aster-blob__nudge"}>
                  {living && <path d={ringBack(ring.rx, ring.ry)} fill="none" stroke={palette.ring} strokeOpacity={0.14} strokeWidth={ring.width * 5} strokeLinecap="round" />}
                  <path d={ringBack(ring.rx, ring.ry)} fill="none" stroke={palette.ring} strokeOpacity={0.5} strokeWidth={ring.width} />
                  {orbiters.map((o, i) => orbiter(o, i, false))}
                  {living && GLINTS.map((_, i) => glint(i, false))}
                  </g>
                </g>
              )}
              <g className="aster-blob__squish" ref={squishRef}>
                {/* Echo is layered: a second, lighter shell behind the first */}
                {body === "echo" && (
                  <g transform="translate(-18 -10) scale(1.08)" opacity={0.6}>
                    <path d={shape.d} transform={shape.fit} fill={palette.mid} />
                    <path d={shape.d} transform={shape.fit} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={2} />
                  </g>
                )}
                <path className="aster-blob__body" d={shape.d} transform={shape.fit} fill={`url(#${g("body")})`} />
                <g clipPath={`url(#${g("clip")})`}>
                  <rect x={0} y={0} width={FACE_BOX} height={FACE_BOX} fill={`url(#${g("tint")})`} />
                  <rect x={0} y={0} width={FACE_BOX} height={FACE_BOX} fill={`url(#${g("gloss")})`} />
                </g>
                <path className="aster-blob__rim" d={shape.d} transform={shape.fit} fill="none" stroke="#fff" strokeOpacity={0.28} strokeWidth={compact ? 3 : 2} />

                {/* the visor and its two glowing eyes */}
                <g className="aster-blob__face" transform={`translate(${ax} ${ay - 4})`}>
                  <ellipse rx={visor.rx} ry={visor.ry} fill={`url(#${g("visor")})`} opacity={0.92} />
                  <g className="aster-blob__look" ref={lookRef}>
                    <g className="aster-blob__eyes">
                      {/* one group per eye, so a living companion can wink */}
                      <g className="aster-blob__eye aster-blob__eye--l">
                        {!compact && <circle cx={-eyeGap} cy={0} r={eyeR * 2} fill={`url(#${g("eye")})`} opacity={0.45} />}
                        <circle cx={-eyeGap} cy={0} r={eyeR} fill="#fff" />
                      </g>
                      <g className="aster-blob__eye aster-blob__eye--r">
                        {!compact && <circle cx={eyeGap} cy={0} r={eyeR * 2} fill={`url(#${g("eye")})`} opacity={0.45} />}
                        <circle cx={eyeGap} cy={0} r={eyeR} fill="#fff" />
                      </g>
                    </g>
                    {/* happy: the sheet's closed ^ ^ eyes */}
                    <g className="aster-blob__happy" fill="none" stroke="#fff" strokeWidth={eyeR * 0.75} strokeLinecap="round">
                      <path d={`M${-eyeGap - eyeR},${eyeR * 0.5} Q${-eyeGap},${-eyeR * 1.1} ${-eyeGap + eyeR},${eyeR * 0.5}`} />
                      <path d={`M${eyeGap - eyeR},${eyeR * 0.5} Q${eyeGap},${-eyeR * 1.1} ${eyeGap + eyeR},${eyeR * 0.5}`} />
                    </g>
                    {living && (
                      <>
                        {/* a wink: the right eye folds into a ^ */}
                        <path className="aster-blob__wink" fill="none" stroke="#fff" strokeWidth={eyeR * 0.75} strokeLinecap="round"
                          d={`M${eyeGap - eyeR},${eyeR * 0.5} Q${eyeGap},${-eyeR * 1.1} ${eyeGap + eyeR},${eyeR * 0.5}`} />
                        {/* a yawn: a round mouth that opens below the eyes */}
                        <ellipse className="aster-blob__mouth" cx={0} cy={eyeR * 2.3} rx={eyeR * 0.8} ry={eyeR * 1.05}
                          fill="#fff" fillOpacity={0.18} stroke="#fff" strokeWidth={eyeR * 0.35} />
                        {/* asleep: two soft closed lids */}
                        <g className="aster-blob__sleep" fill="none" stroke="#fff" strokeWidth={eyeR * 0.6} strokeLinecap="round">
                          <path d={`M${-eyeGap - eyeR},0 Q${-eyeGap},${eyeR * 0.9} ${-eyeGap + eyeR},0`} />
                          <path d={`M${eyeGap - eyeR},0 Q${eyeGap},${eyeR * 0.9} ${eyeGap + eyeR},0`} />
                        </g>
                      </>
                    )}
                  </g>
                </g>
              </g>

              {!compact && (
                <>
                  {/* in front of the body: the near half of the ring, and what rides it */}
                  {ring && (
                    <g className="aster-blob__ring" ref={(el) => { ringRefs.current[1] = el; }} transform={`rotate(${ring.tilt} 114 124)`}>
                      <g className={living ? undefined : "aster-blob__nudge"}>
                      {living && <path d={ringFront(ring.rx, ring.ry)} fill="none" stroke={palette.ring} strokeOpacity={0.22} strokeWidth={ring.width * 5} strokeLinecap="round" />}
                      <path d={ringFront(ring.rx, ring.ry)} fill="none" stroke={palette.ring} strokeOpacity={0.85} strokeWidth={ring.width} />
                      {orbiters.map((o, i) => orbiter(o, i, true))}
                      {living && GLINTS.map((_, i) => glint(i, true))}
                      {!living && body === "luma" && [moon(114 + ring.rx * 0.96, 124 - 10, 9, palette.accent, "m1"), moon(114 - ring.rx * 0.6, 124 + ring.ry * 0.8, 7, palette.mid, "m2")]}
                      {!living && body === "orbit" && [
                        moon(114 - ring.rx * 0.98, 124 + 4, 14, palette.mid, "m1"),
                        moon(114 + ring.rx * 0.9, 124 - 14, 9, palette.accent, "m2"),
                        moon(114 + ring.rx * 0.42, 124 + ring.ry * 0.9, 11, palette.accent, "m3"),
                      ]}
                      {!living && body === "nova" && [moon(114 - ring.rx * 0.9, 124 + 10, 5, palette.accent, "m1"), moon(114 + ring.rx * 0.97, 124 - 4, 4, palette.accent, "m2")]}
                      </g>
                    </g>
                  )}
                  {body === "luma" && (
                    <g className="aster-blob__star" transform="translate(178 6) scale(1.6)">
                      <path d={STAR} fill={palette.accent} />
                      <path d={STAR} fill="#fff" opacity={0.35} transform="translate(4 4) scale(0.5)" />
                    </g>
                  )}
                  {body === "nova" && (
                    <>
                      {moon(176, -14, 15, palette.mid, "top")}
                      {sparks([[14, 30, 3], [226, 172, 2.5], [196, 36, 2]])}
                    </>
                  )}
                  {body === "luma" && sparks([[-10, 70, 2.5], [220, 196, 2]])}
                  {body === "orbit" && sparks([[30, 14, 2], [212, 210, 2.5]])}
                  {body === "echo" && (
                    <>
                      <ellipse className="aster-blob__particle" cx={4} cy={58} rx={7} ry={11} fill={palette.mid} opacity={0.8} />
                      <ellipse className="aster-blob__particle" cx={226} cy={92} rx={9} ry={12} fill={palette.light} opacity={0.8} style={{ animationDelay: "-1.2s" }} />
                      <ellipse className="aster-blob__particle" cx={96} cy={240} rx={13} ry={6} fill={palette.mid} opacity={0.7} style={{ animationDelay: "-2.1s" }} />
                    </>
                  )}
                </>
              )}
            </g>
          </g>
        </g>
      </svg>
    </span>
  );
});
