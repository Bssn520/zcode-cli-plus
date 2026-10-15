import type { BoxRenderable } from "@mbears/opentui-core";
import { CliRenderEvents } from "@mbears/opentui-core";
import { useRenderer } from "@mbears/opentui-react";
import React from "react";
import { imageAttachmentLabel } from "./app-image-files.js";
import type { DraftAttachment, DraftImageAttachment } from "./app-model.js";
import { palette } from "./app-model.js";
import { OPEN_IMAGE_SHORTCUT_HINT } from "./app-image-path-paste.js";
import {
  detectImageProtocol,
  formatImageAttachmentFallback,
  parseImageDimensions,
  type ImageProtocol,
} from "./terminal-image.js";
import {
  IMAGE_THUMB_COLUMNS,
  IMAGE_THUMB_ROWS,
  OVERLAY_REDRAW_DEBOUNCE_MS,
  buildKittyOverlayUpdateSequence,
  buildOverlayClearSequence,
  buildOverlayDrawSequence,
  createKittyTransmitState,
  dataUrlBase64,
  overlaySignature,
  shouldRedrawOverlay,
  type KittyTransmitState,
  type OverlayDrawState,
  type OverlaySlot,
} from "./terminal-image-overlay.js";

const h = React.createElement as (
  type: React.ElementType | string,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) => React.ReactElement;

