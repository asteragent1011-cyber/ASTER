import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";

import { useStore, type Bot } from "@/state/store";
import { useBotEditor } from "./bot-settings/BotEditorContext";
import { imageAttachmentFromFile } from "@/lib/composer-attachments";
import { cn } from "@/lib/cn";
import { MAUS_COLOR_NAMES, type MausColor, type MausMotion, type MausState } from "@/lib/mascot";
import {
  AVATAR_FOCUS_CENTER,
  AVATAR_ZOOM_MAX,
  AVATAR_ZOOM_MIN,
  botAvatarUrlFromStoredPath,
  clampAvatarFocus,
  clampAvatarZoom,
} from "../../shared/bot-avatar";
import { BotAvatar, MausAvatar } from "./Avatar";
import {
  ASTER_BLOB_IDS,
  botBodyFor,
  choosingCompanion,
  COMPANION_COLORS,
  COMPANION_TRAITS,
  companionName,
  companionPalette,
  wearsOriginalColor,
  type AsterBlobId,
} from "@/lib/aster-blobs";
import { AvatarImageGenerator } from "./AvatarImageGenerator";
import { useOrganizationBranding } from "@/lib/use-organization-branding";

type AvatarPatch = Partial<
  Pick<Bot, "avatarCrop" | "avatarUrl" | "avatarZoom" | "avatarFocusX" | "avatarFocusY" | "color" | "mascotBody">
>;

const FRAME_SIZE = 168;

function AvatarFraming({
  bot,
  disabled,
  onPatch,
}: {
  bot: Bot;
  disabled: boolean;
  onPatch: (patch: AvatarPatch) => void;
}) {
  const zoom = clampAvatarZoom(bot.avatarZoom ?? AVATAR_ZOOM_MIN);
  const focusX = clampAvatarFocus(bot.avatarFocusX ?? AVATAR_FOCUS_CENTER);
  const focusY = clampAvatarFocus(bot.avatarFocusY ?? AVATAR_FOCUS_CENTER);
  const framed = zoom !== AVATAR_ZOOM_MIN || focusX !== AVATAR_FOCUS_CENTER || focusY !== AVATAR_FOCUS_CENTER;
  const drag = useRef<{ x: number; y: number; focusX: number; focusY: number; pointer: number } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, focusX, focusY, pointer: event.pointerId };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointer) return;
    onPatch({
      avatarFocusX: clampAvatarFocus(start.focusX - (event.clientX - start.x) / FRAME_SIZE / zoom),
      avatarFocusY: clampAvatarFocus(start.focusY - (event.clientY - start.y) / FRAME_SIZE / zoom),
    });
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer === event.pointerId) drag.current = null;
  };
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (disabled || event.deltaY === 0) return;
    event.preventDefault();
    onPatch({ avatarZoom: clampAvatarZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08)) });
  };

  return (
    <div className="py-3">
      <div
        className="mx-auto w-fit cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      >
        <BotAvatar bot={bot} size={FRAME_SIZE} animated={false} label={`${bot.name} avatar preview`} />
      </div>
      <div className="mb-1.5 mt-4 flex items-baseline justify-between">
        <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-secondary">Zoom</span>
        <span className="tabular-nums text-[12px] text-ink-secondary">{Math.round(zoom * 100)}%</span>
      </div>
      <input
        type="range"
        min={AVATAR_ZOOM_MIN}
        max={AVATAR_ZOOM_MAX}
        step={0.01}
        value={zoom}
        disabled={disabled}
        aria-label="Zoom avatar"
        aria-valuemin={AVATAR_ZOOM_MIN}
        aria-valuemax={AVATAR_ZOOM_MAX}
        aria-valuenow={zoom}
        aria-valuetext={`${Math.round(zoom * 100)}%`}
        onChange={(event) => onPatch({ avatarZoom: clampAvatarZoom(Number(event.target.value)) })}
        className="w-full accent-accent"
      />
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[11.5px] text-ink-secondary">
        <span>Drag the picture to reposition it. Scroll to zoom.</span>
        {framed && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPatch({ avatarZoom: AVATAR_ZOOM_MIN, avatarFocusX: AVATAR_FOCUS_CENTER, avatarFocusY: AVATAR_FOCUS_CENTER })}
            className="shrink-0 rounded-md px-2 py-1 text-ink hover:bg-control disabled:opacity-50"
          >
            Reset framing
          </button>
        )}
      </div>
    </div>
  );
}

/** Arrow keys move a radio group's choice, as a native radio group would. */
function radioKeys<T>(choices: readonly T[], current: number, choose: (choice: T) => void) {
  return (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (Math.max(current, 0) + step + choices.length) % choices.length;
    choose(choices[next]!);
    event.currentTarget.querySelectorAll<HTMLElement>("[role=radio]")[next]?.focus();
  };
}

const SECTION_LABEL = "mb-2 mt-4 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-secondary";

