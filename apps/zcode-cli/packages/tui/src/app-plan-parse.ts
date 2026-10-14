export type ParsedPlanPreview = {
  files: string[];
  risks: string[];
  splittable: boolean;
  steps: string[];
};

const STEP_HEADING = /^(?:#{1,6}\s*)?(?:steps?|implementation|步骤|实现)\s*$/iu;
const FILE_HEADING = /^(?:#{1,6}\s*)?(?:files?|改动文件|文件)\s*$/iu;
const RISK_HEADING = /^(?:#{1,6}\s*)?(?:risks?|风险)\s*$/iu;
const LIST_ITEM = /^\s*(?:\d+[\.\)]\s+|[-*]\s+)(.+?)\s*$/u;
const PATH_LIKE = /(?:^|[\s`])([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?:$|[\s`])/u;

export function parsePlanPreview(plan: string): ParsedPlanPreview {
  const lines = plan.replace(/\r\n/g, "\n").split("\n");
  const steps: string[] = [];
  const files: string[] = [];
  const risks: string[] = [];
  let section: "steps" | "files" | "risks" | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.replace(/^#+\s*/u, "").trim();
    if (STEP_HEADING.test(heading)) {
      section = "steps";
      continue;
    }
    if (FILE_HEADING.test(heading)) {
      section = "files";
      continue;
    }
    if (RISK_HEADING.test(heading)) {
      section = "risks";
      continue;
    }
    if (/^#{1,6}\s+\S/u.test(rawLine)) {
      section = null;
      continue;
    }

    const item = LIST_ITEM.exec(rawLine)?.[1]?.trim();
    if (!item) continue;
    if (section === "steps") steps.push(item);
    else if (section === "files") files.push(stripPathTicks(item));
    else if (section === "risks") risks.push(item);
  }

  if (steps.length === 0) {
    for (const rawLine of lines) {
      const item = LIST_ITEM.exec(rawLine)?.[1]?.trim();
      if (item) steps.push(item);
    }
  }

  if (files.length === 0) {
    for (const rawLine of lines) {
      const match = PATH_LIKE.exec(rawLine);
      if (match?.[1]) files.push(match[1]);
    }
  }

  const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
  const parsed = {
    files: unique(files),
    risks: unique(risks),
    steps: unique(steps),
  };
  return {
    ...parsed,
    splittable: parsed.steps.length > 0 || parsed.files.length > 0 || parsed.risks.length > 0,
  };
}

function stripPathTicks(value: string): string {
  return value.replace(/^`+|`+$/gu, "").trim();
}
