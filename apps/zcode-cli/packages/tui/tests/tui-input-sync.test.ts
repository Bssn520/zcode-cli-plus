import assert from "node:assert/strict";
import test from "node:test";
import { shouldEmitTextareaInput, syncTextareaValue } from "../src/app-input-pane.js";

test("ignores controlled textarea sync echoes", () => {
  assert.equal(shouldEmitTextareaInput("restored prompt", "restored prompt"), false);
  assert.equal(shouldEmitTextareaInput("restored prompt", "restored prompt plus edit"), true);
});

test("empty controlled value still differs from stale editor text", () => {
  // Mirrors the 0.2.0 bug: React draft already "", textarea still has old text.
  assert.equal(shouldEmitTextareaInput("", "stale prompt"), true);
  assert.equal(shouldEmitTextareaInput("", ""), false);
});

test("syncTextareaValue clears stale editor text to empty draft", () => {
  let plainText = "stale prompt";
  const textarea = {
    get plainText() {
      return plainText;
    },
    setText(value: string) {
      plainText = value;
    },
    gotoBufferEnd() {},
  };
  assert.equal(syncTextareaValue(textarea, ""), true);
  assert.equal(plainText, "");
  assert.equal(syncTextareaValue(textarea, ""), false);
});
