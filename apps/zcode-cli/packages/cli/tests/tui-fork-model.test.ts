import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelSelection } from "@zcode/shared";
import type { CommandCenterApp } from "../src/command-center.js";
import {
  applyForkModelCarryOver,
  applyForkSessionTitle,
  formatForkSessionTitle,
  readForkModelCarryOver,
  switchToForkedSession,
} from "../src/tui-fork-model.js";

function appWithModel(selection?: ModelSelection): CommandCenterApp & {
  writes: ModelSelection[];
} {
  let current = selection;
  const writes: ModelSelection[] = [];
  return {
    sessionId: "sess",
    traceId: "trace",
    writes,
    getCurrentModelOption: () =>
      current
        ? {
            ref: { providerId: current.providerId, modelId: current.modelId },
            label: current.modelId,
            providerLabel: current.providerId,
            reasoning: {
              levels: [
                { value: "low", label: "Low" },
                { value: "high", label: "High" },
              ],
              defaultLevel: "high",
            },
            properties: {
              inputFormat: {
                supportsText: true,
                supportsImage: false,
                supportsVideo: false,
                supportsAudio: false,
                supportsPdf: false,
              },
              outputFormat: { supportsText: true },
            },
          }
        : undefined,
    getThoughtLevel: () => current?.options?.reasoningLevel,
    setModel: async (value) => {
      assert.notEqual(typeof value, "string");
      const next = value as ModelSelection;
      writes.push(next);
      current = next;
      return { model: `${next.providerId}/${next.modelId}` };
    },
    resume: async () => ({
      appliedMessageCount: 0,
      directory: ".",
      interruptedToolCount: 0,
      messageCount: 0,
      partCount: 0,
    }),
    submitPrompt: async () => ({ response: "ok" }),
  };
}

test("readForkModelCarryOver snapshots provider, model, and reasoning", () => {
  const selection = {
    providerId: "personal",
    modelId: "vendor/model$literal:free",
    options: { reasoningLevel: "low" },
  };
  assert.deepEqual(readForkModelCarryOver(appWithModel(selection)), {
    providerId: "personal",
    modelId: "vendor/model$literal:free",
    reasoningLevel: "low",
  });
});

test("readForkModelCarryOver falls back to catalog default reasoning", () => {
  const selection = {
    providerId: "personal",
    modelId: "vendor/model$literal:free",
  };
  assert.deepEqual(readForkModelCarryOver(appWithModel(selection)), {
    providerId: "personal",
    modelId: "vendor/model$literal:free",
    reasoningLevel: "high",
  });
});

test("readForkModelCarryOver is undefined when the parent has no model", () => {
  assert.equal(readForkModelCarryOver(appWithModel()), undefined);
});

test("applyForkModelCarryOver reuses setModel on the forked app", async () => {
  const forked = appWithModel();
  await applyForkModelCarryOver(forked, {
    providerId: "personal",
    modelId: "vendor/model$literal:free",
    reasoningLevel: "low",
  });
  assert.deepEqual(forked.writes, [
    {
      providerId: "personal",
      modelId: "vendor/model$literal:free",
      options: { reasoningLevel: "low" },
    },
  ]);
  assert.equal(forked.getThoughtLevel?.(), "low");
});

test("applyForkModelCarryOver no-ops without a selection", async () => {
  const forked = appWithModel();
  await applyForkModelCarryOver(forked, undefined);
  assert.deepEqual(forked.writes, []);
});

test("formatForkSessionTitle uses bracket prefix instead of Fork of", () => {
  assert.equal(formatForkSessionTitle("执行下 pwd"), "[Fork] 执行下 pwd");
});

test("applyForkSessionTitle renames via setCustomSessionTitle", async () => {
  let renamed: string | undefined;
  const title = await applyForkSessionTitle(
    {
      sessionId: "sess_child",
      setCustomSessionTitle: async (input: { title: string }) => {
        renamed = input.title;
      },
    } as never,
    "原标题",
  );
  assert.equal(title, "[Fork] 原标题");
  assert.equal(renamed, "[Fork] 原标题");
});

test("switchToForkedSession carries model and renames child title", async () => {
  let setModelArgs: unknown;
  let renamed: string | undefined;
  let forkOptions: unknown;
  const result = await switchToForkedSession({
    activeApp: {
      sessionId: "sess_parent",
      getCurrentModelOption: () => ({
        ref: { providerId: "zai", modelId: "glm-4" },
        reasoning: { defaultLevel: "high" },
      }),
      getThoughtLevel: () => "high",
      runtime: {
        sessionStore: {
          getSession: async () => ({ title: "原标题" }),
        },
      },
      forkFromCheckpoint: async (options) => {
        forkOptions = options;
        return {
          copiedMessageCount: 2,
          forkedSessionId: "sess_child",
          response: "Forked session sess_child",
          restoredFiles: [],
        };
      },
    } as never,
    forkOptions: { targetMessageId: "msg_a1" },
    replaceWithForkedApp: async (forkedSessionId) =>
      ({
        sessionId: forkedSessionId,
        setModel: async (selection: unknown) => {
          setModelArgs = selection;
          return { model: "glm-4" };
        },
        setCustomSessionTitle: async (input: { title: string }) => {
          renamed = input.title;
        },
      }) as never,
  });

  assert.deepEqual(forkOptions, { targetMessageId: "msg_a1" });
  assert.equal(result.forkedSessionId, "sess_child");
  assert.equal(result.title, "[Fork] 原标题");
  assert.equal(renamed, "[Fork] 原标题");
  assert.deepEqual(setModelArgs, {
    providerId: "zai",
    modelId: "glm-4",
    options: { reasoningLevel: "high" },
  });
});
