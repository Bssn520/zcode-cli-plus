import type { PermissionBrokerResult, SupportedLocale } from "@zcode/contracts";
import type { KeyEvent } from "@mbears/opentui-core";
import type React from "react";
import { getZCodeCopy } from "@zcode/i18n";
import { printableInputText, printableKey } from "./app-input.js";
import type { ApprovalPrompt, PlanApprovalFocus, PlanApprovalState } from "./app-model.js";
import {
  activePlanPreviewPageSize,
  scrollActivePlanPreview,
} from "./app-plan-preview-scroll.js";
import {
  openMermaidPreviewInBrowser,
  type MermaidPreviewOpenResult,
} from "./app-mermaid-preview.js";

export function createPlanApprovalState(plan: string): PlanApprovalState {
  return {
    draftPlan: plan,
    feedbackBuffer: "",
    focus: "approve",
    originalPlan: plan,
  };
}

export function createPlanApprovalResult(): PermissionBrokerResult {
  return {
    decision: "allow",
    reason: "Approved plan in TUI",
    resolvedAt: new Date(),
  };
}

export function composePlanFeedbackReason(feedback: string): string {
  return ["Plan feedback:", `- [general] ${feedback}`].join("\n");
}

export function handlePlanApprovalKey(
  key: KeyEvent,
  approval: ApprovalPrompt,
  setApprovalQueue: React.Dispatch<React.SetStateAction<ApprovalPrompt[]>>,
  setStatus: (status: string) => void,
  options?: {
    locale?: SupportedLocale;
    openMermaidPreview?: (
      markdown: string,
    ) => MermaidPreviewOpenResult | Promise<MermaidPreviewOpenResult>;
    previewPageSize?: number;
    scrollPlanPreview?: (deltaY: number) => void;
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

  if (key.name === "escape") {
    resolvePlanApproval(approval, setApprovalQueue, setStatus, {
      decision: "deny",
      reason: "Denied plan in TUI",
      resolvedAt: new Date(),
    });
    return;
  }

  if (key.name === "tab" || key.name === "up" || key.name === "down") {
    update((draft) => {
      draft.focus = togglePlanApprovalFocus(draft.focus);
      draft.statusMessage = undefined;
    });
    return;
  }

  if (key.name === "return") {
    if (state.focus === "feedback") {
      const feedback = state.feedbackBuffer.trim();
      if (!feedback) return;
      sendPlanApprovalFeedback(approval, feedback, setApprovalQueue, setStatus);
      return;
    }
    resolvePlanApproval(approval, setApprovalQueue, setStatus, createPlanApprovalResult());
    return;
  }

  if (key.name === "pageup" || key.name === "pagedown") {
    const pageSize = Math.max(1, options?.previewPageSize ?? activePlanPreviewPageSize());
    const delta = key.name === "pageup" ? -pageSize : pageSize;
    (options?.scrollPlanPreview ?? scrollActivePlanPreview)(delta);
    return;
  }

  if (state.focus === "feedback") {
    if (key.name === "backspace") {
      update((draft) => {
        draft.feedbackBuffer = draft.feedbackBuffer.slice(0, -1);
      });
      return;
    }
    const text = printableInputText(key);
    if (!text) return;
    update((draft) => {
      draft.feedbackBuffer += text;
      draft.statusMessage = undefined;
    });
    return;
  }

  // Ephemeral status (mermaid open result): dismiss on the next browse key.
  if (state.statusMessage) {
    update((draft) => {
      draft.statusMessage = undefined;
    });
  }

  const character = printableKey(key)?.toLowerCase();
  if (key.shift || character !== "o") return;

  const planCopy = getZCodeCopy(options?.locale ?? "en-US").tui.planApproval;
  void Promise.resolve(
    (options?.openMermaidPreview ?? openMermaidPreviewInBrowser)(state.draftPlan),
  ).then((result) => {
    if (result.kind === "none") {
      update((draft) => {
        draft.statusMessage = planCopy.mermaidNone;
      });
      setStatus(planCopy.mermaidNone);
      return;
    }
    if (result.kind === "failed") {
      const message = planCopy.mermaidOpenFailed(result.message);
      update((draft) => {
        draft.statusMessage = message;
      });
      setStatus(message);
      return;
    }
    update((draft) => {
      draft.statusMessage = planCopy.mermaidOpened;
    });
    setStatus(planCopy.mermaidOpened);
  });
}

export function appendPlanApprovalFeedbackText(
  text: string,
  approval: ApprovalPrompt,
  setApprovalQueue: React.Dispatch<React.SetStateAction<ApprovalPrompt[]>>,
): boolean {
  const state = approval.planApprovalState;
  if (!state || state.focus !== "feedback") return false;
  const chunk = normalizeFeedbackInputText(text);
  if (!chunk) return false;
  setApprovalQueue((current) =>
    current.map((item) => {
      if (item.request.requestId !== approval.request.requestId || !item.planApprovalState) {
        return item;
      }
      if (item.planApprovalState.focus !== "feedback") return item;
      const nextState = clonePlanApprovalState(item.planApprovalState);
      nextState.feedbackBuffer += chunk;
      nextState.statusMessage = undefined;
      return { ...item, planApprovalState: nextState };
    }),
  );
  return true;
}

function normalizeFeedbackInputText(text: string): string {
  return [...text.replace(/\r\n?/g, "\n")]
    .map((char) => (char === "\n" ? " " : char))
    .filter((char) => char >= " " && char !== "\x7f")
    .join("");
}

function sendPlanApprovalFeedback(
  approval: ApprovalPrompt,
  feedback: string,
  setApprovalQueue: React.Dispatch<React.SetStateAction<ApprovalPrompt[]>>,
  setStatus: (status: string) => void,
): void {
  resolvePlanApproval(approval, setApprovalQueue, setStatus, {
    decision: "deny",
    preserveReasonFormatting: true,
    reason: composePlanFeedbackReason(feedback),
    reasonSource: "plan_approval_feedback",
    resolvedAt: new Date(),
  });
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

function togglePlanApprovalFocus(focus: PlanApprovalFocus): PlanApprovalFocus {
  return focus === "approve" ? "feedback" : "approve";
}

function clonePlanApprovalState(state: PlanApprovalState): PlanApprovalState {
  return { ...state };
}
