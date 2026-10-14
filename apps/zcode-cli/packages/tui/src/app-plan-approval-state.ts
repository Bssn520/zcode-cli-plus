import type { PermissionBrokerResult, SupportedLocale } from "@zcode/contracts";
import type { KeyEvent } from "@mbears/opentui-core";
import type React from "react";
import { getZCodeCopy } from "@zcode/i18n";
import { clampIndex, printableInputText, printableKey } from "./app-input.js";
import type { ApprovalPrompt, PlanApprovalComment, PlanApprovalState } from "./app-model.js";
import {
  editPlanInExternalEditor,
  normalizePlanText,
  type SuspendTerminal,
} from "./app-plan-editor.js";
import { parsePlanPreview } from "./app-plan-parse.js";

let nextCommentId = 1;

export function createPlanApprovalState(plan: string): PlanApprovalState {
  return {
    commentBuffer: "",
    comments: [],
    commentTarget: null,
    draftPlan: plan,
    mode: "browse",
    originalPlan: plan,
    selectedCommentIndex: 0,
    selectedStepIndex: 0,
  };
}

export function createPlanApprovalResult(input: {
  locale?: SupportedLocale;
  requestInput: unknown;
  state: PlanApprovalState;
}): PermissionBrokerResult {
  const modified = isPlanDraftModified(input.state);
  if (!modified) {
    return {
      decision: "allow",
      reason: "Approved plan in TUI",
      resolvedAt: new Date(),
    };
  }

  const baseInput =
    input.requestInput && typeof input.requestInput === "object"
      ? { ...(input.requestInput as Record<string, unknown>) }
      : {};
  return {
    decision: "modify",
    modifiedInput: {
      ...baseInput,
      plan: input.state.draftPlan,
    },
    reason: modifiedPlanReason(input.locale),
    resolvedAt: new Date(),
  };
}

export function composePlanFeedbackReason(comments: readonly PlanApprovalComment[]): string {
  const lines = comments.map((comment) => {
    if (comment.kind === "step") {
      const index = (comment.stepIndex ?? 0) + 1;
      const label = comment.stepLabel?.trim() || `step ${index}`;
      return `- [step ${index}] ${label}: ${comment.text}`;
    }
    return `- [general] ${comment.text}`;
  });
  return ["Plan feedback:", ...lines].join("\n");
}

export function isPlanDraftModified(state: PlanApprovalState): boolean {
  const draft = normalizePlanText(state.draftPlan);
  if (draft.length === 0) return false;
  return draft !== normalizePlanText(state.originalPlan);
}

