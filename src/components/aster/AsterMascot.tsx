import { memo } from "react";
import { cn } from "@/lib/cn";
import type { CompanionMood } from "@/lib/aster-companion";

/** The ASTER companion on the home screen: a soft glass body that floats,
 * breathes and deforms, ringed by an orbit with two small moons. Pure CSS
 * (styles.css, `.aster-mascot`), so it costs no frames on the main thread.
 * `mood` only changes data attributes; each mood retunes the animation
 * speed and glow, and reduced motion stills all of it. */
export const AsterMascot = memo(function AsterMascot({
  mood = "idle",
  size = 300,
  className,
}: {
  mood?: CompanionMood;
  size?: number;
  className?: string;
}) {
  return (
    <div
      data-aster-mascot
      data-mood={mood}
      role="img"
      aria-label={`ASTER companion, ${mood}`}
      className={cn("aster-mascot", className)}
      style={{ ["--mascot-size" as string]: `${size}px` }}
    >
      <span aria-hidden className="aster-mascot-halo" />
      <span aria-hidden className="aster-mascot-orbit aster-mascot-orbit-back" />
      <span aria-hidden className="aster-mascot-float">
        <span className="aster-mascot-body">
          <span className="aster-mascot-sheen" />
          <span className="aster-mascot-face">
            <span className="aster-mascot-eye aster-mascot-eye-left" />
            <span className="aster-mascot-eye aster-mascot-eye-right" />
          </span>
        </span>
      </span>
      <span aria-hidden className="aster-mascot-orbit aster-mascot-orbit-front" />
      <span aria-hidden className="aster-mascot-moon aster-mascot-moon-a" />
      <span aria-hidden className="aster-mascot-moon aster-mascot-moon-b" />
    </div>
  );
});
