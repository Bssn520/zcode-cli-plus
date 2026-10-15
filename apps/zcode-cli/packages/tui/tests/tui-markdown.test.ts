import assert from "node:assert/strict";
import test from "node:test";
import { MessageRow } from "../src/app-transcript-components.js";
import { palette } from "../src/app-model.js";
import {
  createShikiOnChunks,
  detectMarkdownRenderMode,
  MarkdownText,
} from "../src/app-markdown.js";
import { createMarkdownSyntaxStyle, markdownSyntaxRules } from "../src/app-markdown-theme.js";
import { resetShikiHighlighterForTest } from "../src/app-shiki-highlighter.js";
import { DARK_TUI_THEME } from "../src/theme/index.js";

test("detects the best available markdown render mode", () => {
  assert.equal(
    detectMarkdownRenderMode({ code: class Code {}, markdown: class Markdown {} }),
    "markdown",
  );
  assert.equal(detectMarkdownRenderMode({ code: class Code {} }), "code");
  assert.equal(detectMarkdownRenderMode({}), "plain");
});

test("maps markdown theme tokens from the TUI palette", () => {
  const rules = markdownSyntaxRules(DARK_TUI_THEME);
  const heading = rules.find((rule) => rule.scope.includes("markup.heading"));
  const link = rules.find((rule) => rule.scope.includes("markup.link"));
  const inlineCode = rules.find((rule) => rule.scope.includes("markup.raw.inline"));

  assert.equal(heading?.style.bold, true);
  assert.equal(heading?.style.foreground, DARK_TUI_THEME.markdownHeading);
  assert.equal(link?.style.underline, true);
  assert.equal(inlineCode?.style.background, DARK_TUI_THEME.backgroundPanel);
});

test("uses OpenTUI native markdown when available", () => {
  const node = MarkdownText({
    content: "## Title\n\nThis is **bold** and `code`.",
    mode: "markdown",
    streaming: true,
  });

  assert.equal(node.type, "markdown");
  assert.equal(node.props.content, "## Title\n\nThis is **bold** and `code`.");
  assert.equal(node.props.conceal, true);
  assert.equal(node.props.streaming, true);
  assert.ok(node.props.syntaxStyle);
});

test("passes tableOptions through to native markdown", () => {
  const tableOptions = { style: "grid" as const, wrapMode: "word" as const };
  const node = MarkdownText({
    content: "| a | b |\n| --- | --- |\n| 1 | 2 |",
    mode: "markdown",
    tableOptions,
  });

  assert.equal(node.type, "markdown");
  assert.equal(node.props.tableOptions, tableOptions);
  assert.equal(typeof node.props.renderNode, "function");
});

test("reuses stable renderNode and syntaxStyle across renders", () => {
  const first = MarkdownText({
    content: "```ts\n const x = 1\n```",
    mode: "markdown",
  });
  const second = MarkdownText({
    content: "```ts\n const y = 2\n```",
    mode: "markdown",
  });
  assert.equal(first.type, "markdown");
  assert.equal(second.type, "markdown");
  assert.equal(first.props.renderNode, second.props.renderNode);
  assert.equal(first.props.syntaxStyle, second.props.syntaxStyle);
});

test("shiki onChunks returns foreground-colored ts keyword chunks", async () => {
  resetShikiHighlighterForTest();
  const source = 'export function demo() {\n  const msg = "hi";\n  return msg;\n}\n';
  const syntaxStyle = createMarkdownSyntaxStyle(DARK_TUI_THEME);
  assert.ok(syntaxStyle);
  const onChunks = createShikiOnChunks("dark", "ts", "#e5e7eb");
  const result = await onChunks([], {
    content: source,
    filetype: "typescript",
    highlights: [],
    syntaxStyle,
  });
  assert.ok(result && result.length > 1);
  const colored = result.filter(
    (chunk) => chunk.fg && /export|function|const|return|"hi"/u.test(chunk.text),
  );
  assert.ok(colored.length >= 4, `expected colored keyword/string chunks, got ${colored.length}`);
  const colors = new Set(colored.map((chunk) => JSON.stringify(chunk.fg)));
  assert.ok(colors.size > 1, "expected more than one foreground color from shiki");
});


test("passes underscore-delimited text through to native markdown unchanged", () => {
  const sessionId = "sess_workflow_activity_26c91a65-2d5a-4f7b-9954-3ff7dbe92771";
  const node = MarkdownText({
    content: `- completed · import-audit · ${sessionId}\n_keep_ underscores`,
    mode: "markdown",
  });

  assert.equal(node.type, "markdown");
  assert.equal(node.props.content, `- completed · import-audit · ${sessionId}\n_keep_ underscores`);
});

test("falls markdown text back to code or plain text", () => {
  const codeNode = MarkdownText({
    content: "**bold**",
    mode: "code",
  });
  const plainNode = MarkdownText({
    content: "**bold**",
    mode: "plain",
  });

  assert.equal(codeNode.type, "code");
  assert.equal(codeNode.props.filetype, "markdown");
  assert.equal(codeNode.props.content, "**bold**");
  assert.equal(plainNode.type, "text");
  assert.deepEqual(collectTextLines(plainNode), ["**bold**"]);
});

