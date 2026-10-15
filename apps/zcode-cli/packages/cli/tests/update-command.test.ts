import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { RunContext } from "@zcode/shared-types";
import {
  compareSemver,
  runUpdateCommand,
  UPDATE_COMMAND_USAGE,
  UPDATE_INSTALL_COMMAND,
} from "../src/update-command.js";

type CapturedWriteStream = NodeJS.WriteStream & {
  output: () => string;
};

const createWriteStream = (): CapturedWriteStream => {
  let output = "";
  return {
    output: () => output,
    write: (
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
      callback?: (err?: Error | null) => void,
    ): boolean => {
      output += typeof chunk === "string" ? chunk : chunk.toString();
      const writeCallback =
        typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      writeCallback?.();
      return true;
    },
  } as CapturedWriteStream;
};

const createContext = (): RunContext & {
  stderr: CapturedWriteStream;
  stdout: CapturedWriteStream;
} => ({
  argv: ["update"],
  stderr: createWriteStream(),
  stdin: { isTTY: false } as NodeJS.ReadStream,
  stdout: createWriteStream(),
});

test("compareSemver orders dotted versions", () => {
  assert.equal(compareSemver("0.2.1", "0.2.0"), 1);
  assert.equal(compareSemver("0.2.0", "0.2.0"), 0);
  assert.equal(compareSemver("0.1.9", "0.2.0"), -1);
});

test("update --help prints usage", async () => {
  const ctx = createContext();
  const code = await runUpdateCommand(ctx, ["--help"], "0.2.0");
  assert.equal(code, 0);
  assert.equal(ctx.stdout.output(), UPDATE_COMMAND_USAGE);
});

test("update reports already latest", async () => {
  const ctx = createContext();
  const code = await runUpdateCommand(ctx, [], "0.2.0", {
    fetch: async () =>
      new Response(JSON.stringify({ version: "0.2.0" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
  assert.equal(code, 0);
  assert.match(ctx.stdout.output(), /已是最新版本 0\.2\.0/);
});

test("update --check prints upgrade path without installing", async () => {
  const ctx = createContext();
  let spawned = false;
  const code = await runUpdateCommand(ctx, ["--check"], "0.2.0", {
    fetch: async (url) => {
      assert.match(String(url), /zcode-cli-plus\/latest$/);
      return new Response(JSON.stringify({ version: "0.2.1" }), { status: 200 });
    },
    spawn: () => {
      spawned = true;
      return new EventEmitter();
    },
  });
  assert.equal(code, 0);
  assert.equal(spawned, false);
  assert.match(ctx.stdout.output(), /0\.2\.0 → 0\.2\.1/);
});

test("update installs when a newer version exists", async () => {
  const ctx = createContext();
  const code = await runUpdateCommand(ctx, [], "0.2.0", {
    env: { ZCP_UPDATE_REGISTRY: "https://example.test" },
    fetch: async (url) => {
      assert.equal(String(url), "https://example.test/@bssn520%2fzcode-cli-plus/latest");
      return new Response(JSON.stringify({ version: "0.3.0" }), { status: 200 });
    },
    spawn: (command, args, options) => {
      assert.equal(command, "npm");
      assert.deepEqual(args, [
        "i",
        "-g",
        "@bssn520/zcode-cli-plus@latest",
        "--registry",
        "https://example.test",
      ]);
      assert.equal(options.stdio, "inherit");
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("exit", 0));
      return child;
    },
  });
  assert.equal(code, 0);
  assert.match(ctx.stdout.output(), /0\.2\.0 → 0\.3\.0/);
});

test("update prints manual command when install fails", async () => {
  const ctx = createContext();
  const code = await runUpdateCommand(ctx, [], "0.2.0", {
    fetch: async () => new Response(JSON.stringify({ version: "0.2.1" }), { status: 200 }),
    spawn: () => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("exit", 1));
      return child;
    },
  });
  assert.equal(code, 1);
  assert.match(ctx.stderr.output(), new RegExp(`Run manually: ${UPDATE_INSTALL_COMMAND}`));
  assert.match(ctx.stderr.output(), /sudo/);
});

test("update prints manual command on registry failure", async () => {
  const ctx = createContext();
  const code = await runUpdateCommand(ctx, [], "0.2.0", {
    fetch: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(code, 1);
  assert.match(ctx.stderr.output(), /Failed to check for updates: network down/);
  assert.match(ctx.stderr.output(), new RegExp(UPDATE_INSTALL_COMMAND));
});

test("run() accepts update --check", async () => {
  const ctx: RunContext & {
    stderr: CapturedWriteStream;
    stdout: CapturedWriteStream;
  } = {
    argv: ["update", "--check"],
    stderr: createWriteStream(),
    stdin: { isTTY: false } as NodeJS.ReadStream,
    stdout: createWriteStream(),
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ version: "0.0.0" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    const { run } = await import("../src/run.js");
    const code = await run(ctx);
    assert.equal(code, 0);
    assert.doesNotMatch(ctx.stderr.output(), /Unknown option/);
    assert.match(ctx.stdout.output(), /已是最新版本 0\.0\.0/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
