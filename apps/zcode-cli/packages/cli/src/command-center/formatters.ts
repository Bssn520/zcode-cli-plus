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
  // tip 在 TUI 以 plain text 渲染；勿 Markdown 转义——OpenTUI conceal 不吃 \[，反斜杠会原样显示
  return `已 Fork 到新会话：${title}`;
}