export function ImageAttachmentBar({
  attachments,
}: {
  attachments: readonly DraftAttachment[];
}): React.ReactElement | null {
  const images = attachments.filter(
    (attachment): attachment is DraftImageAttachment => attachment.type === "image",
  );
  const protocol = detectImageProtocol();
  const renderer = useRenderer();
  const slotRefs = React.useRef(new Map<number, BoxRenderable>());
  const lastSignatureRef = React.useRef<string | null>(null);
  const lastSlotsRef = React.useRef<readonly OverlaySlot[] | null>(null);
  const kittyTransmitRef = React.useRef<KittyTransmitState>(createKittyTransmitState());
  const protocolRef = React.useRef(protocol);
  const imagesRef = React.useRef(images);
  protocolRef.current = protocol;
  imagesRef.current = images;

  React.useEffect(() => {
    if (protocol === "none") return;

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingState: OverlayDrawState | undefined;

    const writeStdout = (sequence: string | undefined): void => {
      if (!sequence) return;
      process.stdout.write(sequence);
    };

    const clearOverlay = (): void => {
      const active = protocolRef.current;
      if (active !== "none") {
        writeStdout(buildOverlayClearSequence(active, process.env, kittyTransmitRef.current));
      }
      lastSignatureRef.current = null;
      lastSlotsRef.current = null;
    };

    const flushOverlay = (state: OverlayDrawState): void => {
      if (state.protocol === "kitty") {
        writeStdout(
          buildKittyOverlayUpdateSequence(
            lastSlotsRef.current,
            state.slots,
            kittyTransmitRef.current,
          ),
        );
      } else {
        writeStdout(buildOverlayDrawSequence(state));
      }
      lastSlotsRef.current = state.slots;
      lastSignatureRef.current = overlaySignature(state);
    };

    const onFrame = (): void => {
      const activeProtocol = protocolRef.current;
      if (activeProtocol === "none") return;

      const slots: OverlaySlot[] = [];
      for (const image of imagesRef.current) {
        const node = slotRefs.current.get(image.id);
        const base64 = dataUrlBase64(image.dataUrl);
        if (!node || !base64) continue;
        // screenX/Y are 0-based; CSI H is 1-based.
        slots.push({
          base64,
          col: node.screenX + 1,
          id: image.id,
          mediaType: image.mediaType,
          name: imageAttachmentLabel(image),
          row: node.screenY + 1,
        });
      }

      if (slots.length === 0) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = undefined;
        }
        pendingState = undefined;
        if (lastSignatureRef.current !== null) {
          writeStdout(
            buildOverlayClearSequence(activeProtocol, process.env, kittyTransmitRef.current),
          );
          lastSignatureRef.current = null;
          lastSlotsRef.current = null;
        }
        return;
      }

      const state: OverlayDrawState = { protocol: activeProtocol, slots };
      const signature = overlaySignature(state);
      if (!shouldRedrawOverlay(lastSignatureRef.current, signature)) return;

      // First paint is immediate; later position/content updates are debounced.
      if (lastSignatureRef.current === null) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = undefined;
        }
        pendingState = undefined;
        flushOverlay(state);
        return;
      }

      pendingState = state;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        const next = pendingState;
        pendingState = undefined;
        if (!next) return;
        if (!shouldRedrawOverlay(lastSignatureRef.current, overlaySignature(next))) return;
        flushOverlay(next);
      }, OVERLAY_REDRAW_DEBOUNCE_MS);
    };

    // FRAME fires after renderNative; postProcess runs too early for graphics.
    renderer.on(CliRenderEvents.FRAME, onFrame);
    return () => {
      renderer.off(CliRenderEvents.FRAME, onFrame);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (lastSignatureRef.current !== null || pendingState) clearOverlay();
    };
  }, [protocol, renderer]);

  if (images.length === 0) return null;

  if (protocol === "none") {
    const lines = images.map((attachment) => formatDraftImageLine(attachment, protocol));
    return h(
      "box",
      {
        style: {
          flexDirection: "column",
          flexShrink: 0,
          marginBottom: 0,
          width: "100%",
        },
      },
      ...lines.map((line, index) =>
        h("text", { key: `image-attach-${index}`, style: { fg: palette.muted } }, line),
      ),
      h(
        "text",
        { key: "image-attach-hint", style: { fg: palette.muted } },
        OPEN_IMAGE_SHORTCUT_HINT,
      ),
    );
  }

  return h(
    "box",
    {
      style: {
        flexDirection: "column",
        flexShrink: 0,
        gap: 0,
        marginBottom: 0,
        width: "100%",
      },
    },
    h(
      "box",
      {
        style: {
          flexDirection: "row",
          flexShrink: 0,
          gap: 1,
        },
      },
      ...images.map((image) =>
        h("box", {
          key: `image-thumb-${image.id}`,
          ref: (node: BoxRenderable | null) => {
            if (node) slotRefs.current.set(image.id, node);
            else slotRefs.current.delete(image.id);
          },
          style: {
            flexShrink: 0,
            height: IMAGE_THUMB_ROWS,
            width: IMAGE_THUMB_COLUMNS,
          },
        }),
      ),
    ),
    ...images.map((image) =>
      h(
        "text",
        { key: `image-label-${image.id}`, style: { fg: palette.muted } },
        formatDraftImageLine(image, protocol),
      ),
    ),
    h(
      "text",
      { key: "image-attach-hint", style: { fg: palette.muted } },
      OPEN_IMAGE_SHORTCUT_HINT,
    ),
  );
}

export function formatDraftImageLine(
  attachment: DraftImageAttachment,
  protocol: ImageProtocol = detectImageProtocol(),
): string {
  const label = imageAttachmentLabel(attachment);
  const bytes = dataUrlToBytes(attachment.dataUrl);
  const dimensions = bytes ? parseImageDimensions(bytes) : undefined;
  return formatImageAttachmentFallback({
    height: dimensions?.height,
    label,
    protocol,
    sizeBytes: attachment.sizeBytes ?? bytes?.byteLength,
    width: dimensions?.width,
  });
}

function dataUrlToBytes(dataUrl: string): Uint8Array | undefined {
  const match = /^data:image\/(?:png|jpeg|gif|webp);base64,(.+)$/i.exec(dataUrl);
  if (!match?.[1]) return undefined;
  return Uint8Array.from(Buffer.from(match[1], "base64"));
}
