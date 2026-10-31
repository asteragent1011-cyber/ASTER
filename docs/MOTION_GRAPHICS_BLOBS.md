# ASTER companions for motion graphics

How to preview, control and export ASTER's real blob companions (Luma, Nova,
Orbit, Echo) for a motion-graphics video. Written for an AI coding or
motion-graphics agent that has just received this repository.

**Rule: use the frames this pipeline renders. Do not redraw, trace, regenerate
or "restyle" the companions with an image model.** They are code (SVG + CSS +
springs); the exports below are the real thing, pixel for pixel.

Everything here was checked on macOS (Apple Silicon, Chrome, ffmpeg 9) on
2026-10-31. Items marked *not verified* were not run.

## 1. Where the companions live

| File | What it is |
|---|---|
| `src/components/aster/AsterBlobAvatar.tsx` | The companion itself: one inline SVG per avatar (body, glossy gradients, dark visor, two eyes, ring, moons). Moods and beats are CSS classes. With `living`, one `requestAnimationFrame` loop adds the jelly squish, face lag and orbiting moons. |
| `src/components/aster/JellyCompanionStage.tsx` | The home-screen "hero stage" wrapped around a living avatar: drift, lean toward the pointer, hops, winks, dance, hearts, yawn and nap. Built on `motion/react` (springs, keyframes, `useAnimationFrame`). |
| `src/styles.css` (`.aster-blob*` rules) | Every CSS keyframe: float, blink, the mood animations and the beat animations. |
| `src/lib/aster-blobs.ts` | Ids (`ASTER_BLOB_IDS`), names, palettes (`COMPANION_PALETTES`, `companionPalette`), the `AsterBlobState` and `AsterBlobMotion` types, per-companion personality for the living loop (`BLOB_PERSONALITY`). |
| `shared/mascot-bodies.ts` | The body outlines (SVG paths) the avatar clips to. |
| `src/lib/companion-pop.ts` | Window events the stage listens to: `popCompanion`, `napCompanion`, `cueCompanion("typing" \| "dance" \| "hearts")`. |
| `src/components/MascotCentrepiece.tsx` | Where the app puts the hero: `JellyCompanionStage` + a 250 px living `BotAvatar`. |

Rendering technology: **SVG + CSS animations + `motion/react`**. No canvas,
WebGL or Three.js, no bitmap assets.

## 2. Animation states (all real, nothing invented)

**Moods** — held while set (`AsterBlobState`, prop `state`):
`idle`, `thinking`, `speaking`, `happy`, `sleepy`, `alert`, `selected`.

**Beats** — one-shot, replayed each time `motionKey` changes
(`AsterBlobMotion`, prop `motion`):
`blink`, `message-sent`, `message-received`, `worried`.

**Living** (prop `living`, ignored below 36 px): jelly body, face lag, moons
orbiting the ring, passing behind and in front of it.

**Stage** (`JellyCompanionStage`, wraps a living avatar): idle drift and lean,
wink, blink, happy, curious, dance, sleepy, yawn, asleep. These moods are
internal to the stage (chosen by its own timers and by the events in
`src/lib/companion-pop.ts`), not a prop. Triggers you can fire: pop, dance,
hearts, typing glance, nap. Moving the pointer wakes a napping companion.

`prefers-reduced-motion: reduce` stills all of it, in the app and in the lab.

## 3. The Blob Animation Lab

A dev-only page. It is not part of `pnpm build` and does not change the app.

| File | Role |
|---|---|
| `blob-lab.html` | Page entry (Vite serves it in dev only) |
| `src/blob-lab.tsx` | The lab UI, `BlobPreview`, and capture mode |
| `src/blob-lab/clock.ts` | The lab's clock: speed, pause, restart and frame stepping |
| `scripts/capture-blob-animation.mjs` | Headless frame exporter |

Run it:

```sh
pnpm install --frozen-lockfile   # once
pnpm dev                         # Vite on http://127.0.0.1:5199
```

Open **http://127.0.0.1:5199/blob-lab.html**. The ASTER server is not needed.

Controls (left panel):

