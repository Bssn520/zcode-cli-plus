import { displayWidth } from "./app-terminal-width.js";

const HINT_SEPARATOR = " · ";

/**
 * Pack key-hint segments onto lines at hint boundaries (` · `).
 * Never splits a single hint; wide terminals keep a single line.
 */
export function wrapPlanApprovalHints(help: string, maxCells: number): string[] {
  const widthLimit = Math.max(1, Math.floor(maxCells));
  const hints = help.split(HINT_SEPARATOR).filter((hint) => hint.length > 0);
  if (hints.length === 0) return [help];

  const lines: string[] = [];
  let current = "";

  for (const hint of hints) {
    const next = current.length === 0 ? hint : `${current}${HINT_SEPARATOR}${hint}`;
    if (displayWidth(next) <= widthLimit) {
      current = next;
      continue;
    }
    if (current.length > 0) lines.push(current);
    // shortcut: single hint wider than width stays untruncated; abbreviate if we hit sub-14 terminals
    current = hint;
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
