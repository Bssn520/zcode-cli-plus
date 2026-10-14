#!/usr/bin/env node
// 组装可发布的 npm 包：只改发布包描述，不改上游 @zcode/cli 的 package.json，避免影响构建和上游合并。
// 发布目录里的 dist/zcode.cjs 会在这里注入 npm/package.json 的 version 与 bin 命令名（help/usage/--version），
// 并把 external 的 @zcode/tui 改写成包内相对路径；不改 apps/ 源码，本地/非发布构建仍保持上游 zcode 行为。
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { builtinModules, createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, process.argv[2] ?? ".npm-package");
const dist = resolve(root, "apps/zcode-cli/packages/cli/dist");
const tuiDist = resolve(root, "apps/zcode-cli/packages/tui/dist");
const bundleName = "zcode.cjs";
const tuiRuntimeDirName = "tui";
const ROOT_FILES = ["LICENSE", "NOTICE.md", "THIRD-PARTY-NOTICES.md", "UPSTREAM_TAG", "README.md"];
const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

const replaceExact = (source, from, to, expectedCount, label) => {
  let count = 0;
  let index = 0;
  while ((index = source.indexOf(from, index)) !== -1) {
    count += 1;
    index += from.length;
  }
  if (count !== expectedCount) {
    throw new Error(
      `branding inject ${label}: expected ${expectedCount} occurrence(s) of ${JSON.stringify(from)}, found ${count}`,
    );
  }
  return source.split(from).join(to);
};

// esbuild 把 __CLI_VERSION__ / CLI_COMMAND_NAME / i18n help 打进单文件；按上游产物里的稳定字面量改写。
const injectPublishedBranding = (bundle, { commandName, publishedVersion, upstreamVersion }) => {
  let next = bundle;
  // 3 处：run.ts 的 --version，以及 SEA Playwright / TUI runtime 的缓存目录版本段。
  next = replaceExact(
    next,
    JSON.stringify(upstreamVersion),
    JSON.stringify(publishedVersion),
    3,
    "cli version",
  );
  next = replaceExact(
    next,
    'CLI_COMMAND_NAME = "zcode"',
    `CLI_COMMAND_NAME = ${JSON.stringify(commandName)}`,
    1,
    "CLI_COMMAND_NAME",
  );
  next = replaceExact(next, "=> `zcode ${", "=> `" + commandName + " ${", 2, "help banner");
  next = replaceExact(
    next,
    "\n  zcode [command] [options]\n",
    `\n  ${commandName} [command] [options]\n`,
    2,
    "help usage line",
  );
  next = replaceExact(
    next,
    "With no command, zcode opens",
    `With no command, ${commandName} opens`,
    1,
    "help en body",
  );
  // zh-CN help 在 bundle 里是 \u 转义，不是原文汉字。
  next = replaceExact(
    next,
    "command \\u65F6\\uFF0Czcode \\u4F1A",
    `command \\u65F6\\uFF0C${commandName} \\u4F1A`,
    1,
    "help zh body",
  );
  next = replaceExact(next, "Usage: zcode ", `Usage: ${commandName} `, 4, "subcommand usage");
  return next;
};

// CLI 构建把 @zcode/tui 外置；发布包内改为基于 __dirname 的 file URL，保证全局安装后也能解析。
const rewriteTuiImport = (bundle) =>
  replaceExact(
    bundle,
    'import("@zcode/tui")',
    'import(require("node:url").pathToFileURL(require("node:path").join(__dirname, "tui/index.js")).href)',
    1,
    "@zcode/tui import",
  );

const packageNameOf = (specifier) => {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split("/")[0];
};

const collectBareSpecifiers = (source, { module }) => {
  // meriyah 已是 workspace 依赖（@zcode/core）；用 AST 避免大 bundle 里字符串/模板的假阳性。
  const require = createRequire(resolve(root, "package.json"));
  const { parse } = require("meriyah");
  const ast = parse(source, { module, next: true, webcompat: true });
  const specs = new Set();
  const add = (value) => {
    if (typeof value !== "string") return;
    if (
      value.startsWith(".") ||
      value.startsWith("/") ||
      value.startsWith("node:") ||
      value.startsWith("file:") ||
      value.startsWith("data:")
    ) {
      return;
    }
    if (NODE_BUILTINS.has(value)) return;
    specs.add(value);
  };
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node.type === "CallExpression") {
      const callee = node.callee;
      const isRequire = callee?.type === "Identifier" && callee.name === "require";
      const isImport = callee?.type === "Import";
      if (
        (isRequire || isImport) &&
        node.arguments?.[0]?.type === "Literal" &&
        typeof node.arguments[0].value === "string"
      ) {
        add(node.arguments[0].value);
      }
    }
    if (
      (node.type === "ImportDeclaration" ||
        node.type === "ExportNamedDeclaration" ||
        node.type === "ExportAllDeclaration") &&
      node.source?.type === "Literal"
    ) {
      add(node.source.value);
    }
    if (node.type === "ImportExpression" && node.source?.type === "Literal") {
      add(node.source.value);
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "range" || key === "start" || key === "end") continue;
      walk(node[key]);
    }
  };
  walk(ast);
  return specs;
};

