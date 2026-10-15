import { randomUUID } from "node:crypto";
import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteSessionStore } from "@zcode/adapters/storage";

export const NO_SESSION_TEMP_PREFIX = "zcp-nosession-";
export const NO_SESSION_STALE_MS = 60 * 60 * 1000;

export type EphemeralSessionStoreHandle = {
  dbPath: string;
  store: ReturnType<typeof createSqliteSessionStore>;
  dispose: () => Promise<void>;
};

const sidecarPaths = (dbPath: string): string[] => [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

async function removeQuietly(paths: readonly string[]): Promise<void> {
  await Promise.all(
    paths.map((path) => rm(path, { force: true }).catch(() => undefined)),
  );
}

/** Drop leftover temp DBs from crashed `--no-session` runs. */
export async function cleanupStaleNoSessionStores(
  directory = tmpdir(),
  maxAgeMs = NO_SESSION_STALE_MS,
  now = Date.now(),
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (name) => {
      if (!name.startsWith(NO_SESSION_TEMP_PREFIX) || name.endsWith("-wal") || name.endsWith("-shm")) {
        return;
      }
      const dbPath = join(directory, name);
      try {
        const info = await stat(dbPath);
        if (!info.isFile()) return;
        if (now - info.mtimeMs < maxAgeMs) return;
        await removeQuietly(sidecarPaths(dbPath));
      } catch {
        // best-effort sweep
      }
    }),
  );
}

export async function createEphemeralSessionStore(
  directory = tmpdir(),
): Promise<EphemeralSessionStoreHandle> {
  await cleanupStaleNoSessionStores(directory);
  const dbPath = join(directory, `${NO_SESSION_TEMP_PREFIX}${randomUUID()}.sqlite`);
  const store = createSqliteSessionStore({ dbPath });
  let disposed = false;
  return {
    dbPath,
    store,
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      try {
        store.close();
      } catch {
        // already closed by app ownership edge cases
      }
      await removeQuietly(sidecarPaths(dbPath));
    },
  };
}
