#!/usr/bin/env node
// Capture an ASTER companion from the Blob Animation Lab as a transparent PNG
// sequence, frame by frame on the lab's own clock (src/blob-lab/clock.ts), so
// every run of the same arguments gives the same frames. Optionally encodes
// ProRes 4444 (.mov) and VP9 (.webm), both with alpha, through ffmpeg.
//
// Needs: `pnpm dev` running (the lab is a dev page), Google Chrome or Chromium,
// and ffmpeg only for --video. No npm dependencies: it speaks the Chrome
// DevTools Protocol over Node's built-in WebSocket.
//
//   node scripts/capture-blob-animation.mjs --blob luma --duration 4 --video
//
// Options (defaults in brackets):
//   --blob luma|nova|orbit|echo|all   [luma]   all = four separate captures
//   --state idle|thinking|speaking|happy|sleepy|alert|selected   [idle]
//   --size N        companion size in CSS px [360]
//   --scale N       device pixel ratio, 2 for crisp 2x frames [2]
//   --fps N         [30]       --duration S   seconds [4]
//   --bg transparent|midnight|daylight|green|#rrggbb   [transparent]
//   --living 0|1    hero jelly body + orbiting moons [1]
//   --stage 0|1     hero stage: drift, lean, hop, wink [0]
//   --color NAME    tint (green, blue, red, ...) [the companion's own colors]
//   --beat blink|message-sent|message-received|worried   --beat-at S [0], from the first frame
//   --warmup S      run the clock this long before the first frame, so the
//                   companion has finished its entrance pop [0.7]; 0 keeps the entrance
//   --url URL       the dev server [http://127.0.0.1:5199]
//   --out DIR       [blob-captures/<blob>-<state>]
//   --video         also write <out>.mov (ProRes 4444) and <out>.webm (VP9), with alpha
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BLOBS = ["luma", "nova", "orbit", "echo"];

function parseArgs(argv) {
  const options = { blob: "luma", state: "idle", size: 360, scale: 2, fps: 30, duration: 4, bg: "transparent", living: "1", stage: "0", color: "", beat: "", "beat-at": "0", warmup: "0.7", url: "http://127.0.0.1:5199", out: "", video: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (key === "video") options.video = true;
    else if (key in options) options[key] = argv[++i];
    else throw new Error(`unknown option --${key}`);
  }
  return options;
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    : process.platform === "win32"
      ? [`${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`]
      : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error("Chrome not found: set CHROME_PATH to a Chrome or Chromium executable");
  return found;
}

/** A minimal CDP session over the browser's page WebSocket. */
async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolveOpen, reject) => { socket.onopen = resolveOpen; socket.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve: done, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else done(message.result);
    }
  };
  return {
    send: (method, params = {}) => new Promise((done, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: done, reject });
      socket.send(JSON.stringify({ id, method, params }));
    }),
    close: () => socket.close(),
  };
}

async function captureOne(chrome, port, options, blob) {
  const query = new URLSearchParams({
    capture: "1", blob, state: options.state, size: String(options.size), bg: options.bg,
    living: options.living, stage: options.stage, ...(options.color ? { color: options.color } : {}),
    // the lab counts from its own time 0, which includes the warm-up
    ...(options.beat ? { beat: options.beat, beatAt: String(Number(options["beat-at"]) + Number(options.warmup)) } : {}),
  });
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const page = await connect(target.webSocketDebuggerUrl);
  const transparent = options.bg === "transparent";
  try {
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    // Measure the frame first so the viewport is exactly one capture square
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1600, deviceScaleFactor: Number(options.scale), mobile: false });
    if (transparent) await page.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await page.send("Page.navigate", { url: `${options.url}/blob-lab.html?${query}` });
    let frameSize = 0;
    for (let tries = 0; tries < 200 && !frameSize; tries++) {
      await new Promise((r) => setTimeout(r, 100));
      const result = await page.send("Runtime.evaluate", { expression: "window.blobLab?.ready ? window.blobLab.frameSize : 0", returnByValue: true });
      frameSize = result.result.value;
    }
    if (!frameSize) throw new Error(`the lab did not load at ${options.url}/blob-lab.html (is \`pnpm dev\` running?)`);
    await page.send("Emulation.setDeviceMetricsOverride", { width: frameSize, height: frameSize, deviceScaleFactor: Number(options.scale), mobile: false });

    const out = resolve(options.out ? (options.blob === "all" ? join(options.out, blob) : options.out) : join("blob-captures", `${blob}-${options.state}`));
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const fps = Number(options.fps);
    const frames = Math.round(Number(options.duration) * fps);
    const step = 1000 / fps;
    // frame 0 is the companion as it first appears; each later frame is one step on
    await page.send("Runtime.evaluate", { expression: "window.blobLab.step(0)", awaitPromise: true });
    // pre-roll in frame-sized steps, so the frames after it fall on the same grid
    for (let t = 0; t < Number(options.warmup) * 1000 - 1e-6; t += step) {
      await page.send("Runtime.evaluate", { expression: `window.blobLab.step(${step})`, awaitPromise: true });
    }
    for (let frame = 0; frame < frames; frame++) {
      if (frame > 0) await page.send("Runtime.evaluate", { expression: `window.blobLab.step(${step})`, awaitPromise: true });
      const shot = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      writeFileSync(join(out, `frame_${String(frame + 1).padStart(5, "0")}.png`), Buffer.from(shot.data, "base64"));
    }
    console.log(`${blob}: ${frames} frames, ${frameSize * Number(options.scale)}px square → ${out}`);
    if (options.video) encode(out, fps, transparent);
    return out;
  } finally {
    page.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => undefined);
  }
}

function encode(dir, fps, alpha) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const input = ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(dir, "frame_%05d.png")];
  const runs = [
    [`${dir}.mov`, ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", alpha ? "yuva444p10le" : "yuv444p10le", "-vendor", "apl0"]],
    [`${dir}.webm`, ["-c:v", "libvpx-vp9", "-pix_fmt", alpha ? "yuva420p" : "yuv420p", "-b:v", "0", "-crf", "18", "-row-mt", "1"]],
  ];
  for (const [file, codec] of runs) {
    const result = spawnSync(ffmpeg, [...input, ...codec, file], { stdio: "inherit" });
    if (result.error || result.status !== 0) throw new Error(`ffmpeg failed for ${file} (is ffmpeg installed? set FFMPEG_PATH)`);
    console.log(`  → ${file}`);
  }
}

const options = parseArgs(process.argv.slice(2));
const blobs = options.blob === "all" ? BLOBS : [options.blob];
if (!blobs.every((blob) => BLOBS.includes(blob))) throw new Error(`--blob must be one of ${BLOBS.join(", ")} or all`);

const profile = mkdtempSync(join(tmpdir(), "aster-blob-capture-"));
const chrome = spawn(chromePath(), [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--hide-scrollbars", "--disable-gpu-vsync", "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore" });
try {
  let port = 0;
  for (let tries = 0; tries < 100 && !port; tries++) {
    await new Promise((r) => setTimeout(r, 100));
    try { port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]); } catch { /* not yet */ }
  }
  if (!port) throw new Error("Chrome did not start");
  for (const blob of blobs) await captureOne(chrome, port, options, blob);
} finally {
  chrome.kill();
  setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
}