export function handlePlanApprovalKey(
  key: KeyEvent,
  approval: ApprovalPrompt,
  setApprovalQueue: React.Dispatch<React.SetStateAction<ApprovalPrompt[]>>,
  setStatus: (status: string) => void,
  options?: {
    editPlan?: typeof editPlanInExternalEditor;
    locale?: SupportedLocale;
    suspendTerminal?: SuspendTerminal;
  },
): void {
  const state = approval.planApprovalState;
  if (!state) return;

  const update = (recipe: (draft: PlanApprovalState) => void) => {
    // 根因：同一次渲染里连续按键会共用旧的 approval 引用；按对象身份匹配时，
    // 第一次 update 换掉队列项后后续字符全部丢失。改为 requestId 匹配。
    setApprovalQueue((current) =>
      current.map((item) => {
        if (item.request.requestId !== approval.request.requestId || !item.planApprovalState) {
          return item;
        }
        const nextState = clonePlanApprovalState(item.planApprovalState);
        recipe(nextState);
        return { ...item, planApprovalState: nextState };
      }),
    );
  };

  if (state.mode === "comment") {
    handleCommentKey(key, update, setStatus);
    return;
  }
  if (state.mode === "review") {
    handleReviewKey(key, approval, state, update, setApprovalQueue, setStatus);
    return;
  }

  if (key.name === "escape") {
    resolvePlanApproval(approval, setApprovalQueue, setStatus, {
      decision: "deny",
      reason: "Denied plan in TUI",
      resolvedAt: new Date(),
    });
    return;
  }

  if (key.name === "return") {
    resolvePlanApproval(
      approval,
      setApprovalQueue,
      setStatus,
      createPlanApprovalResult({
        locale: options?.locale,
        requestInput: approval.request.input,
        state,
      }),
    );
    return;
  }

  if (key.ctrl && !key.meta && key.name === "g") {
    const edit = options?.editPlan ?? editPlanInExternalEditor;
    const result = edit({
      plan: state.draftPlan,
      suspendTerminal: options?.suspendTerminal,
    });
    if (result.status === "updated") {
      update((draft) => {
        draft.draftPlan = result.plan;
        draft.selectedStepIndex = 0;
        draft.statusMessage = undefined;
      });
      setStatus("Plan updated from editor.");
      return;
    }
    if (result.status === "empty" || result.status === "unchanged") {
      update((draft) => {
        draft.statusMessage = undefined;
      });
      setStatus(
        result.status === "empty"
          ? "Editor saved empty plan; kept previous draft."
          : "Plan unchanged.",
      );
      return;
    }
    const planCopy = getZCodeCopy(options?.locale ?? "en-US").tui.planApproval;
    const message =
      result.kind === "not_found"
        ? planCopy.editorNotFound
        : planCopy.editorFailed(result.message);
    update((draft) => {
      draft.statusMessage = message;
    });
    setStatus(message);
    return;
  }

  // Ephemeral editor hint: dismiss on the next key after Ctrl+G failure.
  if (state.statusMessage) {
    update((draft) => {
      draft.statusMessage = undefined;
    });
  }

  const character = printableKey(key)?.toLowerCase();
  const steps = parsePlanPreview(state.draftPlan).steps;

  if (key.name === "up" || character === "k") {
    if (steps.length === 0) return;
    update((draft) => {
      draft.selectedStepIndex = clampIndex(draft.selectedStepIndex - 1, steps.length);
    });
    return;
  }
  if (key.name === "down" || character === "j") {
    if (steps.length === 0) return;
    update((draft) => {
      draft.selectedStepIndex = clampIndex(draft.selectedStepIndex + 1, steps.length);
    });
    return;
  }

  // Leader key map: lowercase only — no e / Shift+f bindings.
  if (!key.shift && character === "f") {
    if (steps.length === 0) {
      setStatus("No steps to comment on.");
      return;
    }
    update((draft) => {
      draft.mode = "comment";
      draft.commentBuffer = "";
      draft.commentTarget = {
        kind: "step",
        stepIndex: clampIndex(draft.selectedStepIndex, steps.length),
      };
    });
    setStatus("Type feedback for the selected step. Enter attaches, Esc cancels.");
    return;
  }

  if (!key.shift && character === "g") {
    update((draft) => {
      draft.mode = "comment";
      draft.commentBuffer = "";
      draft.commentTarget = { kind: "overall" };
    });
    setStatus("Type overall plan feedback. Enter attaches, Esc cancels.");
    return;
  }

  if (!key.shift && character === "r") {
    if (state.comments.length === 0) {
      setStatus("No comments to review.");
      return;
    }
    update((draft) => {
      draft.mode = "review";
      draft.selectedCommentIndex = 0;
    });
    setStatus("Review comments. Enter sends, d deletes, Esc back.");
  }
}

function handleCommentKey(
  key: KeyEvent,
  update: (recipe: (draft: PlanApprovalState) => void) => void,
  setStatus: (status: string) => void,
): void {
  if (key.name === "escape") {
    update((draft) => {
      draft.mode = "browse";
      draft.commentBuffer = "";
      draft.commentTarget = null;
    });
    setStatus("Comment cancelled.");
    return;
  }

  if (key.name === "return") {
    let attached = false;
    update((draft) => {
      const text = draft.commentBuffer.trim();
      const target = draft.commentTarget;
      if (!text || !target) return;
      const steps = parsePlanPreview(draft.draftPlan).steps;
      const comment: PlanApprovalComment =
        target.kind === "step"
          ? {
              id: `c${nextCommentId++}`,
              kind: "step",
              stepIndex: target.stepIndex,
              stepLabel: steps[target.stepIndex],
              text,
            }
          : {
              id: `c${nextCommentId++}`,
              kind: "overall",
              text,
            };
      draft.comments = [...draft.comments, comment];
      draft.mode = "browse";
      draft.commentBuffer = "";
      draft.commentTarget = null;
      attached = true;
    });
    setStatus(attached ? "Comment attached." : "Comment cannot be empty.");
    return;
  }

  if (key.name === "backspace") {
    update((draft) => {
      draft.commentBuffer = draft.commentBuffer.slice(0, -1);
    });
    return;
  }

  const text = printableInputText(key);
  if (!text) return;
  update((draft) => {
    draft.commentBuffer += text;
  });
}

