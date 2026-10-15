import type { ModelSelection } from "@zcode/shared";

export type CliModelSelection = Pick<ModelSelection, "providerId" | "modelId">;

/** First-version `--model` accepts only `provider/model` (no bare ids). */
export function parseCliModelOption(value: string): CliModelSelection {
  const normalized = value.trim();
  const separator = normalized.indexOf("/");
  if (separator <= 0 || separator >= normalized.length - 1) {
    throw new Error(`--model must be <provider/model> (received: ${value}).`);
  }
  const providerId = normalized.slice(0, separator).trim();
  const modelId = normalized.slice(separator + 1).trim();
  if (!providerId || !modelId) {
    throw new Error(`--model must be <provider/model> (received: ${value}).`);
  }
  return { providerId, modelId };
}

/**
 * `--model` 是用户主动选型：补齐与 TUI/completeNewModelSelection 相同的默认档
 * （catalog reasoning.values 最后一档）。无档位时不写 options，交给后续校验。
 */
export function completeCliModelSelection(
  selection: CliModelSelection,
  reasoningValues: readonly string[] | undefined,
): ModelSelection {
  const reasoningLevel = reasoningValues?.at(-1);
  if (!reasoningLevel) {
    return { providerId: selection.providerId, modelId: selection.modelId };
  }
  return {
    providerId: selection.providerId,
    modelId: selection.modelId,
    options: { reasoningLevel },
  };
}

/** Positive whole seconds for `--timeout`. */
export function parseCliTimeoutSeconds(value: string): number {
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`--timeout must be a positive integer number of seconds (received: ${value}).`);
  }
  const seconds = Number.parseInt(value, 10);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error(`--timeout must be a positive integer number of seconds (received: ${value}).`);
  }
  return seconds;
}

export function createTimeoutError(seconds: number): Error {
  return new Error(`timed out after ${seconds}s`);
}

export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /^timed out after \d+s$/.test(error.message);
}
