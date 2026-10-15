import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openUrlInBrowser, type BrowserOpenOptions, type BrowserOpenResult } from "./app-open-url.js";

const MERMAID_FENCE_RE = /^```mermaid[ \t]*\r?\n([\s\S]*?)```/gim;
const MERMAID_SCRIPT_NAME = "mermaid.min.js";

export type MermaidBlock = {
  code: string;
  index: number;
};

export type MermaidPreviewOpenResult =
  | { kind: "opened"; htmlPath: string; open: BrowserOpenResult }
  | { kind: "none" }
  | { kind: "failed"; message: string };

export function extractMermaidBlocks(markdown: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  for (const match of markdown.matchAll(MERMAID_FENCE_RE)) {
    const code = match[1]?.replace(/\s+$/u, "") ?? "";
    blocks.push({ code, index: blocks.length });
  }
  return blocks;
}

export function resolveMermaidScriptPath(options?: {
  bundleDir?: string;
  requireResolve?: (specifier: string) => string;
}): string {
  const bundleDir = options?.bundleDir ?? dirname(fileURLToPath(import.meta.url));
  const vendored = join(bundleDir, "vendor", MERMAID_SCRIPT_NAME);
  try {
    readFileSync(vendored);
    return vendored;
  } catch {
    // 开发态或未打包时回退到依赖里的官方 dist。
  }

  const resolve =
    options?.requireResolve ??
    createRequire(import.meta.url).resolve.bind(createRequire(import.meta.url));
  return resolve(`mermaid/dist/${MERMAID_SCRIPT_NAME}`);
}

export function writeMermaidPreviewHtml(
  blocks: readonly MermaidBlock[],
  options?: {
    mermaidScriptPath?: string;
    tempDir?: string;
  },
): string {
  if (blocks.length === 0) {
    throw new Error("no mermaid blocks");
  }
  const mermaidScriptPath = options?.mermaidScriptPath ?? resolveMermaidScriptPath();
  const dir = options?.tempDir ?? mkdtempSync(join(tmpdir(), "zcp-mermaid-"));
  const scriptCopyPath = join(dir, MERMAID_SCRIPT_NAME);
  copyFileSync(mermaidScriptPath, scriptCopyPath);

  const diagrams = blocks
    .map(
      (block, index) =>
        `<div class="mermaid" id="mermaid-${index}">${escapeHtml(block.code)}</div>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ZCode Mermaid Preview</title>
  <style>
    body { margin: 24px; font-family: sans-serif; background: #0d1117; color: #e6edf3; }
    .mermaid { margin-bottom: 32px; overflow-x: auto; }
  </style>
</head>
<body>
${diagrams}
  <script src="./${MERMAID_SCRIPT_NAME}"></script>
  <script>
    mermaid.initialize({ startOnLoad: true, theme: "dark" });
  </script>
</body>
</html>
`;
  const htmlPath = join(dir, "preview.html");
  writeFileSync(htmlPath, html, "utf8");
  return htmlPath;
}

export async function openMermaidPreviewInBrowser(
  markdown: string,
  options?: BrowserOpenOptions & {
    mermaidScriptPath?: string;
    openUrl?: typeof openUrlInBrowser;
    writeHtml?: typeof writeMermaidPreviewHtml;
  },
): Promise<MermaidPreviewOpenResult> {
  const blocks = extractMermaidBlocks(markdown);
  if (blocks.length === 0) return { kind: "none" };

  try {
    const writeHtml = options?.writeHtml ?? writeMermaidPreviewHtml;
    const htmlPath = writeHtml(blocks, { mermaidScriptPath: options?.mermaidScriptPath });
    const openUrl = options?.openUrl ?? openUrlInBrowser;
    const open = await openUrl(pathToFileURL(htmlPath).href, options);
    if (!open.opened) {
      return {
        kind: "failed",
        message: open.reason ?? `failed to launch ${open.command}`,
      };
    }
    return { kind: "opened", htmlPath, open };
  } catch (error) {
    return {
      kind: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
