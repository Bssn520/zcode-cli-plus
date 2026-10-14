import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelSelection } from "@zcode/shared";
import type { CommandCenterApp } from "../src/command-center.js";
import {
  applyForkModelCarryOver,
  readForkModelCarryOver,
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
