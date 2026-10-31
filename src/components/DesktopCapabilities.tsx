import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cacheDesktopCapabilities, initialDesktopCapabilities, loadDesktopCapabilities } from "@/lib/desktop";

type DesktopState = {
  capabilities: DesktopCapabilities;
  ready: boolean;
};

const DesktopContext = createContext<DesktopState>({
  capabilities: initialDesktopCapabilities(),
  ready: typeof window === "undefined" || !window.ogb,
});

export function DesktopCapabilitiesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DesktopState>(() => ({
    capabilities: initialDesktopCapabilities(),
    ready: typeof window === "undefined" || !window.ogb,
  }));

  useEffect(() => {
    let alive = true;
    let eventRevision = 0;
    const unsubscribe = window.ogb?.onCapabilitiesChanged?.((capabilities) => {
      eventRevision += 1;
      if (alive) setState({ capabilities: cacheDesktopCapabilities(capabilities), ready: true });
    });
    const initialRevision = eventRevision;
    void loadDesktopCapabilities().then((capabilities) => {
      if (alive && eventRevision === initialRevision) {
        setState({ capabilities, ready: true });
      }
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  return <DesktopContext.Provider value={state}>{children}</DesktopContext.Provider>;
}

export function useDesktopCapabilities(): DesktopState {
  return useContext(DesktopContext);
}

/**
 * Shared chrome styles for the frameless desktop windows: macOS (hidden title
 * bar, inset traffic lights) and the overlay-less Windows window. Either way
 * there is no native title bar, so headers are the window's drag regions. On
 * Windows the controls at a header's right end also drop 16px below the
 * 26px-tall renderer-drawn caption buttons that occupy the window's top-right
 * corner (WindowCaptionButtons.tsx).
 */
export function useCaptionChrome() {
  const { capabilities } = useDesktopCapabilities();
  const windowsCaption = capabilities.windowChrome === "win-caption";
  const draggable = windowsCaption || capabilities.windowChrome === "mac-inset";
  return {
    windowsCaption,
    // SAFETY: Electron's documented -webkit-app-region CSS property is not in
    // React's CSSProperties type, but the renderer accepts it as an inline style.
    dragStyle: draggable ? ({ WebkitAppRegion: "drag" } as CSSProperties) : undefined,
    // A conversation header: a drag region only from md up (styles.css,
    // .window-drag-header). Below md the drawer button and its backdrop
    // overlay the header but come earlier in the DOM, and Blink resolves
    // app regions in DOM order, so a draggable header would swallow them.
    headerDragClass: draggable ? "window-drag-header" : undefined,
    noDragStyle: draggable ? ({ WebkitAppRegion: "no-drag" } as CSSProperties) : undefined,
    // A whole area that drags the window while every control inside it stays
    // clickable (styles.css, .window-drag): for rails and toolbars with many
    // controls, where marking each one no-drag would be easy to miss.
    dragClass: draggable ? "window-drag" : undefined,
    // A header's right-end control row: never a drag handle. On Windows it
    // also drops 16px below the caption buttons. Margins, not a transform:
    // Blink resolves -webkit-app-region from untransformed layout boxes, so
    // translateY would leave the row's shifted top half inside the header's
    // drag region (dead clicks). The negative bottom margin cancels the
    // height growth, so the rest of the layout does not move.
    controlsShiftStyle: windowsCaption
      ? ({ WebkitAppRegion: "no-drag", marginTop: "16px", marginBottom: "-16px" } as CSSProperties)
      : draggable ? ({ WebkitAppRegion: "no-drag" } as CSSProperties) : undefined,
    // Docked right panels: their headers sit flush under the caption corner,
    // so the whole header (not just an icon row) drops 16px via padding.
    // tailwind-merge in cn() lets this override just the pt half of py-*.
    padClass: windowsCaption ? "pt-[28px]" : undefined,
  };
}
