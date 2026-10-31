// Renders every ASTER icon from shared/aster-logo.ts, so the desktop, web and
// iOS icons are one artwork. macOS only (headless Chrome, sips, iconutil) plus
// Python's Pillow for the Windows .ico. Run when the logo changes:
//   node --experimental-strip-types scripts/render-aster-logo.ts
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  asterLogoSvg,
  LOGO_BLOB,
  LOGO_TILE,
  LOGO_COLORS,
  LOGO_EYES,
  LOGO_SMILE,
  LOGO_SPARKLE,
  LOGO_SPARKLE_AT,
  type LogoVariant,
} from "../shared/aster-logo.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = (...parts: string[]) => path.join(root, ...parts);
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const work = mkdtempSync(path.join(tmpdir(), "aster-logo-"));

/** The variant drawn at 1024 px, via a page holding only the SVG. */
function render(variant: LogoVariant): string {
  const svg = path.join(work, `${variant}.svg`);
  const html = path.join(work, `${variant}.html`);
  const png = path.join(work, `${variant}.png`);
  writeFileSync(svg, asterLogoSvg(variant));
  writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:transparent}</style><img src="${variant}.svg" width="1024" height="1024">`);
  execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--default-background-color=00000000", "--window-size=1024,1024", `--screenshot=${png}`, `file://${html}`,
  ], { stdio: "ignore" });
  return png;
}

function resized(source: string, size: number, out: string) {
  execFileSync("sips", ["-z", String(size), String(size), source, "--out", out], { stdio: "ignore" });
}

