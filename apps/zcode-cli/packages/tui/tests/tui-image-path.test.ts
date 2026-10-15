import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatDraftImageLine } from "../src/app-image-attachment-bar.js";
import {
  openLastImageAttachment,
  resolveImageAttachmentsForSubmit,
} from "../src/app-image-files.js";
import {
  findAtImagePathRefs,
  normalizeImagePathToken,
  tokenizePathPaste,
  tryParseImagePathPaste,
} from "../src/image-path.js";
import {
  detectImageProtocol,
  encodeITermImage,
  encodeKittyImage,
  formatImageAttachmentFallback,
  parseImageDimensions,
} from "../src/terminal-image.js";

test("tokenizePathPaste handles quotes and backslash escapes", () => {
  assert.deepEqual(tokenizePathPaste(`"/tmp/my photo.png"`), ["/tmp/my photo.png"]);
  assert.deepEqual(tokenizePathPaste(`/tmp/my\\ photo.png`), ["/tmp/my photo.png"]);
  assert.deepEqual(tokenizePathPaste(`a.png b.jpg`), ["a.png", "b.jpg"]);
});

test("normalizeImagePathToken expands file:// and ~", () => {
  assert.equal(
    normalizeImagePathToken("file:///tmp/demo.png", { homeDir: "/home/me", cwd: "/cwd" }),
    "/tmp/demo.png",
  );
  assert.equal(
    normalizeImagePathToken("~/Pictures/x.webp", { homeDir: "/home/me", cwd: "/cwd" }),
    "/home/me/Pictures/x.webp",
  );
  assert.equal(
    normalizeImagePathToken("shots/a.png", { homeDir: "/home/me", cwd: "/cwd" }),
    "/cwd/shots/a.png",
  );
});

test("tryParseImagePathPaste only accepts existing image paths", () => {
  const existing = new Set(["/tmp/a.png", "/tmp/b.jpeg"]);
  assert.deepEqual(
    tryParseImagePathPaste(`"/tmp/a.png" /tmp/b.jpeg`, {
      existsSync: (path) => existing.has(path),
      homeDir: "/home/me",
      cwd: "/cwd",
    }),
    ["/tmp/a.png", "/tmp/b.jpeg"],
  );
  assert.equal(
    tryParseImagePathPaste("hello /tmp/a.png", {
      existsSync: (path) => existing.has(path),
    }),
    null,
  );
  assert.equal(
    tryParseImagePathPaste("/tmp/missing.png", {
      existsSync: () => false,
    }),
    null,
  );
});

test("findAtImagePathRefs collects image @paths", () => {
  assert.deepEqual(findAtImagePathRefs("see @./shot.png and @docs/a.md"), [
    { path: "./shot.png", raw: "./shot.png" },
  ]);
  assert.deepEqual(findAtImagePathRefs(`look @"my photo.jpg"`), [
    { path: "my photo.jpg", raw: `"my photo.jpg"` },
  ]);
});

test("detectImageProtocol respects override and terminal hints", () => {
  assert.equal(detectImageProtocol({ ZCP_IMAGE_PROTOCOL: "none", TERM: "xterm-kitty" }), "none");
  assert.equal(detectImageProtocol({ KITTY_WINDOW_ID: "1" }), "kitty");
  assert.equal(detectImageProtocol({ TERM: "xterm-kitty" }), "kitty");
  assert.equal(detectImageProtocol({ TERM_PROGRAM: "ghostty" }), "kitty");
  assert.equal(detectImageProtocol({ TERM_PROGRAM: "iTerm.app" }), "iterm");
  assert.equal(detectImageProtocol({ TERM_PROGRAM: "WezTerm" }), "iterm");
  assert.equal(detectImageProtocol({ TERM: "xterm-256color" }), "none");
});

test("parseImageDimensions reads PNG and GIF headers", () => {
  const png = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0,
    0x01, 0xf4, 0, 0, 0x01, 0x2c,
  ]);
  assert.deepEqual(parseImageDimensions(png), { width: 500, height: 300 });

  const gif = Uint8Array.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x20, 0x00,
  ]);
  assert.deepEqual(parseImageDimensions(gif), { width: 16, height: 32 });
});

