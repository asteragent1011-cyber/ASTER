// The ASTER logo: a lavender blob with a friendly face on a deep navy tile,
// and a white sparkle top right. One geometry for every surface: the app and
// web icons (scripts/render-aster-logo.ts renders them from asterLogoSvg), the
// in-app mark (src/components/aster/AsterMark.tsx) and the Android adaptive
// icon. Coordinates are in the 1024 icon box; the tile sits in Apple's
// 100..924 grid so the macOS icon carries the platform's own margin.

export const LOGO_TILE = { x: 100, y: 100, size: 824, radius: 184 } as const;

export const LOGO_COLORS = {
  tileTop: "#1d2150",
  tileBottom: "#0f1130",
  blobLight: "#d3d4ff",
  blobMid: "#aaa6fb",
  blobDeep: "#8b78ee",
  face: "#1c1b3f",
  sparkle: "#ffffff",
} as const;

/** The blob: a soft dome with a broad, gently rounded base. */
export const LOGO_BLOB =
  "M232,640C232,450 330,365 512,365C694,365 792,450 792,640C792,790 730,848 512,848C294,848 232,790 232,640Z";

/** The four-point sparkle (32-unit box) and where it sits. */
export const LOGO_SPARKLE =
  "M16,1.5C17.1,9.1 22.9,14.9 30.5,16C22.9,17.1 17.1,22.9 16,30.5C14.9,22.9 9.1,17.1 1.5,16C9.1,14.9 14.9,9.1 16,1.5Z";
export const LOGO_SPARKLE_AT = { x: 706, y: 186, scale: 4 } as const;

/** The face: two eyes and a small smile. */
export const LOGO_EYES = [{ x: 444, y: 640 }, { x: 580, y: 640 }] as const;
export const LOGO_SMILE = "M480,688Q512,716 544,688";

export type LogoVariant =
  /** The app icon: the rounded tile inside the platform margin, transparent around it. */
  | "icon"
  /** Tiny sizes (16 and 32 px): bolder eyes, no smile, so the face still reads. */
  | "small"
  /** iOS: full-bleed and opaque; the system applies its own mask. */
  | "full-bleed";

/** The logo as a standalone SVG document. */
export function asterLogoSvg(variant: LogoVariant = "icon"): string {
  const c = LOGO_COLORS;
  const small = variant === "small";
  const eyeR = small ? 38 : 22;
  const eyes = LOGO_EYES.map((e) => `<circle cx="${e.x}" cy="${small ? e.y - 6 : e.y}" r="${eyeR}" fill="${c.face}"/>`).join("");
  const smile = small ? "" : `<path d="${LOGO_SMILE}" fill="none" stroke="${c.face}" stroke-width="15" stroke-linecap="round"/>`;
  const s = LOGO_SPARKLE_AT;
  const sparkleScale = small ? s.scale * 1.25 : s.scale;
  const art = `<path d="${LOGO_BLOB}" fill="url(#aster-blob)"/>${eyes}${smile}`
    + `<path d="${LOGO_SPARKLE}" fill="${c.sparkle}" transform="translate(${small ? s.x - 16 : s.x} ${small ? s.y - 16 : s.y}) scale(${sparkleScale})"/>`;
  const t = LOGO_TILE;
  const tile = variant === "full-bleed"
    ? `<rect width="1024" height="1024" fill="url(#aster-tile)"/><g transform="translate(-124.3 -124.3) scale(1.2427)">${art}</g>`
    : `<rect x="${t.x}" y="${t.y}" width="${t.size}" height="${t.size}" rx="${t.radius}" fill="url(#aster-tile)"/>${art}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="ASTER">`
    + `<defs>`
    + `<linearGradient id="aster-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.tileTop}"/><stop offset="1" stop-color="${c.tileBottom}"/></linearGradient>`
    + `<radialGradient id="aster-blob" cx="0.36" cy="0.3" r="0.85"><stop offset="0" stop-color="${c.blobLight}"/><stop offset="0.5" stop-color="${c.blobMid}"/><stop offset="1" stop-color="${c.blobDeep}"/></radialGradient>`
    + `</defs>${tile}</svg>`;
}
