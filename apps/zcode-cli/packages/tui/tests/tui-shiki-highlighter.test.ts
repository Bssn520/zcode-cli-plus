import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveShikiLanguageFromInfoString,
  resetShikiHighlighterForTest,
} from "../src/app-shiki-highlighter.js";

test("resolveShikiLanguageFromInfoString maps aliases and unknowns", () => {
  resetShikiHighlighterForTest();
  assert.equal(resolveShikiLanguageFromInfoString("ts"), "typescript");
  assert.equal(resolveShikiLanguageFromInfoString("js"), "javascript");
  assert.equal(resolveShikiLanguageFromInfoString("py"), "python");
  assert.equal(resolveShikiLanguageFromInfoString("mermaid"), "mermaid");
  assert.equal(resolveShikiLanguageFromInfoString("  TSX extra"), "tsx");
  assert.equal(resolveShikiLanguageFromInfoString("not-a-lang"), undefined);
  assert.equal(resolveShikiLanguageFromInfoString(""), undefined);
  assert.equal(resolveShikiLanguageFromInfoString(undefined), undefined);
});
