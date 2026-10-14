#!/usr/bin/env node
// Fork-owned (not upstream). Upstream ships a stale apps/zcode-cli/pnpm-lock.yaml whose importers
// miss several CLI packages (browser-use-plugin, zcode-cua-plugin, ...). turbo runs with
// apps/zcode-cli as its repo root and reads that nested lockfile, warning
// "Workspace 'packages/<x>' not found in lockfile" and computing inaccurate cache hashes.
// We derive the nested lockfile from the authoritative root lockfile: keep only the
// apps/zcode-cli importers, rebased to be relative to apps/zcode-cli. Package/snapshot
// sections are copied verbatim. pnpm itself only ever installs from the root lockfile.
import { readFileSync, writeFileSync } from 'node:fs';
const [src = 'pnpm-lock.yaml', dst = 'apps/zcode-cli/pnpm-lock.yaml'] = process.argv.slice(2);
const PREFIX = 'apps/zcode-cli';
const out = [];
let section = '', keep = true;
for (const line of readFileSync(src, 'utf8').split('\n')) {
  const top = /^([A-Za-z][\w-]*):/.exec(line);
  if (top) { section = top[1]; keep = true; out.push(line); continue; }
  if (section === 'importers') {
    const imp = /^  (\S.*):$/.exec(line);
    if (imp) {
      const k = imp[1].replace(/^'|'$/g, '');
      if (k === PREFIX) { keep = true; out.push('  .:'); continue; }
      if (k.startsWith(PREFIX + '/')) { keep = true; out.push(`  ${k.slice(PREFIX.length + 1)}:`); continue; }
      keep = false; continue;
    }
    if (!keep && line.trim() !== '') continue;
  }
  out.push(line);
}
writeFileSync(dst, out.join('\n').replace(/\n{3,}/g, '\n\n'));
