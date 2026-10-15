import { homedir } from "node:os";
import { extname, isAbsolute, resolve as resolvePath } from "node:path";
import type { TuiImageMediaType } from "./types.js";

export const IMAGE_PATH_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
export const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024;

const MEDIA_TYPE_BY_EXTENSION: Record<string, TuiImageMediaType> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function isImagePath(path: string): boolean {
  return IMAGE_PATH_EXTENSIONS.has(extname(path).toLowerCase());
}

export function mediaTypeFromImagePath(path: string): TuiImageMediaType | undefined {
  return MEDIA_TYPE_BY_EXTENSION[extname(path).toLowerCase()];
}

/** Normalize a single path token: strip file://, expand ~, resolve relative. */
export function normalizeImagePathToken(
  token: string,
  options: { cwd?: string; homeDir?: string } = {},
): string {
  let value = token.trim();
  if (value.startsWith("file://")) {
    try {
      value = decodeURIComponent(new URL(value).pathname);
    } catch {
      value = value.slice("file://".length);
    }
  }
  const home = options.homeDir ?? homedir();
  if (value === "~") value = home;
  else if (value.startsWith("~/") || value.startsWith("~\\")) {
    value = `${home}${value.slice(1)}`;
  }
  if (!isAbsolute(value)) {
    value = resolvePath(options.cwd ?? process.cwd(), value);
  }
  return value;
}

/**
 * If the whole paste text is one or more image-looking path tokens, return normalized paths.
 * Existence is checked via `existsSync`; returns null when the paste is ordinary text.
 */
export function tryParseImagePathPaste(
  text: string,
  options: {
    cwd?: string;
    existsSync: (path: string) => boolean;
    homeDir?: string;
  },
): string[] | null {
  const tokens = tokenizePathPaste(text);
  if (!tokens || tokens.length === 0) return null;

  const paths: string[] = [];
  for (const token of tokens) {
    const normalized = normalizeImagePathToken(token, options);
    if (!isImagePath(normalized)) return null;
    if (!options.existsSync(normalized)) return null;
    paths.push(normalized);
  }
  return paths;
}

/** Collect `@path` refs in draft text that look like image files (extension only). */
/** Collect `@path` refs in draft text that look like image files (extension only). */
export function findAtImagePathRefs(text: string): Array<{ path: string; raw: string }> {
  const refs: Array<{ path: string; raw: string }> = [];
  const pattern = /@("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+)/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[1];
    if (!raw) continue;
    const path = unquotePathToken(raw);
    if (!path || !isImagePath(path)) continue;
    // Keep `raw` as written so placeholder `@${raw}` still matches draft text.
    if (!refs.some((ref) => ref.raw === raw)) refs.push({ path, raw });
  }
  return refs;
}

export function tokenizePathPaste(text: string): string[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const tokens: string[] = [];
  let index = 0;
  while (index < trimmed.length) {
    while (index < trimmed.length && /\s/.test(trimmed[index]!)) index += 1;
    if (index >= trimmed.length) break;

    const quote = trimmed[index];
    if (quote === '"' || quote === "'") {
      index += 1;
      let value = "";
      while (index < trimmed.length) {
        const ch = trimmed[index]!;
        if (ch === "\\" && index + 1 < trimmed.length) {
          value += trimmed[index + 1]!;
          index += 2;
          continue;
        }
        if (ch === quote) {
          index += 1;
          break;
        }
        value += ch;
        index += 1;
      }
      if (!value) return null;
      tokens.push(value);
      continue;
    }

    let value = "";
    while (index < trimmed.length && !/\s/.test(trimmed[index]!)) {
      const ch = trimmed[index]!;
      if (ch === "\\" && index + 1 < trimmed.length) {
        value += trimmed[index + 1]!;
        index += 2;
        continue;
      }
      value += ch;
      index += 1;
    }
    if (!value) return null;
    tokens.push(value);
  }

  return tokens.length > 0 ? tokens : null;
}

function unquotePathToken(token: string): string {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token
      .slice(1, -1)
      .replace(/\\(.)/g, "$1");
  }
  return token.replace(/\\(.)/g, "$1");
}
