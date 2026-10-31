import { useId } from "react";

import {
  LOGO_BLOB,
  LOGO_COLORS,
  LOGO_EYES,
  LOGO_SMILE,
  LOGO_SPARKLE,
  LOGO_SPARKLE_AT,
  LOGO_TILE,
} from "../../../shared/aster-logo";
import { blobStateFor } from "@/lib/aster-blobs";
import type { MausState } from "@/lib/mascot";

/**
 * The ASTER logo, the app's own mark: the lavender blob on its navy tile with
 * the sparkle, drawn from the same geometry as the app icons. It stands for
 * ASTER itself; bots wear their own companion (BotAvatar).
 */
export function AsterMark({
  size = 26,
  className,
  label,
  mood,
  beat,
}: {
  size?: number;
  className?: string;
  label?: string;
  /** Where it stands for a guide (onboarding): a happy mood closes the eyes to ^ ^. */
  mood?: MausState;
  /** Changing it plays a small hop (styles.css, .aster-mark-beat). */
  beat?: number;
}) {
  const id = useId();
  const happy = mood !== undefined && blobStateFor(mood, false) === "happy";
  const c = LOGO_COLORS;
  const t = LOGO_TILE;
  // below 24 px the smile is noise: bolder eyes alone keep the face
  const small = size < 24;
  const s = LOGO_SPARKLE_AT;
  return (
    <svg
      key={beat}
      width={size}
      height={size}
      viewBox={`${t.x} ${t.y} ${t.size} ${t.size}`}
      className={beat ? `aster-mark-beat ${className ?? ""}` : className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.tileTop} />
          <stop offset="1" stopColor={c.tileBottom} />
        </linearGradient>
        <radialGradient id={`${id}-blob`} cx="0.36" cy="0.3" r="0.85">
          <stop offset="0" stopColor={c.blobLight} />
          <stop offset="0.5" stopColor={c.blobMid} />
          <stop offset="1" stopColor={c.blobDeep} />
        </radialGradient>
      </defs>
      <rect x={t.x} y={t.y} width={t.size} height={t.size} rx={t.radius} fill={`url(#${id}-tile)`} />
      <path d={LOGO_BLOB} fill={`url(#${id}-blob)`} />
      {happy
        ? LOGO_EYES.map((eye) => (
          <path key={eye.x} d={`M${eye.x - 26},${eye.y + 10}Q${eye.x},${eye.y - 26} ${eye.x + 26},${eye.y + 10}`} fill="none" stroke={c.face} strokeWidth={small ? 26 : 16} strokeLinecap="round" />
        ))
        : LOGO_EYES.map((eye) => (
          <circle key={eye.x} cx={eye.x} cy={small ? eye.y - 6 : eye.y} r={small ? 38 : 22} fill={c.face} />
        ))}
      {!small && <path d={LOGO_SMILE} fill="none" stroke={c.face} strokeWidth={15} strokeLinecap="round" />}
      <path d={LOGO_SPARKLE} fill={c.sparkle} transform={`translate(${s.x} ${s.y}) scale(${s.scale})`} />
    </svg>
  );
}
