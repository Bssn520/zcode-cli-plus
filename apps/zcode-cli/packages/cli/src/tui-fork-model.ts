import type { CommandCenterApp, CommandCenterForkResult } from "./command-center.js";

/** Snapshot of the parent session model to re-apply after a legacy workspace fork. */
export type ForkModelCarryOver = {
  modelId: string;
  providerId: string;
  reasoningLevel: string;
};

export function readForkModelCarryOver(app: CommandCenterApp): ForkModelCarryOver | undefined {
  const currentOption = app.getCurrentModelOption?.();
  const thoughtLevel = app.getThoughtLevel?.() ?? currentOption?.reasoning?.defaultLevel;
  if (!currentOption?.ref || !thoughtLevel) return undefined;
  return {
    modelId: currentOption.ref.modelId,
    providerId: currentOption.ref.providerId,
    reasoningLevel: thoughtLevel,
  };
}

/** legacy forkWorkspaceFromCheckpoint 不写 modelSelectionEntry；用现有 setModel 补上父会话选型。 */
export async function applyForkModelCarryOver(
  app: CommandCenterApp,
  selection: ForkModelCarryOver | undefined,
): Promise<void> {
  if (!selection || !app.setModel) return;
  await app.setModel({
    providerId: selection.providerId,
    modelId: selection.modelId,
    options: { reasoningLevel: selection.reasoningLevel },
  });
}

/** Core 生成 `Fork of <title>`；CLI 层改成 `[Fork] <title>`，不改 session-fork.ts。 */
export function formatForkSessionTitle(parentTitle: string): string {
  return `[Fork] ${parentTitle}`;
}

export async function readAppSessionTitle(app: CommandCenterApp): Promise<string | undefined> {
  const withRuntime = app as CommandCenterApp & {
    runtime?: {
      sessionStore?: {
        getSession?(id: string): Promise<{ title?: string } | null | undefined>;
      };
    };
  };
  try {
    const session = await withRuntime.runtime?.sessionStore?.getSession?.(app.sessionId);
    const title = session?.title?.trim();
    return title || undefined;
  } catch {
    return undefined;
  }
}

export async function applyForkSessionTitle(
  app: CommandCenterApp,
  parentTitle: string,
): Promise<string> {
  const title = formatForkSessionTitle(parentTitle);
  const withRename = app as CommandCenterApp & {
    setCustomSessionTitle?: (input: { title: string }) => Promise<void>;
  };
  // App 实际是 bootstrap ZCodeApp；CommandCenterApp 类型未暴露 rename。
  await withRename.setCustomSessionTitle?.({ title });
  return title;
}

export async function switchToForkedSession(input: {
  activeApp: CommandCenterApp;
  forkOptions?: { targetCheckpointId?: string; targetMessageId?: string };
  replaceWithForkedApp: (forkedSessionId: string) => Promise<CommandCenterApp>;
}): Promise<CommandCenterForkResult> {
  const modelCarryOver = readForkModelCarryOver(input.activeApp);
  const parentTitle =
    (await readAppSessionTitle(input.activeApp)) ?? input.activeApp.sessionId;
  const result = await input.activeApp.forkFromCheckpoint?.(input.forkOptions);
  if (!result) {
    throw new Error("Forking is not available in this client.");
  }
  const forkedApp = await input.replaceWithForkedApp(result.forkedSessionId);
  await applyForkModelCarryOver(forkedApp, modelCarryOver);
  const title = await applyForkSessionTitle(forkedApp, parentTitle);
  return {
    copiedMessageCount: result.copiedMessageCount,
    forkedSessionId: result.forkedSessionId,
    restoredFileCount: result.restoredFileCount ?? result.restoredFiles?.length ?? 0,
    title,
    response: `${result.response}\nSwitched to forked session ${result.forkedSessionId}.`,
  };
}
