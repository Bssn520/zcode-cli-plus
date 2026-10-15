/** Piped stdin prepend for `-p/--prompt`. Never consume stdin when the prompt flag is absent. */

export const DEFAULT_STDIN_TEXT_LIMIT_BYTES = 10 * 1024 * 1024;

export class StdinTextTooLargeError extends Error {
  constructor(limitBytes: number) {
    super(`stdin exceeds ${limitBytes} bytes`);
    this.name = "StdinTextTooLargeError";
  }
}

/**
 * Read non-TTY stdin as UTF-8 text up to `limitBytes`.
 * Returns `undefined` for TTY / empty input so callers can keep the prompt unchanged.
 */
export async function readStdinTextIfPiped(
  stdin: NodeJS.ReadableStream & { isTTY?: boolean },
  options?: { limitBytes?: number },
): Promise<string | undefined> {
  if (stdin.isTTY === true) return undefined;
  // Unit-test stubs often set isTTY=false without implementing a Readable.
  // Real process.stdin / PassThrough expose asyncIterator.
  if (typeof (stdin as AsyncIterable<unknown>)[Symbol.asyncIterator] !== "function") {
    return undefined;
  }

  const limitBytes = options?.limitBytes ?? DEFAULT_STDIN_TEXT_LIMIT_BYTES;
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of stdin as AsyncIterable<string | Buffer>) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > limitBytes) {
      throw new StdinTextTooLargeError(limitBytes);
    }
    chunks.push(buf);
  }

  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf8").replace(/\0/g, "");
  return text.length > 0 ? text : undefined;
}

export function combinePromptWithStdin(prompt: string, stdinText: string | undefined): string {
  if (stdinText === undefined) return prompt;
  const trimmedStdin = stdinText.replace(/\s+$/u, "");
  if (trimmedStdin.length === 0) return prompt;
  return `${trimmedStdin}\n\n${prompt}`;
}
