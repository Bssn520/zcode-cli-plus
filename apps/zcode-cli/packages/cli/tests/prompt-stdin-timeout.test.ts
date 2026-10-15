import assert from "node:assert/strict";
import { mkdtemp, open, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import type { RunContext } from "@zcode/shared-types";
import { run } from "../src/run.js";
import type { RunDependencies } from "../src/run.js";
import {
  cleanupStaleNoSessionStores,
  NO_SESSION_TEMP_PREFIX,
} from "../src/no-session-store.js";
import { combinePromptWithStdin, readStdinTextIfPiped } from "../src/stdin-text.js";

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

const createContext = (
  argv: string[],
  stdin: NodeJS.ReadStream = { isTTY: true } as NodeJS.ReadStream,
): RunContext & { stderr: CapturedWriteStream; stdout: CapturedWriteStream } => ({
  argv,
  stderr: createWriteStream(),
  stdin,
  stdout: createWriteStream(),
});

const fakeProjection = {
  contextUsed: 0,
  contextWindow: 0,
  status: "idle",
  totalTokenCount: 0,
  turnCount: 1,
};

const createPromptDeps = (
  overrides: Partial<RunDependencies> = {},
): RunDependencies => ({
  createZCodeApp: () =>
    ({
      sessionId: "session-test",
      traceId: "trace-test",
      runtime: {} as never,
      submitPrompt: async (prompt: string) => ({
        events: [],
        projection: fakeProjection as never,
        response: typeof prompt === "string" ? prompt : String(prompt),
        traceId: "trace-test" as never,
        turnId: "turn-test" as never,
      }),
    }) as never,
  loadDotenv: () => ({ keys: [], loaded: false }),
  startProcessProviderRegistryRuntime: async () =>
    ({
      dispose: () => {},
      runtime: { registryService: {} },
    }) as never,
  ...overrides,
});

test("combinePromptWithStdin prepends piped text", () => {
  assert.equal(combinePromptWithStdin("task", "ctx"), "ctx\n\ntask");
  assert.equal(combinePromptWithStdin("task", undefined), "task");
});

test("readStdinTextIfPiped skips TTY stdin", async () => {
  const text = await readStdinTextIfPiped({ isTTY: true } as NodeJS.ReadStream);
  assert.equal(text, undefined);
});

test("idle non-TTY stdin without first byte is abandoned after ~1s", async () => {
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean; unref?: () => void };
  stdin.isTTY = false;
  stdin.unref = () => undefined;

  const started = Date.now();
  const text = await readStdinTextIfPiped(stdin);
  const elapsedMs = Date.now() - started;

  assert.equal(text, undefined);
  assert.ok(elapsedMs >= 900, `expected ~1s idle wait, got ${elapsedMs}ms`);
  assert.ok(elapsedMs < 2500, `idle abandon took too long: ${elapsedMs}ms`);
});

test("never-ending empty pipe does not block --prompt after idle timeout", async () => {
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean; unref?: () => void };
  stdin.isTTY = false;
  stdin.unref = () => undefined;

  let submitted: unknown;
  const started = Date.now();
  const ctx = createContext(["--prompt", "hi"], stdin as NodeJS.ReadStream);
  const code = await run(
    ctx,
    createPromptDeps({
      createZCodeApp: () =>
        ({
          sessionId: "session-test",
          traceId: "trace-test",
          runtime: {} as never,
          submitPrompt: async (prompt: unknown) => {
            submitted = prompt;
            return {
              events: [],
              projection: fakeProjection as never,
              response: "ok",
              traceId: "trace-test" as never,
              turnId: "turn-test" as never,
            };
          },
        }) as never,
    }),
  );
  const elapsedMs = Date.now() - started;

  assert.equal(code, 0);
  assert.equal(submitted, "hi");
  assert.equal(ctx.stdout.output(), "ok\n");
  assert.ok(elapsedMs >= 900, `expected ~1s idle wait, got ${elapsedMs}ms`);
  assert.ok(elapsedMs < 2500, `prompt path hung too long on idle stdin: ${elapsedMs}ms`);
});

test("--timeout covers hanging stdin before submitPrompt", async () => {
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean; unref?: () => void };
  stdin.isTTY = false;
  stdin.unref = () => undefined;
  // First byte arrives, but EOF never does — idle timeout must not apply.
  stdin.write("partial");

  let submitted = false;
  const started = Date.now();
  const ctx = createContext(["--prompt", "hang-stdin", "--timeout", "1"], stdin as NodeJS.ReadStream);
  const code = await run(
    ctx,
    createPromptDeps({
      createZCodeApp: () =>
        ({
          sessionId: "session-test",
          traceId: "trace-test",
          runtime: {} as never,
          close: async () => undefined,
          submitPrompt: async () => {
            submitted = true;
            throw new Error("submitPrompt should not run while stdin hangs");
          },
        }) as never,
      exitProcess: () => undefined,
      shutdownCleanupTimeoutMs: 50,
    }),
  );
  const elapsedMs = Date.now() - started;

  assert.equal(code, 2);
  assert.equal(submitted, false);
  assert.match(ctx.stderr.output(), /timed out after 1s/);
  assert.ok(elapsedMs >= 900, `expected ~1s timeout, got ${elapsedMs}ms`);
  assert.ok(elapsedMs < 2500, `timeout during stdin took too long: ${elapsedMs}ms`);
  process.exitCode = undefined;
});

