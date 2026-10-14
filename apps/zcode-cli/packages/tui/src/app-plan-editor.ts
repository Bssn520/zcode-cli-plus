import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type SuspendTerminal = {
  resume(): void;
  suspend(): void;
};

export type EditPlanResult =
  | { plan: string; status: "updated" }
  | { status: "unchanged" }
  | { status: "empty" }
  | { message: string; status: "error" };

type SpawnSyncFn = (
  command: string,
  args: readonly string[],
  options: {
    env?: NodeJS.ProcessEnv;
    stdio: "inherit";
  },
) => Pick<SpawnSyncReturns<Buffer>, "error" | "status" | "signal">;

export function normalizePlanText(plan: string): string {
  return plan.replace(/\r\n/g, "\n").trim();
}

export function splitEditorCommand(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return ["vi"];
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (const ch of trimmed) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/u.test(ch)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) parts.push(current);
  return parts.length > 0 ? parts : ["vi"];
}

export function resolveEditorCommand(env: NodeJS.ProcessEnv = process.env): {
  args: string[];
  command: string;
} {
  const raw = env.VISUAL?.trim() || env.EDITOR?.trim() || "vi";
  const parts = splitEditorCommand(raw);
  return { command: parts[0] ?? "vi", args: parts.slice(1) };
}

export function editPlanInExternalEditor(input: {
  env?: NodeJS.ProcessEnv;
  plan: string;
  spawnSyncFn?: SpawnSyncFn;
  suspendTerminal?: SuspendTerminal;
}): EditPlanResult {
  const env = input.env ?? process.env;
  const { command, args: editorArgs } = resolveEditorCommand(env);
  const spawn = input.spawnSyncFn ?? spawnSync;
  const dir = mkdtempSync(join(tmpdir(), "zcp-plan-"));
  const filePath = join(dir, `plan-${randomBytes(4).toString("hex")}.md`);
  writeFileSync(filePath, input.plan, "utf8");

  let suspended = false;
  try {
    input.suspendTerminal?.suspend();
    suspended = true;
    const result = spawn(command, [...editorArgs, filePath], { env, stdio: "inherit" });
    if (result.error) {
      return { message: result.error.message, status: "error" };
    }
    if (result.status !== 0 && result.status !== null) {
      // Non-zero exit: still accept content changes if present.
    }

    const edited = readFileSync(filePath, "utf8");
    if (normalizePlanText(edited).length === 0) return { status: "empty" };
    if (normalizePlanText(edited) === normalizePlanText(input.plan)) {
      return { status: "unchanged" };
    }
    return { plan: edited.replace(/\r\n/g, "\n"), status: "updated" };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      status: "error",
    };
  } finally {
    if (suspended) {
      try {
        input.suspendTerminal?.resume();
      } catch {
        // Keep cleanup best-effort so temp files still go away.
      }
    }
    try {
      rmSync(dir, { force: true, recursive: true });
    } catch {
      // ignore
    }
  }
}