test("message rows render assistant text as native markdown", () => {
  const node = MessageRow({
    index: 0,
    message: {
      content: "Use `npm test`.",
      role: "agent",
      streaming: true,
    },
  });
  const markdownNodes = collectElementsOfType(node, MarkdownText);

  assert.equal(markdownNodes.length, 1);
  assert.equal(markdownNodes[0]?.props.content, "Use `npm test`.");
  assert.equal(markdownNodes[0]?.props.streaming, true);
});

test("message rows hide speaker labels and only highlight user prompts", () => {
  const userRow = MessageRow({
    index: 0,
    message: {
      content: "Show `raw` markdown",
      role: "user",
    },
  });
  const agentRow = MessageRow({
    index: 1,
    message: {
      content: "Use `npm test`.",
      role: "agent",
    },
  });

  assert.equal(reactElementStyle(userRow).backgroundColor, palette.userMessageBackground);
  assert.equal(reactElementStyle(userRow).paddingTop, 1);
  assert.equal(reactElementStyle(userRow).paddingBottom, 1);
  assert.equal(reactElementStyle(agentRow).backgroundColor, palette.background);
  assert.equal(reactElementStyle(agentRow).paddingTop, 0);
  assert.equal(reactElementStyle(agentRow).paddingBottom, 0);
  assert.ok(
    collectTextNodes(userRow).some(
      (node) => node.text.includes("Show `raw` markdown") && node.style.fg === palette.text,
    ),
  );
  assert.equal(collectTextLines(userRow).some((line) => line.includes("User:")), false);
  assert.equal(collectTextLines(agentRow).some((line) => line.includes("Agent:")), false);
});

test("message rows keep user and explicit plain text parts unformatted", () => {
  const userRow = MessageRow({
    index: 0,
    message: {
      content: "Show `raw` markdown",
      role: "user",
    },
  });
  const partRow = MessageRow({
    index: 0,
    message: {
      content: "",
      parts: [{ format: "plain", text: "**plain**", type: "text" }],
      role: "agent",
    },
  });

  assert.equal(collectElementsOfType(userRow, MarkdownText).length, 0);
  assert.equal(collectElementsOfType(partRow, MarkdownText).length, 0);
  assert.ok(collectTextLines(userRow).some((line) => line.includes("Show `raw` markdown")));
  assert.ok(collectTextLines(partRow).includes("**plain**"));
});

test("fork tip with [Fork] keeps brackets via plain transcript rendering", async () => {
  const { appendAgentResult } = await import("../src/app-submit.js");
  const tip = "已 Fork 到新会话：[Fork] first TOOLME";
  const messages = appendAgentResult([], {
    response: tip,
    responseFormat: "plain",
  });
  const tipMessage = messages.at(-1);
  assert.ok(tipMessage);
  const row = MessageRow({ index: 0, message: tipMessage });

  assert.equal(collectElementsOfType(row, MarkdownText).length, 0);
  assert.ok(collectTextLines(row).some((line) => line.includes("[Fork] first TOOLME")));
});

function collectTextLines(node: unknown): string[] {
  const lines: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      lines.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (typeof value === "object" && value !== null && "props" in value) {
      const element = value as { props?: { children?: unknown } };
      visit(element.props?.children);
    }
  };

  visit(node);
  return lines;
}

function collectTextNodes(node: unknown): Array<{ style: Record<string, unknown>; text: string }> {
  const nodes: ReturnType<typeof collectTextNodes> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (typeof value !== "object" || value === null || !("props" in value)) return;
    const element = value as {
      props?: {
        children?: unknown;
        style?: Record<string, unknown>;
      };
      type?: unknown;
    };
    if (element.type === "text") {
      nodes.push({
        style: element.props?.style ?? {},
        text: collectTextLines(element.props?.children).join(""),
      });
    }
    visit(element.props?.children);
  };

  visit(node);
  return nodes;
}

function collectElementsOfType(
  node: unknown,
  type: unknown,
): Array<{ props: { style?: { attributes?: number; fg?: string } } & Record<string, unknown> }> {
  const elements: ReturnType<typeof collectElementsOfType> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (typeof value !== "object" || value === null || !("props" in value)) return;
    const element = value as {
      props?: {
        children?: unknown;
      } & Record<string, unknown>;
      type?: unknown;
    };
    if (element.type === type) {
      elements.push({ props: element.props ?? {} });
    }
    visit(element.props?.children);
  };

  visit(node);
  return elements;
}

function reactElementStyle(node: unknown): Record<string, unknown> {
  assert.ok(typeof node === "object" && node !== null && "props" in node);
  const element = node as { props?: { style?: Record<string, unknown> } };
  return element.props?.style ?? {};
}
