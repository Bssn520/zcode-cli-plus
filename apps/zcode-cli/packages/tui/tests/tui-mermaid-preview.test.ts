import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  extractMermaidBlocks,
  openMermaidPreviewInBrowser,
  resolveMermaidScriptPath,
  writeMermaidPreviewHtml,
} from "../src/app-mermaid-preview.js";
import { browserOpenCommand } from "../src/app-open-url.js";

test("extractMermaidBlocks finds fenced mermaid only", () => {
  const markdown = [
    "Intro",
    "```mermaid",
    "graph TD",
    "  A-->B",
    "```",
    "",
    "```ts",
    "const x = 1",
    "```",
    "",
    "```mermaid",
    "sequenceDiagram",
    "  Alice->>Bob: hi",
    "```",
  ].join("\n");

  const blocks = extractMermaidBlocks(markdown);
  assert.equal(blocks.length, 2);
  assert.match(blocks[0]?.code ?? "", /graph TD/u);
  assert.match(blocks[1]?.code ?? "", /sequenceDiagram/u);
});

test("extractMermaidBlocks tolerates CRLF and ignores indented fences", () => {
  const markdown = "```mermaid\r\ngraph LR\r\n  A-->B\r\n```\r\n\r\n    ```mermaid\r\nignored\r\n```\r\n";
  const blocks = extractMermaidBlocks(markdown);
  assert.equal(blocks.length, 1);
  assert.match(blocks[0]?.code ?? "", /graph LR/u);
});

test("writeMermaidPreviewHtml is offline and uses a local script", () => {
  const dir = mkdtempSync(join(tmpdir(), "zcp-mermaid-test-"));
  const scriptPath = join(dir, "mermaid.min.js");
  writeFileSync(scriptPath, "window.mermaid = { initialize() {} };", "utf8");
  try {
    const htmlPath = writeMermaidPreviewHtml(
      [{ code: "graph TD\n  A-->B", index: 0 }],
      { mermaidScriptPath: scriptPath, tempDir: dir },
    );
    const html = readFileSync(htmlPath, "utf8");
    assert.match(html, /script src="\.\/mermaid\.min\.js"/u);
    assert.doesNotMatch(html, /cdn\.|https?:\/\//iu);
    assert.match(html, /graph TD/u);
    assert.match(html, /A--&gt;B/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveMermaidScriptPath prefers vendored then dependency", async () => {
  const { mkdirSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "zcp-mermaid-vendor-"));
  mkdirSync(join(dir, "vendor"), { recursive: true });
  const vendored = join(dir, "vendor", "mermaid.min.js");
  writeFileSync(vendored, "vendored", "utf8");
  try {
    assert.equal(resolveMermaidScriptPath({ bundleDir: dir }), vendored);
    const fallback = resolveMermaidScriptPath({
      bundleDir: join(dir, "missing"),
      requireResolve: () => "/tmp/fake-mermaid.min.js",
    });
    assert.equal(fallback, "/tmp/fake-mermaid.min.js");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("browserOpenCommand selects platform launchers", () => {
  assert.deepEqual(browserOpenCommand("darwin", "file:///tmp/a.html"), {
    executable: "open",
    args: ["file:///tmp/a.html"],
  });
  assert.deepEqual(browserOpenCommand("win32", "file:///tmp/a.html"), {
    executable: "cmd.exe",
    args: ["/c", "start", "", "file:///tmp/a.html"],
  });
  assert.deepEqual(browserOpenCommand("linux", "file:///tmp/a.html"), {
    executable: "xdg-open",
    args: ["file:///tmp/a.html"],
  });
});

test("openMermaidPreviewInBrowser reports none/opened through injected deps", async () => {
  const none = await openMermaidPreviewInBrowser("no diagrams");
  assert.equal(none.kind, "none");

  const opened = await openMermaidPreviewInBrowser("```mermaid\ngraph TD\nA-->B\n```", {
    writeHtml: () => "/tmp/preview.html",
    openUrl: async () => ({ command: "xdg-open", opened: true }),
  });
  assert.equal(opened.kind, "opened");
});
