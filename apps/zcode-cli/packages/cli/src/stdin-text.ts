/** Piped stdin prepend for `-p/--prompt`. Never consume stdin when the prompt flag is absent. */

export const DEFAULT_STDIN_TEXT_LIMIT_BYTES = 10 * 1024 * 1024;
/** Abandon idle non-TTY stdin if the first byte never arrives (inherited open pipes). */
export const DEFAULT_STDIN_IDLE_TIMEOUT_MS = 1_000;

export class StdinTextTooLargeError extends Error {
  constructor(limitBytes: number) {
    super(`stdin exceeds ${limitBytes} bytes`);
    this.name = "StdinTextTooLargeError";
  }
}

type StdinLike = NodeJS.ReadableStream & {
  isTTY?: boolean;
  pause?: () => void;
  resume?: () => void;
  unref?: () => void;
};

/**
 * Read non-TTY stdin as UTF-8 text up to `limitBytes`.
 * Returns `undefined` for TTY / empty input / idle pipes with no first byte
 * within `idleTimeoutMs`, so callers can keep the prompt unchanged.
 * Once the first byte arrives, reads until EOF (still size-capped).
 */
export async function readStdinTextIfPiped(
  stdin: StdinLike,
  options?: {
    limitBytes?: number;
    idleTimeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<string | undefined> {
  if (stdin.isTTY === true) return undefined;
  // Unit-test stubs often set isTTY=false without implementing a Readable.
  if (typeof stdin.on !== "function" || typeof stdin.removeListener !== "function") {
    return undefined;
  }

  const limitBytes = options?.limitBytes ?? DEFAULT_STDIN_TEXT_LIMIT_BYTES;
  const idleTimeoutMs = options?.idleTimeoutMs ?? DEFAULT_STDIN_IDLE_TIMEOUT_MS;
  const signal = options?.signal;
  if (signal?.aborted) {
    throw abortReason(signal);
  }

  return await new Promise<string | undefined>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    let gotData = false;
    let idleTimer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      idleTimer = undefined;
      stdin.removeListener("data", onData);
      stdin.removeListener("end", onEnd);
      stdin.removeListener("error", onError);
      stdin.removeListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
      // Inherited open pipes must not keep the event loop alive after we give up.
      try {
        stdin.pause?.();
      } catch {
        // ignore
      }
      try {
        stdin.unref?.();
      } catch {
        // ignore
      }
    };

    const finish = (value: string | undefined) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const onAbort = () => fail(abortReason(signal));

    const onData = (chunk: string | Buffer) => {
      if (!gotData) {
        gotData = true;
        if (idleTimer !== undefined) {
          clearTimeout(idleTimer);
          idleTimer = undefined;
        }
      }
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
      total += buf.byteLength;
      if (total > limitBytes) {
        fail(new StdinTextTooLargeError(limitBytes));
        return;
      }
      chunks.push(buf);
    };

    const finalizeText = () => {
      if (chunks.length === 0) {
        finish(undefined);
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8").replace(/\0/g, "");
      finish(text.length > 0 ? text : undefined);
    };

    const onEnd = () => finalizeText();
    const onClose = () => {
      // close without end still ends the read (destroyed / already-ended streams).
      finalizeText();
    };
    const onError = (error: Error) => fail(error);

    stdin.on("data", onData);
    stdin.on("end", onEnd);
    stdin.on("error", onError);
    stdin.on("close", onClose);
    signal?.addEventListener("abort", onAbort, { once: true });

    // Keep the timer referenced: pure PassThrough/test stubs have no fd to hold the loop.
    idleTimer = setTimeout(() => {
      if (!gotData) finish(undefined);
    }, idleTimeoutMs);

    stdin.resume?.();
  });
}

export function combinePromptWithStdin(prompt: string, stdinText: string | undefined): string {
  if (stdinText === undefined) return prompt;
  const trimmedStdin = stdinText.replace(/\s+$/u, "");
  if (trimmedStdin.length === 0) return prompt;
  return `${trimmedStdin}\n\n${prompt}`;
}

function abortReason(signal: AbortSignal | undefined): Error {
  if (signal?.reason instanceof Error) return signal.reason;
  return new Error(String(signal?.reason ?? "aborted"));
}
