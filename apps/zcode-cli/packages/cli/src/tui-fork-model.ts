import type { CommandCenterApp } from "./command-center.js";

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