/** The four companions as characters to pick, each drawn live as it would look. */
function CompanionPicker({
  bot,
  showsPicture,
  disabled,
  onPatch,
}: {
  bot: Bot;
  showsPicture: boolean;
  disabled: boolean;
  onPatch: (patch: AvatarPatch) => void;
}) {
  // While the bot shows its picture no companion is chosen; picking one switches back.
  const current = showsPicture ? null : botBodyFor(bot);
  const choose = (body: AsterBlobId) => onPatch(choosingCompanion(bot, body));
  return (
    <>
      <div id={`companion-${bot.id}`} className={SECTION_LABEL}>Companion</div>
      <div
        role="radiogroup"
        aria-labelledby={`companion-${bot.id}`}
        className="grid grid-cols-4 gap-2"
        onKeyDown={disabled ? undefined : radioKeys(ASTER_BLOB_IDS, current ? ASTER_BLOB_IDS.indexOf(current) : -1, choose)}
      >
        {ASTER_BLOB_IDS.map((body, index) => {
          const selected = body === current;
          return (
            <button
              key={body}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (!current && index === 0) ? 0 : -1}
              disabled={disabled}
              onClick={() => choose(body)}
              title={COMPANION_TRAITS[body]}
              data-companion-option={body}
              className={cn(
                "group flex flex-col items-center gap-1 rounded-xl border px-1 pb-2 pt-1.5 transition-colors disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border",
                selected ? "border-accent-border bg-accent/10" : "border-hairline/40 bg-inset hover:bg-control",
              )}
            >
              <MausAvatar
                bodyId={body}
                identity={`${bot.id}-${body}`}
                color={choosingCompanion(bot, body).color ?? bot.color}
                selected={selected}
                size={56}
              />
              <span className={cn("text-[12.5px] font-medium", selected ? "text-ink" : "text-ink-secondary group-hover:text-ink")}>
                {companionName(body)}
              </span>
            </button>
          );
        })}
      </div>
      {current && <div className="mt-1.5 text-center text-[11.5px] text-ink-secondary">{COMPANION_TRAITS[current]}</div>}
    </>
  );
}

const colorLabel = (color: MausColor) => color[0]!.toUpperCase() + color.slice(1);

/**
 * The companion's colour: Original draws its own brand colours, every other
 * swatch tints it (companionPalette). Each swatch is painted with the tinted
 * body itself, so what is picked is what the companion becomes.
 */
