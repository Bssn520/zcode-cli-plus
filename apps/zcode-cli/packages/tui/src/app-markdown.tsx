import {
  CodeRenderable,
  infoStringToFiletype,
  type MarkdownOptions,
  type MarkdownTableOptions,
  type SyntaxStyle,
  type TextChunk,
} from "@mbears/opentui-core";
import { baseComponents } from "@mbears/opentui-react";
import React from "react";
import { createMarkdownSyntaxStyle } from "./app-markdown-theme.js";
import { highlightShikiCodeLines } from "./app-shiki-highlighter.js";
import { textChunksFromShikiLines } from "./app-shiki-text-chunks.js";
import { activeTuiTheme, type TuiThemeMode, type TuiThemeTokens } from "./theme/index.js";

type MarkdownRenderMode = "markdown" | "code" | "plain";

type MarkdownTextProps = {
  backgroundColor?: string;
  content: string;
  foregroundColor?: string;
  mode?: MarkdownRenderMode;
  streaming?: boolean;
  tableOptions?: MarkdownTableOptions;
};

const h = React.createElement as (
  type: React.ElementType | string,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) => React.ReactElement;

// 原因：markdown 的 renderNode/syntaxStyle setter 用引用相等；每次 render 新建会 clearBlockStates，导致闪烁和 onChunks 高亮被取消。
const syntaxStyleByMode = new Map<TuiThemeMode, SyntaxStyle>();
const shikiRenderNodeByKey = new Map<string, NonNullable<MarkdownOptions["renderNode"]>>();

export function detectMarkdownRenderMode(
  components: Record<string, unknown> = baseComponents,
): MarkdownRenderMode {
  if (typeof components.markdown === "function") return "markdown";
  if (typeof components.code === "function") return "code";
  return "plain";
}

export function MarkdownText({
  content,
  foregroundColor,
  mode = detectMarkdownRenderMode(),
  streaming = false,
  tableOptions,
}: MarkdownTextProps): React.ReactElement {
  const theme = activeTuiTheme();
  const textColor = foregroundColor ?? theme.markdownText;
  if (!content) {
    return h("text", { style: { fg: textColor } }, "");
  }

  const syntaxStyle = cachedMarkdownSyntaxStyle(theme);
  if (mode === "markdown") {
    if (syntaxStyle) {
      return h("markdown", {
        conceal: true,
        content,
        renderNode: cachedShikiCodeFenceRenderNode(theme.mode, textColor),
        streaming,
        syntaxStyle,
        tableOptions,
      });
    }
    return h("text", { style: { fg: textColor } }, content);
  }

  if (mode === "code" && syntaxStyle) {
    return h("code", {
      conceal: true,
      content,
      drawUnstyledText: false,
      fg: textColor,
      filetype: "markdown",
      streaming,
      syntaxStyle,
    });
  }

  return h("text", { style: { fg: textColor } }, content);
}

export function cachedShikiCodeFenceRenderNode(
  mode: TuiThemeMode,
  fallbackColor: string,
): NonNullable<MarkdownOptions["renderNode"]> {
  const key = `${mode}\0${fallbackColor}`;
  const cached = shikiRenderNodeByKey.get(key);
  if (cached) return cached;
  const created = createShikiCodeFenceRenderNode(mode, fallbackColor);
  shikiRenderNodeByKey.set(key, created);
  return created;
}

export function createShikiCodeFenceRenderNode(
  mode: TuiThemeMode,
  fallbackColor: string,
): NonNullable<MarkdownOptions["renderNode"]> {
  return (token, context) => {
    if (token.type !== "code") return null;
    const lang = "lang" in token && typeof token.lang === "string" ? token.lang : undefined;
    if (!lang) return null;

    const onChunks = createShikiOnChunks(mode, lang, fallbackColor);
    const base = context.defaultRender();
    if (!(base instanceof CodeRenderable)) return base;

    // onChunks 只在 startHighlight 路径调用，且必须有 filetype；放入构造选项，避免 setter 赶不上首帧。
    const filetype = base.filetype || infoStringToFiletype(lang) || lang;
    const next = new CodeRenderable(base.ctx, {
      id: base.id,
      content: base.content,
      filetype,
      syntaxStyle: context.syntaxStyle,
      fg: base.fg,
      bg: base.bg,
      conceal: context.concealCode,
      drawUnstyledText: true,
      streaming: false,
      treeSitterClient: context.treeSitterClient ?? base.treeSitterClient,
      width: "100%",
      marginTop: base.marginTop ?? undefined,
      marginBottom: base.marginBottom ?? undefined,
      onChunks,
    });
    base.destroy();
    return next;
  };
}

export function createShikiOnChunks(
  mode: TuiThemeMode,
  infoString: string,
  fallbackColor: string,
): (
  chunks: TextChunk[],
  chunkContext: { content: string },
) => Promise<TextChunk[] | undefined> {
  return async (chunks, chunkContext) => {
    try {
      const highlighted = await highlightShikiCodeLines({
        infoString,
        lines: chunkContext.content.split(/\r?\n/u),
        mode,
      });
      if (!highlighted) return chunks;
      return textChunksFromShikiLines(highlighted, fallbackColor);
    } catch {
      // shiki 失败时保留 tree-sitter / 素色 chunks，避免预览空白。
      return chunks;
    }
  };
}

function cachedMarkdownSyntaxStyle(theme: TuiThemeTokens): SyntaxStyle | undefined {
  const cached = syntaxStyleByMode.get(theme.mode);
  if (cached) return cached;
  const created = createMarkdownSyntaxStyle(theme);
  if (created) syntaxStyleByMode.set(theme.mode, created);
  return created;
}