- **Companion**: Luma, Nova, Orbit, Echo, or **All four** side by side.
- **Mood (held)**: the seven moods above.
- **Beats (one-shot)**: the four beats.
- **Hero stage**: *Living* and *Stage* checkboxes, and the triggers pop, dance,
  hearts, typing glance, nap (enabled when Stage is on).
- **Playback**: Pause / Play, Restart (time back to 0, companions remount),
  Speed 0.1×–3×.
- **Look**: size (48–720 px), tint (the app's bot colours, or the companion's own),
  background: midnight, daylight, green (chroma key), or transparent (shown as
  a checkerboard).

The page also reads the same URL parameters as capture mode (below) for its
initial values, e.g. `blob-lab.html?blob=orbit&state=happy&stage=1`.

### How time is controlled

The companions move on three time sources: CSS keyframes, the living loop
(`requestAnimationFrame` + `performance.now`), and motion's springs. The lab
imports `src/blob-lab/clock.ts` first, which patches `performance.now`,
`requestAnimationFrame`, `setTimeout` and `setInterval` **on this page only**,
and drives every CSS/WAAPI animation through `document.getAnimations()`.

- **Realtime** (normal lab): speed scales all three sources; pause freezes them.
- **Manual** (`?capture=1`): nothing moves until `window.blobLab.step(ms)` is
  called. Each step runs the timers that fall due, one animation frame, sets
  every CSS animation's `currentTime`, and waits for the browser to paint.

## 4. Render one companion on its own

Capture mode renders exactly one companion, centred in a square frame with no
UI:

```
http://127.0.0.1:5199/blob-lab.html?capture=1&blob=nova&state=happy&size=360&bg=transparent
```

| Param | Values | Default |
|---|---|---|
| `blob` | `luma` `nova` `orbit` `echo` | `luma` |
| `state` | a mood from §2 | `idle` |
| `size` | companion size in CSS px, 32–2048 | `360` |
| `bg` | `transparent` `midnight` `daylight` `green` or a CSS colour | `transparent` |
| `living` | `0` / `1` | `1` |
| `stage` | `0` / `1` | `0` |
| `color` | a bot colour name (`green`, `blue`, `red`, …) | the companion's own |
| `beat` / `beatAt` | a beat from §2 / seconds on the lab clock | none |

Frame size = `size × 1.35`, or `size × 1.7` with the stage (room for ring,
moons, drift and hop). In code, the same component is exported as
`BlobPreview` from `src/blob-lab.tsx`:

```tsx
<BlobPreview body="orbit" state="thinking" size={360} color={null}
  living stage={false} beat="message-sent" beatKey={1} />
```

It renders the app's own `AsterBlobAvatar`, wrapped in `JellyCompanionStage`
when `stage` is true. Speed and playback come from `labClock` in
`src/blob-lab/clock.ts` (`setSpeed`, `setPaused`, `restart`, `step`).

## 5. Export for motion graphics (recommended)

Needs `pnpm dev` running, Google Chrome (or Chromium), and ffmpeg for video.
No extra npm packages.

```sh
# one companion, 4 s at 30 fps, transparent PNG sequence + ProRes 4444 + VP9 alpha
node scripts/capture-blob-animation.mjs --blob luma --duration 4 --video

# all four, separately (blob-captures/luma-idle, nova-idle, ...)
node scripts/capture-blob-animation.mjs --blob all --duration 4 --video

# a mood with a beat 1 s in, on the hero stage, tinted
node scripts/capture-blob-animation.mjs --blob echo --state happy --beat message-sent --beat-at 1 --stage 1 --color green --video
```

Options: `--blob luma|nova|orbit|echo|all`, `--state`, `--size 360`,
`--scale 2` (device pixel ratio), `--fps 30`, `--duration 4`,
`--bg transparent|midnight|daylight|green|#rrggbb`, `--living 0|1`,
`--stage 0|1`, `--color`, `--beat`, `--beat-at`, `--warmup 0.7` (seconds run
before frame 1 so the entrance pop has finished; `0` keeps the entrance),
`--url http://127.0.0.1:5199`, `--out DIR`, `--video`.
`CHROME_PATH` and `FFMPEG_PATH` override the executables.

