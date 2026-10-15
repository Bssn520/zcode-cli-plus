import React from "react";
import { imageAttachmentLabel } from "./app-image-files.js";
import type { DraftAttachment, DraftImageAttachment } from "./app-model.js";
import { palette } from "./app-model.js";
import { OPEN_IMAGE_SHORTCUT_HINT } from "./app-image-path-paste.js";
import {
  detectImageProtocol,
  formatImageAttachmentFallback,
  parseImageDimensions,
} from "./terminal-image.js";

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
  if (images.length === 0) return null;

  const protocol = detectImageProtocol();
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

export function formatDraftImageLine(
  attachment: DraftImageAttachment,
  protocol = detectImageProtocol(),
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
