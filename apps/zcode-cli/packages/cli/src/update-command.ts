import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { RunContext } from "@zcode/shared-types";

export const UPDATE_PACKAGE_NAME = "@bssn520/zcode-cli-plus";
export const DEFAULT_UPDATE_REGISTRY = "https://registry.npmjs.org";
export const UPDATE_INSTALL_COMMAND = `npm i -g ${UPDATE_PACKAGE_NAME}@latest`;

export const UPDATE_COMMAND_USAGE = `Usage: zcp update [--check]

Check npm for a newer ${UPDATE_PACKAGE_NAME} and install it globally.

Options:
  --check      Only check; do not install
  -h, --help   Show this help

Environment:
  ZCP_UPDATE_REGISTRY  Override registry base URL (default: ${DEFAULT_UPDATE_REGISTRY})
`;

export type UpdateCommandDeps = {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  spawn?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => Pick<ChildProcess, "on">;
};

export async function runUpdateCommand(
  ctx: RunContext,
  args: readonly string[],
  currentVersion: string,
  deps: UpdateCommandDeps = {},
): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    ctx.stdout.write(UPDATE_COMMAND_USAGE);
    return 0;
  }

  const checkOnly = args.includes("--check");
  const unexpected = args.filter((arg) => arg !== "--check" && arg !== "--help" && arg !== "-h");
  if (unexpected.length > 0) {
    ctx.stderr.write(`Unknown update option: ${unexpected[0]}\n\n${UPDATE_COMMAND_USAGE}`);
    return 1;
  }

  const env = deps.env ?? process.env;
  let latestVersion: string;
  try {
    latestVersion = await fetchLatestVersion(env, deps.fetch ?? fetch);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.stderr.write(`Failed to check for updates: ${message}\n`);
    writeManualInstallHint(ctx, env);
    return 1;
  }

  if (compareSemver(latestVersion, currentVersion) <= 0) {
    ctx.stdout.write(`已是最新版本 ${currentVersion}\n`);
    return 0;
  }

  ctx.stdout.write(`${currentVersion} → ${latestVersion}\n`);
  if (checkOnly) return 0;

  try {
    const code = await installLatest(env, deps.spawn ?? spawn);
    if (code === 0) return 0;
    ctx.stderr.write(`Update failed (exit ${code}).\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.stderr.write(`Update failed: ${message}\n`);
  }

  writeManualInstallHint(ctx, env);
  return 1;
}

export async function fetchLatestVersion(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
): Promise<string> {
  const registry = (env.ZCP_UPDATE_REGISTRY ?? DEFAULT_UPDATE_REGISTRY).replace(/\/$/, "");
  const url = `${registry}/@bssn520%2fzcode-cli-plus/latest`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`registry responded ${response.status} for ${url}`);
  }
  const body = (await response.json()) as { version?: unknown };
  if (typeof body.version !== "string" || body.version.trim().length === 0) {
    throw new Error("registry latest payload missing version");
  }
  return body.version.trim();
}

export function compareSemver(left: string, right: string): number {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    const delta = leftParts[index]! - rightParts[index]!;
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  return 0;
}

function parseSemver(version: string): [number, number, number] {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

async function installLatest(
  env: NodeJS.ProcessEnv,
  spawnImpl: NonNullable<UpdateCommandDeps["spawn"]>,
): Promise<number> {
  const registry = env.ZCP_UPDATE_REGISTRY?.replace(/\/$/, "");
  const args = ["i", "-g", `${UPDATE_PACKAGE_NAME}@latest`];
  if (registry) args.push("--registry", registry);

  return await new Promise<number>((resolve, reject) => {
    const child = spawnImpl("npm", args, {
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(typeof code === "number" ? code : 1);
    });
  });
}

function writeManualInstallHint(ctx: RunContext, env: NodeJS.ProcessEnv): void {
  const registry = env.ZCP_UPDATE_REGISTRY?.replace(/\/$/, "");
  const command = registry
    ? `${UPDATE_INSTALL_COMMAND} --registry ${registry}`
    : UPDATE_INSTALL_COMMAND;
  ctx.stderr.write(`Run manually: ${command}\n`);
  ctx.stderr.write(`If you hit a permissions error, retry with sudo: sudo ${command}\n`);
}
