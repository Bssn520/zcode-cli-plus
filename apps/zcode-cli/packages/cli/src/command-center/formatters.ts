import type { CommandCenterApp, CommandCenterForkResult } from "./types.js";

export function formatResumeResult(
  sessionId: string,
  result: Awaited<ReturnType<CommandCenterApp["resume"]>>,
): string {
  return [
    `Resumed session ${sessionId}.`,
    `Directory: ${result.directory}`,
    `Messages: ${result.appliedMessageCount}/${result.messageCount}; parts: ${result.partCount}; interrupted tools: ${result.interruptedToolCount}`,
  ].join("\n");
}

export function formatNewSessionResult(sessionId: string): string {
  return `Started new session ${sessionId}.`;
}

export function formatForkSwitchResult(result: CommandCenterForkResult): string {
  const title = result.title?.trim() || result.forkedSessionId;
  // tip 走 agent Markdown 渲染；不转义时 [Fork] 会被当成 link label 丢掉方括号
  return `已 Fork 到新会话：${escapeMarkdownLinkLabels(title)}`;
}

function escapeMarkdownLinkLabels(text: string): string {
  return text.replaceAll(/[\[\]]/g, "\\$&");
}