try {
  const icon = render("icon");
  const small = render("small");
  const bleed = render("full-bleed");

  // vector sources: the packaged Linux icon, the favicon and the landing page
  for (const out of ["build/icon.svg", "public/app-icon.svg", "apps/landing/app-icon.svg"]) {
    writeFileSync(at(out), `${asterLogoSvg("icon")}\n`);
  }
  writeFileSync(at("ios/AppStore/app-icon-ios.svg"), `${asterLogoSvg("full-bleed")}\n`);

  // macOS: the iconset and the .icns; the Dock, tray and startup screen read app-icon.png
  copyFileSync(icon, at("build/icon-1024.png"));
  copyFileSync(icon, at("electron/resources/app-icon.png"));
  const iconset = at("build/icon.iconset");
  mkdirSync(iconset, { recursive: true });
  for (const size of [16, 32, 64, 128, 256, 512]) {
    resized(size <= 32 ? small : icon, size, path.join(iconset, `icon_${size}x${size}.png`));
    resized(size * 2 <= 32 ? small : icon, size * 2, path.join(iconset, `icon_${size}x${size}@2x.png`));
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", at("build/icon.icns")]);

  // Windows: one .ico with every size, the tiny ones from the bolder face
  execFileSync("python3", ["-c", `
import sys
from PIL import Image
icon, small, out = sys.argv[1:4]
big = Image.open(icon).convert("RGBA")
tiny = Image.open(small).convert("RGBA")
sizes = [16, 24, 32, 48, 64, 128, 256]
frames = [(tiny if s <= 32 else big).resize((s, s), Image.LANCZOS) for s in sizes]
frames[-1].save(out, format="ICO", sizes=[(s, s) for s in sizes], append_images=frames[:-1])
`, icon, small, at("build/icon.ico")]);

  // iOS in-app mark (AsterMark in ios/App/Aster.swift): the tile cropped tight, kept as vector data
  const logoSet = at("ios/App/Assets.xcassets/AsterLogo.imageset");
  mkdirSync(logoSet, { recursive: true });
  writeFileSync(path.join(logoSet, "aster-logo.svg"), `${asterLogoSvg("icon").replace('viewBox="0 0 1024 1024"', 'viewBox="100 100 824 824"')}\n`);
  writeFileSync(path.join(logoSet, "Contents.json"), `${JSON.stringify({
    images: [{ filename: "aster-logo.svg", idiom: "universal" }],
    info: { author: "xcode", version: 1 },
    properties: { "preserves-vector-representation": true },
  }, null, 2)}\n`);

  // Google Play: the 512 store icon (full-bleed; Play applies its own mask),
  // its source, and the 1024x500 feature graphic with the logo and the name
  writeFileSync(at("android/PlayStore/assets/app-icon-source.svg"), `${asterLogoSvg("full-bleed")}\n`);
  resized(bleed, 512, at("android/PlayStore/assets/play-icon-512.png"));
  writeFileSync(at("android/PlayStore/assets/play-icon.html"),
    `<html><body style="margin:0">${asterLogoSvg("full-bleed").replace('viewBox="0 0 1024 1024"', 'viewBox="0 0 1024 1024" width="512" height="512"')}</body></html>\n`);
  const featureHtml = at("android/PlayStore/assets/feature-graphic.html");
  writeFileSync(featureHtml, `<!doctype html><html><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1024px; height:500px; overflow:hidden; font-family:-apple-system,"SF Pro Display",Inter,system-ui,sans-serif;
         background:#0B0D2A; color:#F4F3FF; }
  .wrap { position:relative; width:1024px; height:500px; display:flex; align-items:center; gap:56px; padding:0 72px; }
  .glow { position:absolute; width:620px; height:620px; right:-160px; top:-160px; border-radius:50%;
          background:radial-gradient(circle, rgba(169,155,255,0.30) 0%, rgba(169,155,255,0) 68%); }
  .mark { position:relative; flex:0 0 auto; width:250px; height:250px; filter:drop-shadow(0 30px 60px rgba(0,0,0,0.5)); }
  .mark svg { width:250px; height:250px; }
  .copy { position:relative; }
  h1 { font-size:76px; font-weight:700; letter-spacing:-0.02em; line-height:1; }
  p { margin-top:22px; font-size:29px; line-height:1.35; color:#B9B6E0; max-width:520px; }
  .rule { margin-top:30px; width:88px; height:5px; border-radius:99px; background:linear-gradient(90deg,#A99BFF,#8B9BFF); }
</style></head><body>
<div class="wrap"><div class="glow"></div>
  <div class="mark">${asterLogoSvg("icon").replace('viewBox="0 0 1024 1024"', 'viewBox="100 100 824 824"')}</div>
  <div class="copy">
    <h1>ASTER</h1>
    <p>Your own AI bots, running on your own computer — answered from your phone.</p>
    <div class="rule"></div>
  </div>
</div></body></html>
`);
  execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--window-size=1024,500", `--screenshot=${at("android/PlayStore/assets/feature-graphic-1024x500.png")}`, `file://${featureHtml}`,
  ], { stdio: "ignore" });

  // iOS: full-bleed and opaque (App Store icons may not carry alpha)
  execFileSync("python3", ["-c", `
import sys
from PIL import Image
Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2])
`, bleed, at("ios/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png")]);

  // Android: adaptive layers (the launcher masks them), the art scaled into the
  // 66dp safe zone of the 108dp canvas; the tile colour is launcher_background
  const c = LOGO_COLORS;
  const s = LOGO_SPARKLE_AT;
  const group = `android:translateX="2.8" android:translateY="2.8" android:scaleX="0.1" android:scaleY="0.1"`;
  const sparkle = `<group android:translateX="${s.x}" android:translateY="${s.y}" android:scaleX="${s.scale}" android:scaleY="${s.scale}">
            <path android:fillColor="${c.sparkle}" android:pathData="${LOGO_SPARKLE}" />
        </group>`;
  const circle = (x: number, y: number, r: number) => `M${x - r},${y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0`;
  const header = (what: string) => `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/render-aster-logo.ts from shared/aster-logo.ts: the
     ASTER logo's ${what}, inside the 66dp safe zone of the 108dp adaptive canvas. -->`;
  writeFileSync(at("android/app/src/main/res/drawable/ic_launcher_foreground.xml"), `${header("blob, face and sparkle")}
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group ${group}>
        <path android:pathData="${LOGO_BLOB}">
            <aapt:attr name="android:fillColor">
                <gradient android:type="radial" android:centerX="434" android:centerY="510" android:gradientRadius="520">
                    <item android:offset="0" android:color="${c.blobLight}" />
                    <item android:offset="0.5" android:color="${c.blobMid}" />
                    <item android:offset="1" android:color="${c.blobDeep}" />
                </gradient>
            </aapt:attr>
        </path>
${LOGO_EYES.map((e) => `        <path android:fillColor="${c.face}" android:pathData="${circle(e.x, e.y, 22)}" />`).join("\n")}
        <path android:strokeColor="${c.face}" android:strokeWidth="15" android:strokeLineCap="round" android:pathData="${LOGO_SMILE}" />
        ${sparkle}
    </group>
</vector>
`);
  writeFileSync(at("android/app/src/main/res/drawable/ic_launcher_monochrome.xml"), `${header("silhouette for themed icons, the eyes cut out")}
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group ${group}>
        <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd"
            android:pathData="${LOGO_BLOB}${LOGO_EYES.map((e) => circle(e.x, e.y, 26)).join("")}" />
        ${sparkle.replace(c.sparkle, "#FFFFFFFF")}
    </group>
</vector>
`);

  // Android in-app: the full-colour logo (AsterMark in AsterLook.kt) and the
  // white silhouette the system tints (notification small icon, search hits)
  const t = LOGO_TILE;
  const tileD = `M${t.x + t.radius},${t.y}h${t.size - t.radius * 2}a${t.radius},${t.radius} 0 0,1 ${t.radius},${t.radius}v${t.size - t.radius * 2}a${t.radius},${t.radius} 0 0,1 ${-t.radius},${t.radius}h${-(t.size - t.radius * 2)}a${t.radius},${t.radius} 0 0,1 ${-t.radius},${-t.radius}v${-(t.size - t.radius * 2)}a${t.radius},${t.radius} 0 0,1 ${t.radius},${-t.radius}z`;
  writeFileSync(at("android/app/src/main/res/drawable/ic_aster_logo.xml"), `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/render-aster-logo.ts from shared/aster-logo.ts: the
     ASTER logo in full colour, the app's own mark (AsterMark in AsterLook.kt). -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="${t.size}"
    android:viewportHeight="${t.size}">
    <group android:translateX="${-t.x}" android:translateY="${-t.y}">
        <path android:pathData="${tileD}">
            <aapt:attr name="android:fillColor">
                <gradient android:type="linear" android:startX="0" android:startY="${t.y}" android:endX="0" android:endY="${t.y + t.size}">
                    <item android:offset="0" android:color="${c.tileTop}" />
                    <item android:offset="1" android:color="${c.tileBottom}" />
                </gradient>
            </aapt:attr>
        </path>
        <path android:pathData="${LOGO_BLOB}">
            <aapt:attr name="android:fillColor">
                <gradient android:type="radial" android:centerX="434" android:centerY="510" android:gradientRadius="520">
                    <item android:offset="0" android:color="${c.blobLight}" />
                    <item android:offset="0.5" android:color="${c.blobMid}" />
                    <item android:offset="1" android:color="${c.blobDeep}" />
                </gradient>
            </aapt:attr>
        </path>
${LOGO_EYES.map((e) => `        <path android:fillColor="${c.face}" android:pathData="${circle(e.x, e.y, 22)}" />`).join("\n")}
        <path android:strokeColor="${c.face}" android:strokeWidth="15" android:strokeLineCap="round" android:pathData="${LOGO_SMILE}" />
        ${sparkle}
    </group>
</vector>
`);
  // the silhouette: blob and sparkle, cropped square around them
  const box = { x: 200, y: 170, size: 680 };
  writeFileSync(at("android/app/src/main/res/drawable/ic_aster_mark.xml"), `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/render-aster-logo.ts from shared/aster-logo.ts: the
     ASTER logo's blob (eyes cut out) and sparkle as one white silhouette. White
     on transparent, the notification small-icon contract (the system tints
     it), and tintable anywhere else it is used. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:tint="?attr/colorControlNormal"
    android:autoMirrored="false"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="${box.size}"
    android:viewportHeight="${box.size}">
    <group android:translateX="${-box.x}" android:translateY="${-box.y}">
        <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd"
            android:pathData="${LOGO_BLOB}${LOGO_EYES.map((e) => circle(e.x, e.y, 30)).join("")}" />
        ${sparkle.replace(c.sparkle, "#FFFFFFFF")}
    </group>
</vector>
`);

  console.log("rendered the ASTER icons");
} finally {
  rmSync(work, { recursive: true, force: true });
}
