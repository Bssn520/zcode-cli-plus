import { RGBA, type TextChunk } from "@mbears/opentui-core";
import type { ShikiHighlightSegment } from "./app-shiki-highlighter.js";

const SHIKI_FONT_STYLE_ITALIC = 1;
const SHIKI_FONT_STYLE_BOLD = 2;
const SHIKI_FONT_STYLE_UNDERLINE = 4;
const SHIKI_FONT_STYLE_STRIKETHROUGH = 8;
const OPENTUI_BOLD_ATTRIBUTE = 1;
const OPENTUI_ITALIC_ATTRIBUTE = 4;
const OPENTUI_UNDERLINE_ATTRIBUTE = 8;
const OPENTUI_STRIKETHROUGH_ATTRIBUTE = 128;

const rgbaCache = new Map<string, RGBA>();

export function textChunksFromShikiSegments(
  segments: ShikiHighlightSegment[] | undefined,
  fallbackText: string,
  fallbackColor: string,
  background?: string,
): TextChunk[] {
  if (!segments?.length) return [styledTextChunk(fallbackText, fallbackColor, background)];
  return segments.map((segment) =>
    styledTextChunk(
      segment.text,
      segment.color ?? fallbackColor,
      background,
      opentuiAttributesFromShiki(segment.fontStyle),
    ),
  );
}

export function textChunksFromShikiLines(
  lines: ShikiHighlightSegment[][],
  fallbackColor: string,
  background?: string,
): TextChunk[] {
  const chunks: TextChunk[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? [];
    if (line.length === 0) {
      chunks.push(styledTextChunk("", fallbackColor, background));
    } else {
      chunks.push(...textChunksFromShikiSegments(line, "", fallbackColor, background));
    }
    if (index < lines.length - 1) {
      chunks.push(styledTextChunk("\n", fallbackColor, background));
    }
  }
  return chunks;
}

export function opentuiAttributesFromShiki(fontStyle: number | undefined): number {
  if (!fontStyle) return 0;
  let attributes = 0;
  if ((fontStyle & SHIKI_FONT_STYLE_BOLD) !== 0) attributes |= OPENTUI_BOLD_ATTRIBUTE;
  if ((fontStyle & SHIKI_FONT_STYLE_ITALIC) !== 0) attributes |= OPENTUI_ITALIC_ATTRIBUTE;
  if ((fontStyle & SHIKI_FONT_STYLE_UNDERLINE) !== 0) attributes |= OPENTUI_UNDERLINE_ATTRIBUTE;
  if ((fontStyle & SHIKI_FONT_STYLE_STRIKETHROUGH) !== 0) {
    attributes |= OPENTUI_STRIKETHROUGH_ATTRIBUTE;
  }
  return attributes;
}

export function styledTextChunk(
  text: string,
  fg: string,
  bg?: string,
  attributes = 0,
): TextChunk {
  return {
    __isChunk: true,
    attributes,
    bg: bg ? rgbaColor(bg) : undefined,
    fg: rgbaColor(fg),
    text,
  };
}

function rgbaColor(color: string): RGBA {
  const cached = rgbaCache.get(color);
  if (cached) return cached;
  const parsed = RGBA.fromHex(color);
  rgbaCache.set(color, parsed);
  return parsed;
}
