#!/usr/bin/env node
// 组装可发布的 npm 包：只改发布包描述，不改上游 @zcode/cli 的 package.json，避免影响构建和上游合并。
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, process.argv[2] ?? ".npm-package");
const dist = resolve(root, "apps/zcode-cli/packages/cli/dist");
const ROOT_FILES = ["LICENSE", "NOTICE.md", "THIRD-PARTY-NOTICES.md", "UPSTREAM_TAG", "README.md"];

await stat(resolve(dist, "zcode.cjs")).catch(() => {
  throw new Error(`missing ${dist}/zcode.cjs, run \`pnpm --filter zcode-cli build\` first`);
});
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(dist, resolve(out, "dist"), {
  recursive: true,
  filter: (src) => !src.endsWith(".map"),
});
for (const file of ROOT_FILES) await cp(resolve(root, file), resolve(out, file));
const pkg = JSON.parse(await readFile(resolve(root, "npm/package.json"), "utf8"));
await writeFile(resolve(out, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`prepared ${pkg.name}@${pkg.version} in ${out}`);
