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
