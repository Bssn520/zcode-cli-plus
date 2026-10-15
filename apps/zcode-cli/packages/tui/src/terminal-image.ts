export type ImageProtocol = "kitty" | "iterm" | "none";

export type ImageDimensions = {
  height: number;
  width: number;
};

export function detectImageProtocol(
  env: NodeJS.ProcessEnv = process.env,
): ImageProtocol {
  const override = env.ZCP_IMAGE_PROTOCOL?.trim().toLowerCase();
  if (override === "kitty" || override === "iterm" || override === "none") {
    return override;
  }

  if (env.KITTY_WINDOW_ID || env.TERM === "xterm-kitty" || env.TERM_PROGRAM === "ghostty") {
    return "kitty";
  }
  if (env.TERM_PROGRAM === "iTerm.app" || env.TERM_PROGRAM === "WezTerm") {
    return "iterm";
  }
  return "none";
}

/** Parse PNG/JPEG/GIF/WebP dimensions from file header bytes. */
export function parseImageDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (bytes.length >= 24 && isPng(bytes)) {
    return {
      width: readUInt32BE(bytes, 16),
      height: readUInt32BE(bytes, 20),
    };
  }
  if (bytes.length >= 10 && isGif(bytes)) {
    return {
      width: bytes[6]! | (bytes[7]! << 8),
      height: bytes[8]! | (bytes[9]! << 8),
    };
  }
  if (bytes.length >= 30 && isWebp(bytes)) {
    return parseWebpDimensions(bytes);
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return parseJpegDimensions(bytes);
  }
  return undefined;
}

export function formatImageAttachmentFallback(input: {
  height?: number;
  label: string;
  protocol?: ImageProtocol;
  sizeBytes?: number;
  width?: number;
}): string {
  const sizeLabel =
    input.sizeBytes !== undefined && Number.isFinite(input.sizeBytes)
      ? `${Math.max(1, Math.round(input.sizeBytes / 1024))}KB`
      : undefined;
  const dimensionLabel =
    input.width && input.height ? `${input.width}x${input.height}` : undefined;
  const parts = [`🖼 ${input.label}`, dimensionLabel, sizeLabel].filter(Boolean);
  if (input.protocol && input.protocol !== "none") {
    parts.push(`(${input.protocol})`);
  }
  return parts.join("  ");
}

/** Kitty graphics protocol: transmit PNG/JPEG payload as base64. */
export function encodeKittyImage(input: {
  base64: string;
  height?: number;
  mediaType?: string;
  width?: number;
}): string {
  const format = kittyFormat(input.mediaType);
  const chunks: string[] = [];
  const payload = input.base64;
  const chunkSize = 4096;
  for (let offset = 0; offset < payload.length; offset += chunkSize) {
    const slice = payload.slice(offset, offset + chunkSize);
    const more = offset + chunkSize < payload.length ? 1 : 0;
    if (offset === 0) {
      const sizeParts = [
        `a=T`,
        `f=${format}`,
        input.width ? `s=${input.width}` : undefined,
        input.height ? `v=${input.height}` : undefined,
        `m=${more}`,
      ].filter(Boolean);
      chunks.push(`\x1b_G${sizeParts.join(",")};${slice}\x1b\\`);
    } else {
      chunks.push(`\x1b_Gm=${more};${slice}\x1b\\`);
    }
  }
  return chunks.join("");
}

/** iTerm2 / WezTerm inline image via OSC 1337. */
export function encodeITermImage(input: {
  base64: string;
  height?: number;
  name?: string;
  width?: number;
}): string {
  const args = [
    "inline=1",
    input.name ? `name=${Buffer.from(input.name, "utf8").toString("base64")}` : undefined,
    input.width ? `width=${input.width}px` : undefined,
    input.height ? `height=${input.height}px` : undefined,
    "preserveAspectRatio=1",
  ].filter(Boolean);
  return `\x1b]1337;File=${args.join(":")}:${input.base64}\x07`;
}

function kittyFormat(mediaType: string | undefined): number {
  switch (mediaType) {
    case "image/png":
      return 100;
    case "image/jpeg":
      return 80;
    case "image/gif":
      return 100;
    case "image/webp":
      return 100;
    default:
      return 100;
  }
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isGif(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x39 || bytes[4] === 0x37) &&
    bytes[5] === 0x61
  );
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function parseWebpDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  const kind = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (kind === "VP8X" && bytes.length >= 30) {
    const width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
    const height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
    return { width, height };
  }
  if (kind === "VP8 " && bytes.length >= 30) {
    // lossy bitstream starts at byte 23 after chunk header
    const width = (bytes[26]! | (bytes[27]! << 8)) & 0x3fff;
    const height = (bytes[28]! | (bytes[29]! << 8)) & 0x3fff;
    return { width, height };
  }
  if (kind === "VP8L" && bytes.length >= 25) {
    const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return undefined;
}

function parseJpegDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1]!;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) return undefined;
    const size = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (size < 2) return undefined;
    // SOF0 / SOF2
    if (marker === 0xc0 || marker === 0xc2) {
      if (offset + 7 >= bytes.length) return undefined;
      return {
        height: (bytes[offset + 3]! << 8) | bytes[offset + 4]!,
        width: (bytes[offset + 5]! << 8) | bytes[offset + 6]!,
      };
    }
    offset += size;
  }
  return undefined;
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}
