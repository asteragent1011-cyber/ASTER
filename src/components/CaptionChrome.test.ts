import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DesktopCapabilitiesProvider, useCaptionChrome } from "./DesktopCapabilities";

/** The chrome the real provider derives for a desktop host on [platform] (none: the browser). */
function chromeFor(platform?: string) {
  vi.stubGlobal("window", platform ? { ogb: { platform } } : {});
  let result: ReturnType<typeof useCaptionChrome> | undefined;
  try {
    renderToStaticMarkup(createElement(DesktopCapabilitiesProvider, null, createElement(() => {
      result = useCaptionChrome();
      return null;
    })));
  } finally {
    vi.unstubAllGlobals();
  }
  return result!;
}

describe("frameless window drag regions", () => {
  it("macOS (hidden title bar) drags from headers, rails and toolbars, controls opted out", () => {
    const mac = chromeFor("darwin");
    expect(mac.headerDragClass).toBe("window-drag-header");
    expect(mac.dragClass).toBe("window-drag");
    expect(mac.dragStyle).toEqual({ WebkitAppRegion: "drag" });
    expect(mac.noDragStyle).toEqual({ WebkitAppRegion: "no-drag" });
    // the header's control row stays clickable, but only Windows shifts it under caption buttons
    expect(mac.controlsShiftStyle).toEqual({ WebkitAppRegion: "no-drag" });
    expect(mac.padClass).toBeUndefined();
  });

  it("Windows keeps its caption-button shift and padding", () => {
    const win = chromeFor("win32");
    expect(win.headerDragClass).toBe("window-drag-header");
    expect(win.controlsShiftStyle).toMatchObject({ WebkitAppRegion: "no-drag", marginTop: "16px" });
    expect(win.padClass).toBe("pt-[28px]");
  });

  it("a native title bar (Linux, the browser) has no app regions at all", () => {
    const native = chromeFor();
    expect(native.headerDragClass).toBeUndefined();
    expect(native.dragClass).toBeUndefined();
    expect(native.dragStyle).toBeUndefined();
    expect(native.controlsShiftStyle).toBeUndefined();
  });

  it("the drag classes keep every control and popup inside clickable, and headers drag only from md up", () => {
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.window-drag \{ -webkit-app-region: drag; \}/);
    const optOut = /\.window-drag :is\(([^)]*)\) \{\s*-webkit-app-region: no-drag;/.exec(css)?.[1] ?? "";
    for (const control of ["button", "a", "input", "textarea", "select", '[role="menu"]', '[role="dialog"]', "[tabindex]"]) {
      expect(optOut).toContain(control);
    }
    // below md the drawer button overlays the header earlier in the DOM; a draggable header would swallow it
    expect(css).toMatch(/@media \(min-width: 48rem\) \{\s*\.window-drag-header \{ -webkit-app-region: drag; \}/);
  });
});