export function appendPlanApprovalCommentText(
  text: string,
  approval: ApprovalPrompt,
  setApprovalQueue: React.Dispatch<React.SetStateAction<ApprovalPrompt[]>>,
): boolean {
  const state = approval.planApprovalState;
  if (!state || state.mode !== "comment") return false;
  const chunk = normalizeCommentInputText(text);
  if (!chunk) return false;
  setApprovalQueue((current) =>
    current.map((item) => {
      if (item.request.requestId !== approval.request.requestId || !item.planApprovalState) {
        return item;
      }
      if (item.planApprovalState.mode !== "comment") return item;
      const nextState = clonePlanApprovalState(item.planApprovalState);
      nextState.commentBuffer += chunk;
      return { ...item, planApprovalState: nextState };
    }),
  );
  return true;
}

function normalizeCommentInputText(text: string): string {
  return [...text.replace(/\r\n?/g, "\n")]
    .map((char) => (char === "\n" ? " " : char))
    .filter((char) => char >= " " && char !== "\x7f")
    .join("");
}

function handleReviewKey(
  key: KeyEvent,
  approval: ApprovalPrompt,
  state: PlanApprovalState,
  update: (recipe: (draft: PlanApprovalState) => void) => void,
  setApprovalQueue: React.Dispatch<React.SetStateAction<ApprovalPrompt[]>>,
  setStatus: (status: string) => void,
): void {
  if (key.name === "escape") {
    update((draft) => {
      draft.mode = "browse";
    });
    setStatus("Back to plan approval.");
    return;
  }

  if (key.name === "return") {
    if (state.comments.length === 0) {
      setStatus("No comments to send.");
      return;
    }
    resolvePlanApproval(approval, setApprovalQueue, setStatus, {
      decision: "deny",
      preserveReasonFormatting: true,
      reason: composePlanFeedbackReason(state.comments),
      reasonSource: "plan_approval_feedback",
      resolvedAt: new Date(),
    });
    return;
  }

  const character = printableKey(key)?.toLowerCase();
  if (key.name === "up" || character === "k") {
    update((draft) => {
      draft.selectedCommentIndex = clampIndex(
        draft.selectedCommentIndex - 1,
        Math.max(draft.comments.length, 1),
      );
    });
    return;
  }
  if (key.name === "down" || character === "j") {
    update((draft) => {
      draft.selectedCommentIndex = clampIndex(
        draft.selectedCommentIndex + 1,
        Math.max(draft.comments.length, 1),
      );
    });
    return;
  }

  if (character === "d" || key.name === "delete") {
    update((draft) => {
      if (draft.comments.length === 0) return;
      const index = clampIndex(draft.selectedCommentIndex, draft.comments.length);
      draft.comments = draft.comments.filter((_, i) => i !== index);
      draft.selectedCommentIndex = clampIndex(index, Math.max(draft.comments.length, 1));
      if (draft.comments.length === 0) draft.mode = "browse";
    });
    setStatus("Comment deleted.");
  }
}

function resolvePlanApproval(
  approval: ApprovalPrompt,
  setApprovalQueue: React.Dispatch<React.SetStateAction<ApprovalPrompt[]>>,
  setStatus: (status: string) => void,
  result: PermissionBrokerResult,
): void {
  approval.cleanup();
  approval.resolve(result);
  setApprovalQueue((current) => current.filter((item) => item !== approval));
  if (result.decision === "deny" && result.reasonSource === "plan_approval_feedback") {
    setStatus("Sent plan feedback.");
    return;
  }
  setStatus(
    result.decision === "deny"
      ? `Permission denied for ${approval.request.toolName}.`
      : `Permission approved for ${approval.request.toolName}.`,
  );
}

function modifiedPlanReason(locale: SupportedLocale | undefined): string {
  return locale === "zh-CN" ? "用户已修改计划" : "user modified the plan";
}

function clonePlanApprovalState(state: PlanApprovalState): PlanApprovalState {
  return {
    ...state,
    comments: state.comments.map((comment) => ({ ...comment })),
    commentTarget: state.commentTarget ? { ...state.commentTarget } : null,
  };
}
