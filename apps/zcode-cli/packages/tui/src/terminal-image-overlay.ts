import {
  encodeITermImage,
  encodeKittyDeleteAll,
  encodeKittyDeleteImage,
  encodeKittyDeletePlacement,
  encodeKittyPlace,
  encodeKittyTransmit,
  type ImageProtocol,
} from "./terminal-image.js";

export const IMAGE_THUMB_COLUMNS = 12;
export const IMAGE_THUMB_ROWS = 6;
/** Debounce position/content redraws so layout jitter does not flash thumbnails. */
export const OVERLAY_REDRAW_DEBOUNCE_MS = 64;

export type OverlaySlot = {
  base64: string;
  col: number;
  id: number;
  mediaType?: string;
  name?: string;
  row: number;
};

export type OverlayDrawState = {
  protocol: Exclude<ImageProtocol, "none">;
  slots: readonly OverlaySlot[];
};

export type KittyTransmitState = {
  transmittedIds: Set<number>;
};

/** 1-based CSI cursor position. */
export function csiMoveCursor(row: number, col: number): string {
  return `\x1b[${row};${col}H`;
}

/** tmux allow-passthrough: wrap sequence and double internal ESC. */
export function wrapTmuxPassthrough(
  sequence: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!env.TMUX) return sequence;
  return `\x1bPtmux;${sequence.replaceAll("\x1b", "\x1b\x1b")}\x1b\\`;
}

export function overlaySignature(state: OverlayDrawState): string {
  return `${state.protocol}:${state.slots
    .map((slot) => `${slot.id}@${slot.row},${slot.col}:${slot.base64.length}:${slot.mediaType ?? ""}`)
    .join("|")}`;
}

export function shouldRedrawOverlay(
  previousSignature: string | null,
  nextSignature: string,
): boolean {
  return previousSignature !== nextSignature;
}

export function createKittyTransmitState(): KittyTransmitState {
  return { transmittedIds: new Set() };
}

/**
 * Kitty: transmit each image once (`a=t`), then only place/move (`a=p`).
 * Position changes delete the old placement (`d=i`) before placing again.
 */
export function buildKittyOverlayUpdateSequence(
  previousSlots: readonly OverlaySlot[] | null,
  nextSlots: readonly OverlaySlot[],
  transmitState: KittyTransmitState,
  options: {
    columns?: number;
    env?: NodeJS.ProcessEnv;
    rows?: number;
  } = {},
): string {
  const columns = options.columns ?? IMAGE_THUMB_COLUMNS;
  const rows = options.rows ?? IMAGE_THUMB_ROWS;
  const previousById = new Map((previousSlots ?? []).map((slot) => [slot.id, slot]));
  const nextIds = new Set(nextSlots.map((slot) => slot.id));
  const parts = ["\x1b7"];

  for (const previous of previousSlots ?? []) {
    if (nextIds.has(previous.id)) continue;
    if (!transmitState.transmittedIds.has(previous.id)) continue;
    parts.push(encodeKittyDeleteImage(previous.id));
    transmitState.transmittedIds.delete(previous.id);
  }

  for (const slot of nextSlots) {
    const previous = previousById.get(slot.id);
    const contentChanged =
      previous !== undefined &&
      (previous.base64 !== slot.base64 || previous.mediaType !== slot.mediaType);
    const needsTransmit = !transmitState.transmittedIds.has(slot.id) || contentChanged;

    if (needsTransmit) {
      if (contentChanged && transmitState.transmittedIds.has(slot.id)) {
        parts.push(encodeKittyDeleteImage(slot.id));
        transmitState.transmittedIds.delete(slot.id);
      }
      parts.push(
        encodeKittyTransmit({
          base64: slot.base64,
          id: slot.id,
          mediaType: slot.mediaType,
        }),
      );
      transmitState.transmittedIds.add(slot.id);
      parts.push(csiMoveCursor(slot.row, slot.col));
      parts.push(
        encodeKittyPlace({
          columns,
          id: slot.id,
          rows,
        }),
      );
      continue;
    }

    const moved =
      previous === undefined || previous.row !== slot.row || previous.col !== slot.col;
    if (!moved) continue;

    parts.push(encodeKittyDeletePlacement({ id: slot.id }));
    parts.push(csiMoveCursor(slot.row, slot.col));
    parts.push(
      encodeKittyPlace({
        columns,
        id: slot.id,
        rows,
      }),
    );
  }

  parts.push("\x1b8");
  return wrapTmuxPassthrough(parts.join(""), options.env);
}

export function buildOverlayDrawSequence(
  state: OverlayDrawState,
  options: {
    columns?: number;
    env?: NodeJS.ProcessEnv;
    rows?: number;
  } = {},
): string {
  const columns = options.columns ?? IMAGE_THUMB_COLUMNS;
  const rows = options.rows ?? IMAGE_THUMB_ROWS;
  if (state.protocol === "kitty") {
    return buildKittyOverlayUpdateSequence(null, state.slots, createKittyTransmitState(), {
      columns,
      env: options.env,
      rows,
    });
  }

  const parts = ["\x1b7"];
  for (const slot of state.slots) {
    parts.push(csiMoveCursor(slot.row, slot.col));
    parts.push(
      encodeITermImage({
        base64: slot.base64,
        columns,
        name: slot.name,
        rows,
      }),
    );
  }
  parts.push("\x1b8");
  return wrapTmuxPassthrough(parts.join(""), options.env);
}

export function buildOverlayClearSequence(
  protocol: Exclude<ImageProtocol, "none">,
  env: NodeJS.ProcessEnv = process.env,
  transmitState?: KittyTransmitState,
): string | undefined {
  if (protocol !== "kitty") return undefined;
  transmitState?.transmittedIds.clear();
  return wrapTmuxPassthrough(encodeKittyDeleteAll(), env);
}

export function dataUrlBase64(dataUrl: string): string | undefined {
  const match = /^data:image\/(?:png|jpeg|gif|webp);base64,(.+)$/i.exec(dataUrl);
  return match?.[1];
}
