import {
  encodeITermImage,
  encodeKittyDeleteAll,
  encodeKittyImage,
  type ImageProtocol,
} from "./terminal-image.js";

export const IMAGE_THUMB_COLUMNS = 12;
export const IMAGE_THUMB_ROWS = 6;

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
  const parts = ["\x1b7"];
  for (const slot of state.slots) {
    parts.push(csiMoveCursor(slot.row, slot.col));
    parts.push(
      state.protocol === "kitty"
        ? encodeKittyImage({
            base64: slot.base64,
            columns,
            mediaType: slot.mediaType,
            rows,
          })
        : encodeITermImage({
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
): string | undefined {
  if (protocol !== "kitty") return undefined;
  return wrapTmuxPassthrough(encodeKittyDeleteAll(), env);
}

export function dataUrlBase64(dataUrl: string): string | undefined {
  const match = /^data:image\/(?:png|jpeg|gif|webp);base64,(.+)$/i.exec(dataUrl);
  return match?.[1];
}