Output (default `blob-captures/<blob>-<state>/`, git-ignored):

- `frame_00001.png …` — 8-bit RGBA PNG, `size × 1.35 × scale` px square
  (972 px for the defaults).
- `<out>.mov` — ProRes 4444 with alpha (for After Effects, Premiere, Final Cut,
  DaVinci Resolve).
- `<out>.webm` — VP9 with alpha (for browsers and web editors).

### What was verified

| Capability | Result |
|---|---|
| Transparent PNG sequence | RGBA, corner pixels alpha 0 |
| ProRes 4444 `.mov` | `prores`, `yuva444p12le` (ffprobe), alpha kept |
| VP9 `.webm` | `alpha_mode=1`; decoded frame: corner alpha 0, body alpha 255 |
| All four companions separately | `--blob all`, 60 frames each |
| Same frames every run (no stage) | 4 runs, 30/30 frames pixel-identical, including a beat |
| Same frames every run (stage on) | 0–3 differing pixels per frame (GPU anti-aliasing) |
| Stage + tint + beat + mood together | Rendered (Echo, happy, green, message-sent) |
| Chroma-key `--bg green` | *not verified* |
| Windows / Linux Chrome paths | *not verified* (paths are in the script) |

## 6. Recommended workflow for the video

1. `pnpm dev`, open the lab, pick the companion, mood, beat and whether you
   want the stage. Note the matching URL parameters.
2. Export each shot with `node scripts/capture-blob-animation.mjs … --video`,
   one companion per file. Prefer the stage (`--stage 1`) for hero shots and
   the plain avatar for small or layered shots.
3. Import `.mov` (ProRes 4444) into the editor as a layer with alpha, or the
   PNG sequence at the same fps. Do scaling, motion paths, timing and
   compositing in the editor, not by changing the companions.
4. Need longer loops? Raise `--duration`. Need a different moment? Change
   `--beat-at` or `--warmup`; the same arguments always give the same frames.
5. If a tool cannot read alpha, use `--bg green` and key it (not verified).

## 7. Limitations

- The lab is a dev page: it needs `pnpm dev` (Vite on 5199). It is not in the
  production build, and `blob-lab.html` is not reachable from the desktop app.
- Stage events are window-wide. In **All four** with Stage on, one hearts cue
  reaches all four stages (one test: 136 heart elements). They clean
  themselves up after ~4.5 s, but for capture use one companion per run (the
  script does this).
- Stage captures differ by a few anti-aliased pixels between runs; non-stage
  captures are identical.
- The stage's spontaneous moods (wink, yawn, nap) come from its own timers, so
  which one appears depends on the clock position, not a parameter. Pick the
  moment with `--warmup` / `--duration`.
- Only bot colour names are accepted for `color`; arbitrary hex tints are not.
- Reduced motion (OS setting) stills the companions in the interactive lab;
  headless capture does not set it.
- The capture runs headless Chrome; memory use grows with `--size × --scale`.
  2048 px at scale 2 was not tested.

## 8. Browser stability notes

Checked while building the lab (the browser had been killed during an earlier
session):

- `AsterBlobAvatar`'s living loop and `JellyCompanionStage`'s frame loop both
  stop on unmount (cancelled `requestAnimationFrame` / motion cleanup). The
  lab's Restart remounts them without leaving old loops running.
- No canvas or WebGL contexts; no large assets (SVG only).
- The lab's clock adds one `requestAnimationFrame` loop for the whole page.
- Each living avatar and each stage runs its own frame loop, so **All four** +
  Living + Stage = eight loops. Fine on a laptop, but close other heavy tabs
  for long previews.
- `JellyCompanionStage` keeps every hearts timer id it has created until it
  unmounts (`heartTimers`), one per cue. Small; left as is.
- While `pnpm dev` runs, Vite pushes `styles.css` hot updates to every open
  dev page when files in the repo change (seen in bursts while the test suite
  ran). Lab use and captures did not trigger any.
