import assert from "node:assert/strict";
import test from "node:test";
import {
  IMAGE_THUMB_COLUMNS,
  IMAGE_THUMB_ROWS,
  buildOverlayClearSequence,
  buildOverlayDrawSequence,
  csiMoveCursor,
  dataUrlBase64,
  overlaySignature,
  shouldRedrawOverlay,
  wrapTmuxPassthrough,
} from "../src/terminal-image-overlay.js";
import { encodeKittyDeleteAll } from "../src/terminal-image.js";

test("csiMoveCursor emits 1-based CUP sequence", () => {
  assert.equal(csiMoveCursor(3, 8), "\x1b[3;8H");
});

test("wrapTmuxPassthrough doubles ESC only when TMUX is set", () => {
  const raw = "\x1b[1;1H\x1b_Ga=T;QQ\x1b\\";
  assert.equal(wrapTmuxPassthrough(raw, {}), raw);
  assert.equal(
    wrapTmuxPassthrough(raw, { TMUX: "/tmp/tmux-1000/default,123,0" }),
    "\x1bPtmux;\x1b\x1b[1;1H\x1b\x1b_Ga=T;QQ\x1b\x1b\\\x1b\\",
  );
});

test("shouldRedrawOverlay compares signatures", () => {
  assert.equal(shouldRedrawOverlay(null, "a"), true);
  assert.equal(shouldRedrawOverlay("a", "a"), false);
  assert.equal(shouldRedrawOverlay("a", "b"), true);
});

test("buildOverlayDrawSequence saves cursor, moves, and draws", () => {
  const sequence = buildOverlayDrawSequence(
    {
      protocol: "kitty",
      slots: [
        {
          base64: "QUJD",
          col: 4,
          id: 1,
          mediaType: "image/png",
          row: 2,
        },
      ],
    },
    { env: {} },
  );
  assert.ok(sequence.startsWith("\x1b7"));
  assert.ok(sequence.includes("\x1b[2;4H"));
  assert.ok(sequence.includes(`c=${IMAGE_THUMB_COLUMNS}`));
  assert.ok(sequence.includes(`r=${IMAGE_THUMB_ROWS}`));
  assert.ok(sequence.includes(";QUJD\x1b\\"));
  assert.ok(sequence.endsWith("\x1b8"));
});

test("buildOverlayClearSequence only emits for kitty", () => {
  assert.equal(buildOverlayClearSequence("iterm", {}), undefined);
  assert.equal(buildOverlayClearSequence("kitty", {}), encodeKittyDeleteAll());
  assert.equal(
    buildOverlayClearSequence("kitty", { TMUX: "1" }),
    wrapTmuxPassthrough(encodeKittyDeleteAll(), { TMUX: "1" }),
  );
});

test("overlaySignature changes when slot position changes", () => {
  const base = {
    protocol: "iterm" as const,
    slots: [{ base64: "QQ", col: 1, id: 7, row: 1 }],
  };
  const moved = {
    protocol: "iterm" as const,
    slots: [{ base64: "QQ", col: 2, id: 7, row: 1 }],
  };
  assert.notEqual(overlaySignature(base), overlaySignature(moved));
});

test("dataUrlBase64 extracts payload", () => {
  assert.equal(dataUrlBase64("data:image/png;base64,QUJD"), "QUJD");
  assert.equal(dataUrlBase64("not-a-data-url"), undefined);
});