function ColorPicker({ bot, disabled, onPatch }: { bot: Bot; disabled: boolean; onPatch: (patch: AvatarPatch) => void }) {
  const body = botBodyFor(bot);
  const original = COMPANION_COLORS[body];
  const choices: MausColor[] = [original, ...MAUS_COLOR_NAMES.filter((color) => color !== original)];
  const current = wearsOriginalColor(bot) ? original : bot.color;
  const choose = (color: MausColor) => onPatch({ color });
  return (
    <>
      <div id={`companion-color-${bot.id}`} className={SECTION_LABEL}>Color</div>
      <div
        role="radiogroup"
        aria-labelledby={`companion-color-${bot.id}`}
        className="flex flex-wrap gap-2.5"
        onKeyDown={disabled ? undefined : radioKeys(choices, choices.indexOf(current), choose)}
      >
        {choices.map((color) => {
          const selected = color === current;
          const swatch = companionPalette(body, color);
          const name = color === original ? "Original" : colorLabel(color);
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              onClick={() => choose(color)}
              title={name}
              aria-label={`${name} color`}
              data-swatch={color}
              className={cn(
                "relative size-9 rounded-full transition-transform hover:scale-110 disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                selected && "ring-2 ring-ink ring-offset-2 ring-offset-card",
              )}
              style={{ background: `radial-gradient(circle at 34% 28%, ${swatch.light}, ${swatch.mid} 48%, ${swatch.deep})` }}
            >
              {color === original && (
                <Sparkles size={13} aria-hidden className="absolute inset-0 m-auto text-white/90 drop-shadow" />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function BotProfileAvatarCard({
  bot,
  activeState,
  mascotMotion,
  onPatch,
}: {
  bot: Bot;
  activeState: MausState;
  mascotMotion: { kind: Exclude<MausMotion, "none">; nonce: number } | null;
  onPatch: (patch: AvatarPatch) => void;
}) {
  const { flushBotPatches } = useStore();
  const { request: api, uploadAvatar } = useBotEditor();
  const organization = useOrganizationBranding();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The companion, unless the bot shows its own picture. Any crop but
  // "mascot" with an image means the picture (older profiles saved a shape).
  const showsPicture = Boolean(bot.avatarUrl) && (bot.avatarCrop ?? "mascot") !== "mascot";
  const showsPictureRef = useRef(showsPicture);
  showsPictureRef.current = showsPicture;
  const busy = uploading || generating || savingConnection;

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    setUploading(true);
    setError(null);
    try {
      const saved = uploadAvatar ? null : await imageAttachmentFromFile(file);
      const avatarUrl = uploadAvatar ? await uploadAvatar(file) : saved ? botAvatarUrlFromStoredPath(saved.path) : null;
      if (!avatarUrl) throw new Error("The uploaded image could not be used as an avatar");
      onPatch({
        avatarUrl,
        avatarCrop: "circle",
        avatarZoom: AVATAR_ZOOM_MIN,
        avatarFocusX: AVATAR_FOCUS_CENTER,
        avatarFocusY: AVATAR_FOCUS_CENTER,
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeImage = () => {
    setError(null);
    onPatch({
      avatarUrl: null,
      avatarCrop: "mascot",
      avatarZoom: AVATAR_ZOOM_MIN,
      avatarFocusX: AVATAR_FOCUS_CENTER,
      avatarFocusY: AVATAR_FOCUS_CENTER,
    });
  };

  const generate = async (direction: string) => {
    if (busy) return;
    setGenerating(true);
    setError(null);
    try {
      // Generation reads the bot's identity and crop server-side. Commit any
      // debounced profile edits first, then feed the generated avatar back
      // through the same serialized mutation lane as upload/remove.
      const pictureAtStart = showsPictureRef.current;
      await flushBotPatches(bot.id);
      const result: { avatarUrl: string; bot: Bot } = await api(`/api/bots/${bot.id}/avatar/generate`, {
        method: "POST",
        body: JSON.stringify({ prompt: direction.trim() }),
      });
      onPatch({
        avatarUrl: result.avatarUrl,
        // The server owns this crop for generate (server/index.ts picks
        // "circle" for a mascot bot). If the reader switched between the
        // picture and the companion while it ran, their choice stands.
        avatarCrop:
          showsPictureRef.current === pictureAtStart
            ? (result.bot.avatarCrop ?? "circle")
            : showsPictureRef.current ? "circle" : "mascot",
      });
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : String(generateError));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-hairline/40 bg-card">
      <div className="flex items-center justify-between border-b border-hairline/40 px-3 py-2.5">
        <span className="rounded-lg bg-control px-3 py-1.5 text-[14px] font-medium text-ink">Avatar</span>
        {bot.avatarUrl && !showsPicture && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onPatch({ avatarCrop: "circle" })}
            className="rounded-md px-2 py-1.5 text-[13px] text-ink-secondary hover:bg-control hover:text-ink disabled:opacity-50"
          >
            Use picture
          </button>
        )}
      </div>

      <div className="p-3">
        {Boolean(organization?.icons.length) && <div className="mb-3 border-b border-hairline/40 pb-3">
          <div className="mb-2 text-[13px] font-medium text-ink-secondary">{organization!.name} icons</div>
          <div className="flex flex-wrap gap-2">{organization!.icons.map(icon => <button key={icon.id} type="button" disabled={busy} title={icon.name} aria-label={`Use ${icon.name} icon`} className="flex size-12 items-center justify-center rounded-lg border border-hairline/40 hover:bg-control disabled:opacity-50" onClick={() => {
            // Use the normal attachment path, so chosen icons survive removal
            // from Admin and travel with the user's own workspace backups.
            const bytes = Uint8Array.from(atob(icon.image.slice(22)), byte => byte.charCodeAt(0));
            void upload(new File([bytes], `${icon.id}.png`, { type: "image/png" }));
          }}><img src={icon.image} alt="" className="size-10 rounded-md object-contain" /></button>)}</div>
        </div>}
        {showsPicture ? (
          <AvatarFraming bot={bot} disabled={busy} onPatch={onPatch} />
        ) : (
          <div data-avatar-preview className="flex justify-center py-3">
            <BotAvatar
              bot={bot}
              state={activeState}
              size={112}
              motion={mascotMotion?.kind ?? "none"}
              motionKey={mascotMotion?.nonce ?? 0}
            />
          </div>
        )}

        <CompanionPicker bot={bot} showsPicture={showsPicture} disabled={busy} onPatch={onPatch} />
        {!showsPicture && <ColorPicker bot={bot} disabled={busy} onPatch={onPatch} />}

        <div className="mt-4 flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            onChange={(event) => void upload(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-control px-3 py-2 text-[13px] text-ink hover:bg-raised-hover disabled:opacity-50"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            Upload image
          </button>
          {bot.avatarUrl && (
            <button
              type="button"
              onClick={removeImage}
              disabled={busy}
              aria-label="Remove custom avatar image"
              title="Remove custom image"
              className="flex size-10 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-danger disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <div className="mt-1.5 text-[11.5px] text-ink-secondary">PNG, JPEG, GIF, or WebP · up to 10 MB</div>

        <AvatarImageGenerator
          botLabel={bot.title || bot.name}
          disabled={uploading}
          generating={generating}
          onGenerate={generate}
          onSavingChange={setSavingConnection}
        />

        {error && <div role="alert" className="mt-3 text-[12px] text-danger">{error}</div>}
      </div>
    </div>
  );
}
