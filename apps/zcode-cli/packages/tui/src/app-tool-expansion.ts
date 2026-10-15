import type { KeyEvent } from "@mbears/opentui-core";
import type { Message } from "./app-model.js";
import { isQuietPlanOrQuestionTool } from "./app-tool-summary.js";

export const TOOL_EXPANSION_HOTKEY = "Ctrl+E";

type ToolSummaryExpansionListener = (expanded: boolean) => void;

// shortcut: module broadcast instead of prop-drilling through ContentPane; upgrade to React context if multi-root TUI appears.
let toolSummariesExpanded = false;
const listeners = new Set<ToolSummaryExpansionListener>();

/**
 * `Ctrl+E` toggles every work-tool summary row.
 * Draft must be empty: OpenTUI textarea binds the same chord to `line-end` while editing.
 */
export function toolExpansionActionFor({
  key,
  draftValue,
  hasSummaries,
}: {
  key: KeyEvent;
  draftValue: string;
  hasSummaries: boolean;
}): "toggle" | undefined {
  if (!isToolExpansionHotkey(key)) return undefined;
  if (draftValue.length > 0 || !hasSummaries) return undefined;
  return "toggle";
}

export function isToolExpansionHotkey(
  key: Pick<KeyEvent, "ctrl" | "meta" | "shift" | "name">,
): boolean {
  return (
    key.ctrl === true &&
    key.meta !== true &&
    key.shift !== true &&
    key.name?.toLowerCase() === "e"
  );
}

export function messagesHaveWorkToolSummaries(messages: readonly Message[]): boolean {
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (part.type !== "tool") continue;
      if (!isQuietPlanOrQuestionTool(part.toolName)) return true;
    }
  }
  return false;
}

export function getToolSummariesExpanded(): boolean {
  return toolSummariesExpanded;
}

export function toggleAllToolSummaries(): boolean {
  toolSummariesExpanded = !toolSummariesExpanded;
  for (const listener of listeners) listener(toolSummariesExpanded);
  return toolSummariesExpanded;
}

export function subscribeToolSummariesExpanded(
  listener: ToolSummaryExpansionListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetToolSummariesExpansionForTests(): void {
  toolSummariesExpanded = false;
  listeners.clear();
}