test("piped stdin is prepended to --prompt before submitPrompt", async () => {
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
  stdin.isTTY = false;
  stdin.end("piped context");

  let submitted: unknown;
  const ctx = createContext(["--prompt", "summarize"], stdin as NodeJS.ReadStream);
  const code = await run(
    ctx,
    createPromptDeps({
      createZCodeApp: () =>
        ({
          sessionId: "session-test",
          traceId: "trace-test",
          runtime: {} as never,
          submitPrompt: async (prompt: unknown) => {
            submitted = prompt;
            return {
              events: [],
              projection: fakeProjection as never,
              response: "ok",
              traceId: "trace-test" as never,
              turnId: "turn-test" as never,
            };
          },
        }) as never,
    }),
  );

  assert.equal(code, 0);
  assert.equal(submitted, "piped context\n\nsummarize");
  assert.equal(ctx.stdout.output(), "ok\n");
});

test("--timeout aborts a hanging submitPrompt with exit 2", async () => {
  const ctx = createContext(["--prompt", "hang", "--timeout", "1"]);
  const code = await run(
    ctx,
    createPromptDeps({
      createZCodeApp: () =>
        ({
          sessionId: "session-test",
          traceId: "trace-test",
          runtime: {} as never,
          close: async () => undefined,
          submitPrompt: async (_prompt: unknown, options?: { abortSignal?: AbortSignal }) => {
            await new Promise<never>((_resolve, reject) => {
              const signal = options?.abortSignal;
              if (!signal) return;
              if (signal.aborted) {
                reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)));
                return;
              }
              signal.addEventListener(
                "abort",
                () => {
                  reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)));
                },
                { once: true },
              );
            });
          },
        }) as never,
      exitProcess: () => undefined,
      shutdownCleanupTimeoutMs: 50,
    }),
  );

  assert.equal(code, 2);
  assert.match(ctx.stderr.output(), /timed out after 1s/);
  assert.equal(ctx.stdout.output(), "");
  process.exitCode = undefined;
});

test("provider-style API errors still exit 1", async () => {
  const ctx = createContext(["--prompt", "boom"]);
  const code = await run(
    ctx,
    createPromptDeps({
      createZCodeApp: () =>
        ({
          sessionId: "session-test",
          traceId: "trace-test",
          runtime: {} as never,
          submitPrompt: async () => {
            const error = new Error("AI_APICallError: unreachable");
            error.name = "AI_APICallError";
            throw error;
          },
        }) as never,
    }),
  );

  assert.equal(code, 1);
  assert.match(ctx.stderr.output(), /AI_APICallError/);
});

test("--model provider/model is passed to createZCodeApp runtimeConfig", async () => {
  const ctx = createContext(["--prompt", "hi", "--model", "zai/glm-5.1"]);
  let seen: unknown;
  const code = await run(
    ctx,
    createPromptDeps({
      createZCodeApp: (options) => {
        seen = options?.runtimeConfig?.modelSelection;
        return {
          sessionId: "session-test",
          traceId: "trace-test",
          runtime: {} as never,
          submitPrompt: async () => ({
            events: [],
            projection: fakeProjection as never,
            response: "hi",
            traceId: "trace-test" as never,
            turnId: "turn-test" as never,
          }),
        } as never;
      },
    }),
  );

  assert.equal(code, 0);
  assert.deepEqual(seen, { providerId: "zai", modelId: "glm-5.1" });
});

test("--model without provider exits 1", async () => {
  const ctx = createContext(["--prompt", "hi", "--model", "glm-5.1"]);
  const code = await run(ctx, createPromptDeps());
  assert.equal(code, 1);
  assert.match(ctx.stderr.output(), /--model must be <provider\/model>/);
});

test("--no-session conflicts with --continue", async () => {
  const ctx = createContext(["--prompt", "hi", "--no-session", "--continue"]);
  const code = await run(ctx, createPromptDeps());
  assert.equal(code, 1);
  assert.match(ctx.stderr.output(), /--no-session cannot be used with --resume or --continue/);
});

test("--no-session injects a temp sessionStore and cleans it up", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcp-nosession-test-"));
  const previousTmp = process.env.TMPDIR;
  process.env.TMPDIR = root;
  let injectedPath: string | undefined;

  try {
    const ctx = createContext(["--prompt", "hi", "--no-session", "--json"]);
    const code = await run(
      ctx,
      createPromptDeps({
        createZCodeApp: (options) => {
          const store = options?.sessionStore as { getDatabasePath?: () => string } | undefined;
          injectedPath = store?.getDatabasePath?.();
          assert.ok(injectedPath);
          assert.match(injectedPath, new RegExp(NO_SESSION_TEMP_PREFIX));
          return {
            sessionId: "session-ephemeral",
            traceId: "trace-test",
            runtime: {} as never,
            close: async () => undefined,
            submitPrompt: async () => ({
              events: [],
              projection: fakeProjection as never,
              response: "hi",
              traceId: "trace-test" as never,
              turnId: "turn-test" as never,
            }),
          } as never;
        },
      }),
    );

    assert.equal(code, 0);
    assert.match(ctx.stdout.output(), /"sessionId": "session-ephemeral"/);
    await delay(20);
    if (injectedPath) {
      await assert.rejects(open(injectedPath, "r"));
    }
  } finally {
    if (previousTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previousTmp;
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanupStaleNoSessionStores removes old temp DBs", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcp-nosession-sweep-"));
  const stale = join(root, `${NO_SESSION_TEMP_PREFIX}old.sqlite`);
  const fresh = join(root, `${NO_SESSION_TEMP_PREFIX}new.sqlite`);
  await writeFile(stale, "old");
  await writeFile(fresh, "new");
  const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await utimes(stale, oldTime, oldTime);

  await cleanupStaleNoSessionStores(root, 60 * 60 * 1000);
  await assert.rejects(open(stale, "r"));
  await open(fresh, "r").then((handle) => handle.close());
  await rm(root, { recursive: true, force: true });
});
