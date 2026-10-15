import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { DraftAttachment, DraftImageAttachment } from "./app-model.js";
import {
  findAtImagePathRefs,
  isImagePath,
  MAX_IMAGE_FILE_BYTES,
  mediaTypeFromImagePath,
  normalizeImagePathToken,
} from "./image-path.js";
import type { TuiImageMediaType } from "./types.js";

export type ReadImageFileResult =
  | { attachment: Omit<DraftImageAttachment, "id" | "placeholder">; ok: true }
  | { ok: false; reason: "too_large" | "unreadable" | "not_image" };

export async function readImageFileAsDataUrl(
  path: string,
  options: { maxBytes?: number } = {},
): Promise<ReadImageFileResult> {
  const mediaType = mediaTypeFromImagePath(path);
  if (!mediaType) return { ok: false, reason: "not_image" };
  const maxBytes = options.maxBytes ?? MAX_IMAGE_FILE_BYTES;
  try {
    const buffer = await readFile(path);
    if (buffer.byteLength > maxBytes) return { ok: false, reason: "too_large" };
    if (buffer.byteLength === 0) return { ok: false, reason: "unreadable" };
    return {
      ok: true,
      attachment: {
        dataUrl: `data:${mediaType};base64,${buffer.toString("base64")}`,
        mediaType,
        sizeBytes: buffer.byteLength,
        sourcePath: path,
        type: "image",
      },
    };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

export function createImageDraftAttachment(input: {
  dataUrl: string;
  id: number;
  mediaType: TuiImageMediaType;
  placeholder?: string;
  sizeBytes?: number;
  sourcePath?: string;
}): DraftImageAttachment {
  return {
    dataUrl: input.dataUrl,
    id: input.id,
    mediaType: input.mediaType,
    placeholder: input.placeholder ?? `[image #${input.id}]`,
    sizeBytes: input.sizeBytes,
    sourcePath: input.sourcePath,
    type: "image",
  };
}

/**
 * At submit time: turn `@path` / file draft attachments that point at real image
 * files into image attachments with dataUrl content.
 */
export async function resolveImageAttachmentsForSubmit(input: {
  allocateId: () => number;
  attachments: DraftAttachment[];
  cwd?: string;
  existsSync?: (path: string) => boolean;
  homeDir?: string;
  maxBytes?: number;
  text: string;
}): Promise<{
  attachments: DraftAttachment[];
  errors: string[];
}> {
  const exists = input.existsSync ?? existsSync;
  const errors: string[] = [];
  const next: DraftAttachment[] = [];
  const coveredPlaceholders = new Set<string>();

  for (const attachment of input.attachments) {
    if (attachment.type === "image") {
      next.push(attachment);
      coveredPlaceholders.add(attachment.placeholder);
      continue;
    }

    const normalized = normalizeImagePathToken(attachment.path, {
      cwd: input.cwd,
      homeDir: input.homeDir,
    });
    if (!isImagePath(normalized) || !exists(normalized)) {
      next.push(attachment);
      coveredPlaceholders.add(attachment.placeholder);
      continue;
    }

    const read = await readImageFileAsDataUrl(normalized, { maxBytes: input.maxBytes });
    if (!read.ok) {
      errors.push(formatReadError(attachment.path, read.reason));
      next.push(attachment);
      coveredPlaceholders.add(attachment.placeholder);
      continue;
    }
    next.push(
      createImageDraftAttachment({
        ...read.attachment,
        id: attachment.id,
        placeholder: attachment.placeholder,
      }),
    );
    coveredPlaceholders.add(attachment.placeholder);
  }

  for (const ref of findAtImagePathRefs(input.text)) {
    const placeholder = `@${ref.raw}`;
    if (coveredPlaceholders.has(placeholder)) continue;
    if (next.some((attachment) => attachment.placeholder === placeholder)) continue;

    const normalized = normalizeImagePathToken(ref.path, {
      cwd: input.cwd,
      homeDir: input.homeDir,
    });
    if (!exists(normalized)) continue;

    const read = await readImageFileAsDataUrl(normalized, { maxBytes: input.maxBytes });
    if (!read.ok) {
      errors.push(formatReadError(ref.path, read.reason));
      continue;
    }
    const id = input.allocateId();
    next.push(
      createImageDraftAttachment({
        ...read.attachment,
        id,
        placeholder,
      }),
    );
    coveredPlaceholders.add(placeholder);
  }

  return { attachments: next, errors };
}

export async function openLastImageAttachment(
  attachments: readonly DraftAttachment[],
  options: {
    openCommand?: (filePath: string) => void;
    platform?: NodeJS.Platform;
    tempDirectory?: string;
  } = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  const images = attachments.filter(
    (attachment): attachment is DraftImageAttachment => attachment.type === "image",
  );
  const last = images[images.length - 1];
  if (!last) return { ok: false, message: "No image attachment to open." };

  try {
    const parsed = parseDataUrl(last.dataUrl);
    if (!parsed) return { ok: false, message: "Image attachment data is invalid." };
    const directory = await mkdtemp(join(options.tempDirectory ?? tmpdir(), "zcp-image-"));
    const extension = extensionForMediaType(last.mediaType);
    const fileName = basename(last.sourcePath ?? `image-${last.id}${extension}`);
    const filePath = join(directory, fileName.includes(".") ? fileName : `${fileName}${extension}`);
    await writeFile(filePath, parsed.buffer);

    const open = options.openCommand ?? defaultOpenCommand(options.platform ?? process.platform);
    open(filePath);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function imageAttachmentLabel(attachment: DraftImageAttachment): string {
  if (attachment.sourcePath) return basename(attachment.sourcePath);
  return attachment.placeholder;
}

function formatReadError(path: string, reason: "too_large" | "unreadable" | "not_image"): string {
  if (reason === "too_large") return `Image too large (>20MB): ${path}`;
  if (reason === "not_image") return `Not an image file: ${path}`;
  return `Could not read image: ${path}`;
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mediaType: string } | undefined {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/i.exec(dataUrl);
  if (!match?.[1] || !match[2]) return undefined;
  return {
    buffer: Buffer.from(match[2], "base64"),
    mediaType: match[1].toLowerCase(),
  };
}

function extensionForMediaType(mediaType: TuiImageMediaType): string {
  switch (mediaType) {
    case "image/jpeg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    default:
      return ".png";
  }
}

function defaultOpenCommand(platform: NodeJS.Platform): (filePath: string) => void {
  return (filePath: string) => {
    const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
    const args = platform === "win32" ? ["/c", "start", "", filePath] : [filePath];
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => undefined);
    child.unref();
  };
}