const auditBareImports = (pkg, files) => {
  const declared = new Set(Object.keys(pkg.dependencies ?? {}));
  const missing = [];
  for (const { path, source, module } of files) {
    for (const spec of collectBareSpecifiers(source, { module })) {
      const name = packageNameOf(spec);
      if (!declared.has(name)) missing.push({ path, spec, name });
    }
  }
  if (missing.length > 0) {
    const lines = missing.map(
      ({ path, spec, name }) => `  ${path}: ${JSON.stringify(spec)} (package ${JSON.stringify(name)})`,
    );
    throw new Error(
      `npm package bare import audit failed; declare these in npm/package.json dependencies:\n${lines.join("\n")}`,
    );
  }
};

await stat(resolve(dist, bundleName)).catch(() => {
  throw new Error(`missing ${dist}/${bundleName}, run \`pnpm --filter zcode-cli build\` first`);
});
await stat(resolve(tuiDist, "index.js")).catch(() => {
  throw new Error(`missing ${tuiDist}/index.js, run \`pnpm --filter zcode-cli build\` first`);
});
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(dist, resolve(out, "dist"), {
  recursive: true,
  filter: (src) => !src.endsWith(".map"),
});
await cp(tuiDist, resolve(out, "dist", tuiRuntimeDirName), {
  recursive: true,
  filter: (src) => !src.endsWith(".map") && !src.endsWith(".d.ts"),
});
for (const file of ROOT_FILES) await cp(resolve(root, file), resolve(out, file));
const pkg = JSON.parse(await readFile(resolve(root, "npm/package.json"), "utf8"));
const binNames = Object.keys(pkg.bin ?? {});
if (binNames.length !== 1) {
  throw new Error(`npm/package.json bin must declare exactly one command, found ${binNames.length}`);
}
const commandName = binNames[0];
if (typeof pkg.version !== "string" || pkg.version.trim() === "") {
  throw new Error("npm/package.json must define a non-empty string version");
}
if (pkg.version.startsWith("0.0.0")) {
  throw new Error(
    `refused to prepare package: version must not start with 0.0.0 (got ${pkg.version})`,
  );
}
const releasePleaseManifest = JSON.parse(
  await readFile(resolve(root, ".release-please-manifest.json"), "utf8"),
);
if (releasePleaseManifest.npm !== pkg.version) {
  throw new Error(
    `refused to prepare package: .release-please-manifest.json "npm" (${JSON.stringify(releasePleaseManifest.npm)}) must equal npm/package.json version (${JSON.stringify(pkg.version)})`,
  );
}
const upstreamPkg = JSON.parse(
  await readFile(resolve(root, "apps/zcode-cli/package.json"), "utf8"),
);
if (typeof upstreamPkg.version !== "string" || upstreamPkg.version.trim() === "") {
  throw new Error("apps/zcode-cli/package.json must define a non-empty string version");
}

const bundlePath = resolve(out, "dist", bundleName);
const tuiEntryPath = resolve(out, "dist", tuiRuntimeDirName, "index.js");
let branded = injectPublishedBranding(await readFile(bundlePath, "utf8"), {
  commandName,
  publishedVersion: pkg.version,
  upstreamVersion: upstreamPkg.version,
});
branded = rewriteTuiImport(branded);
await writeFile(bundlePath, branded);
await writeFile(resolve(out, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

const tuiSource = await readFile(tuiEntryPath, "utf8");
auditBareImports(pkg, [
  { path: `dist/${bundleName}`, source: branded, module: false },
  { path: `dist/${tuiRuntimeDirName}/index.js`, source: tuiSource, module: true },
]);

const versionOut = execFileSync(process.execPath, [bundlePath, "--version"], {
  encoding: "utf8",
}).trim();
if (versionOut !== pkg.version) {
  throw new Error(`prepared --version expected ${pkg.version}, got ${JSON.stringify(versionOut)}`);
}
const helpOut = execFileSync(process.execPath, [bundlePath, "--help"], { encoding: "utf8" });
const helpBanner = `${commandName} ${pkg.version}`;
if (!helpOut.startsWith(helpBanner) || !helpOut.includes(`\n  ${commandName} [command] [options]\n`)) {
  throw new Error(`prepared --help missing ${JSON.stringify(helpBanner)} / usage line for ${commandName}`);
}

console.log(`prepared ${pkg.name}@${pkg.version} (command ${commandName}) in ${out}`);