test("escape sequence helpers emit kitty and iterm payloads", () => {
  const kitty = encodeKittyImage({
    base64: "QUJD",
    mediaType: "image/png",
    width: 2,
    height: 3,
  });
  assert.match(kitty, /^\x1b_Ga=T,f=100,s=2,v=3,m=0;QUJD\x1b\\$/);

  const iterm = encodeITermImage({
    base64: "QUJD",
    name: "x.png",
    width: 2,
    height: 3,
  });
  assert.equal(
    iterm,
    `\x1b]1337;File=inline=1:name=${Buffer.from("x.png", "utf8").toString("base64")}:width=2px:height=3px:preserveAspectRatio=1:QUJD\x07`,
  );
});

test("formatImageAttachmentFallback includes label size and protocol note", () => {
  assert.equal(
    formatImageAttachmentFallback({
      label: "[image #1]",
      width: 10,
      height: 20,
      sizeBytes: 2048,
      protocol: "kitty",
    }),
    "🖼 [image #1]  10x20  2KB  (kitty)",
  );
});

test("resolveImageAttachmentsForSubmit converts @image paths to dataUrl images", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const directory = await mkdtemp(join(tmpdir(), "zcp-image-test-"));
  const path = join(directory, "shot.png");
  await writeFile(path, pngBytes);
  try {
    let nextId = 3;
    const result = await resolveImageAttachmentsForSubmit({
      allocateId: () => nextId++,
      attachments: [],
      text: `look @${path}`,
    });
    assert.equal(result.errors.length, 0);
    assert.equal(result.attachments.length, 1);
    const attachment = result.attachments[0];
    assert.equal(attachment?.type, "image");
    if (attachment?.type === "image") {
      assert.equal(attachment.placeholder, `@${path}`);
      assert.match(attachment.dataUrl, /^data:image\/png;base64,/);
      assert.equal(attachment.sourcePath, path);
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("resolveImageAttachmentsForSubmit keeps quoted @path placeholder in draft text", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { toPromptInput } = await import("../src/app-input.js");
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const directory = await mkdtemp(join(tmpdir(), "zcp-image-quoted-"));
  const path = join(directory, "my photo.png");
  await writeFile(path, pngBytes);
  const text = `look @"${path}"`;
  try {
    let nextId = 1;
    const result = await resolveImageAttachmentsForSubmit({
      allocateId: () => nextId++,
      attachments: [],
      text,
    });
    assert.equal(result.attachments.length, 1);
    const prompt = toPromptInput(text, result.attachments);
    assert.ok(typeof prompt !== "string");
    if (typeof prompt === "string") return;
    assert.equal(prompt.attachments?.length, 1);
    assert.equal(prompt.attachments?.[0]?.type, "image");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("parseImageDimensions reads JPEG SOF0", () => {
  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x20, 0x03, 0x01, 0x22, 0x00,
  ]);
  assert.deepEqual(parseImageDimensions(jpeg), { width: 32, height: 16 });
});

test("resolveImageAttachmentsForSubmit upgrades file draft attachments that are images", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const directory = await mkdtemp(join(tmpdir(), "zcp-image-file-"));
  const path = join(directory, "attach.png");
  await writeFile(path, pngBytes);
  try {
    const result = await resolveImageAttachmentsForSubmit({
      allocateId: () => 99,
      attachments: [
        {
          id: 4,
          path,
          placeholder: `@${path}`,
          type: "file",
        },
      ],
      text: `please read @${path}`,
    });
    assert.equal(result.attachments.length, 1);
    assert.equal(result.attachments[0]?.type, "image");
    if (result.attachments[0]?.type === "image") {
      assert.equal(result.attachments[0].id, 4);
      assert.match(result.attachments[0].dataUrl, /^data:image\/png;base64,/);
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("openLastImageAttachment writes temp file and invokes opener", async () => {
  const opened: string[] = [];
  const result = await openLastImageAttachment(
    [
      {
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        id: 1,
        mediaType: "image/png",
        placeholder: "[image #1]",
        sourcePath: "/tmp/demo.png",
        type: "image",
      },
    ],
    {
      openCommand: (filePath) => {
        opened.push(filePath);
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(opened.length, 1);
  assert.match(opened[0]!, /demo\.png$/);
  const bytes = await readFile(opened[0]!);
  assert.ok(bytes.byteLength > 0);
});

test("formatDraftImageLine annotates detected protocol", () => {
  const line = formatDraftImageLine(
    {
      dataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      id: 2,
      mediaType: "image/png",
      placeholder: "[image #2]",
      sizeBytes: 68,
      type: "image",
    },
    "iterm",
  );
  assert.match(line, /\[image #2\]/);
  assert.match(line, /1x1/);
  assert.match(line, /\(iterm\)/);
});
