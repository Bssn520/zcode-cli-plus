import assert from "node:assert/strict";
import test from "node:test";
import type { KeyEvent } from "@mbears/opentui-core";
import type { AskUserQuestionInput, PermissionBrokerResult } from "@zcode/contracts";
import { createQuestionPromptState, handleQuestionKey } from "../src/app-question-state.js";
import type { ApprovalPrompt } from "../src/app-model.js";

const input: AskUserQuestionInput = {
  questions: [
    {
      question: "Which approach?",
      header: "Approach",
      multiSelect: false,
      options: [
        { label: "Fast", description: "Optimize for speed." },
        { label: "Safe", description: "Optimize for safety." },
      ],
    },
    {
      question: "Which safeguard?",
      header: "Safeguard",
      multiSelect: false,
      options: [
        { label: "Tests", description: "Add tests." },
        { label: "Docs", description: "Add docs." },
      ],
    },
  ],
};

test("skips an intermediate question and submits on the last answer", () => {
  const harness = createHarness();

  harness.press("s");
  assert.equal(harness.state.currentQuestionIndex, 1);
  assert.deepEqual(harness.state.answers, {});

  harness.press("return");

  assert.deepEqual(harness.result?.modifiedInput, {
    annotations: {},
    answers: { "Which safeguard?": "Tests" },
    questions: input.questions,
  });
  assert.equal(harness.queueLength, 0);
});

test("submits zero answers after every question is skipped", () => {
  const harness = createHarness();

  harness.press("s");
  harness.press("s");

  assert.deepEqual(harness.result?.modifiedInput, {
    annotations: {},
    answers: {},
    questions: input.questions,
  });
  assert.equal(harness.queueLength, 0);
});

test("single question submits immediately without a review step", () => {
  const single: AskUserQuestionInput = {
    questions: [input.questions[0]!],
  };
  const harness = createHarness(single);

  harness.press("down");
  harness.press("return");

  assert.deepEqual(harness.result?.modifiedInput, {
    annotations: {},
    answers: { "Which approach?": "Safe" },
    questions: single.questions,
  });
  assert.equal(harness.queueLength, 0);
});

test("multi-question answers submit when the last question is answered", () => {
  const harness = createHarness();

  harness.press("down");
  harness.press("return");
  assert.equal(harness.state.currentQuestionIndex, 1);
  assert.equal(harness.result, undefined);

  harness.press("return");

  assert.deepEqual(harness.result?.modifiedInput, {
    annotations: {},
    answers: {
      "Which approach?": "Safe",
      "Which safeguard?": "Tests",
    },
    questions: input.questions,
  });
});

function createHarness(questionInput: AskUserQuestionInput = input): {
  readonly queueLength: number;
  readonly result: PermissionBrokerResult | undefined;
  readonly state: NonNullable<ApprovalPrompt["questionState"]>;
  press: (name: string) => void;
} {
  let result: PermissionBrokerResult | undefined;
  let queue: ApprovalPrompt[] = [];
  const approval: ApprovalPrompt = {
    cleanup: () => undefined,
    questionState: createQuestionPromptState(questionInput),
    reject: () => undefined,
    request: {} as ApprovalPrompt["request"],
    resolve: (value) => {
      result = value;
    },
    selectedDecision: "allow_once",
  };
  queue = [approval];
  const setQueue = (update: React.SetStateAction<ApprovalPrompt[]>) => {
    queue = typeof update === "function" ? update(queue) : update;
  };

  return {
    get queueLength() {
      return queue.length;
    },
    get result() {
      return result;
    },
    get state() {
      const current = queue[0];
      assert.ok(current?.questionState);
      return current.questionState;
    },
    press(name) {
      const current = queue[0];
      assert.ok(current);
      handleQuestionKey({ name, sequence: name } as KeyEvent, current, setQueue, () => undefined);
    },
  };
}
