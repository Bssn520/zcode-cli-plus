import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssistantMessageSelection,
  buildForkConfirmSelection,
  buildForkSwitchResult,
  parseForkTarget,
  timestampFromMessageId,
} from "../src/command-center/fork-message.js";

import { formatForkSwitchResult } from "../src/command-center/formatters.js";
test("parseForkTarget keeps checkpoint forms and adds message forms", () => {
  assert.deepEqual(parseForkTarget(""), { kind: "checkpoint", checkpointId: undefined });
  assert.deepEqual(parseForkTarget("latest"), { kind: "checkpoint", checkpointId: undefined });
  assert.deepEqual(parseForkTarget("checkpoint_1"), {
    kind: "checkpoint",
    checkpointId: "checkpoint_1",
  });
  assert.deepEqual(parseForkTarget("msg"), { kind: "message-picker" });
  assert.deepEqual(parseForkTarget("message"), { kind: "message-picker" });
  assert.deepEqual(parseForkTarget("msg_abc"), {
    kind: "message",
    messageId: "msg_abc",
    cancelled: false,
    confirmed: false,
  });
  assert.deepEqual(parseForkTarget("msg_abc --confirm"), {
    kind: "message",
    messageId: "msg_abc",
    cancelled: false,
    confirmed: true,
  });
  assert.deepEqual(parseForkTarget("msg_abc --cancel"), {
    kind: "message",
    messageId: "msg_abc",
    cancelled: true,
    confirmed: false,
  });
});

test("buildAssistantMessageSelection shows reply preview not bare ids", () => {
  const selection = buildAssistantMessageSelection([
    { id: "msg_user", role: "user", content: "please write tests" },
    {
      id: "msg_agent_old",
      role: "agent",
      content: "I will write the first batch of coverage for the fork command.",
    },
    {
      id: "msg_agent_new",
      role: "agent",
      content: "Here is a shorter follow-up reply.",
    },
  ]);

  assert.equal(selection.title, "Fork From Assistant Reply");
  assert.equal(selection.items.length, 2);
  assert.equal(selection.items[0]?.id, "msg_agent_new");
  assert.match(selection.items[0]?.primary ?? "", /shorter follow-up/);
  assert.equal(selection.items[0]?.command, "/fork msg_agent_new");
  assert.notEqual(selection.items[0]?.primary, "msg_agent_new");
});

test("generic fork confirm defaults to Cancel and warns about workspace rollback", () => {
  const selection = buildForkConfirmSelection("msg_a1");
  assert.equal(selection.selectedIndex, 0);
  assert.equal(selection.items[0]?.primary, "Cancel");
  assert.equal(selection.items[0]?.command, "/fork msg_a1 --cancel");
  assert.equal(selection.items[1]?.command, "/fork msg_a1 --confirm");
  assert.match(selection.prompt ?? "", /roll back workspace files/i);
});

test("timestampFromMessageId reads sortable msg ids", () => {
  const now = Date.now();
  const messageId = `msg_${now.toString(36)}_deadbeef`;
  assert.equal(timestampFromMessageId(messageId), now);
  assert.equal(timestampFromMessageId("msg_abc"), undefined);
});


test("buildForkSwitchResult reloads child transcript and formats tip title", async () => {
  const result = await buildForkSwitchResult(
    {
      forkApp: async () => {
        throw new Error("forkApp should not run");
      },
      getApp: async () =>
        ({
          sessionId: "sess_child",
          traceId: "trace-child",
          getLocale: () => "zh-CN",
          getModel: () => "glm",
          getThoughtLevel: () => "high",
          loadSessionTranscript: async () => [
            { id: "msg_user", role: "user", content: "before fork" },
            { id: "msg_agent_1", role: "agent", content: "fork point" },
          ],
          resume: async () => {
            throw new Error("resume should not run");
          },
          submitPrompt: async () => {
            throw new Error("prompt should not run");
          },
        }) as never,
      resumeApp: async () => {
        throw new Error("resume should not run");
      },
    },
    {
      forkedSessionId: "sess_child",
      response: "ignored raw fork response",
      title: "[Fork] 原标题",
    },
  );

  assert.equal(result.resetSessionProjection, true);
  assert.equal(result.response, "已 Fork 到新会话：\\[Fork\\] 原标题");
  assert.deepEqual(result.restoredMessages, [
    { id: "msg_user", role: "user", content: "before fork" },
    { id: "msg_agent_1", role: "agent", content: "fork point" },
  ]);
  assert.ok(!(result.restoredMessages ?? []).some((message) => /\/fork/.test(message.content)));
});


test("formatForkSwitchResult escapes [Fork] so Markdown keeps the brackets", () => {
  assert.equal(
    formatForkSwitchResult({ forkedSessionId: "sess_child", title: "[Fork] first TOOLME" }),
    "已 Fork 到新会话：\\[Fork\\] first TOOLME",
  );
  assert.equal(
    formatForkSwitchResult({ forkedSessionId: "sess_child" }),
    "已 Fork 到新会话：sess_child",
  );
});
