import type { SuspendTerminal } from "./app-plan-editor.js";

export type TerminalSize = {
  columns: number;
  rows: number;
};

export type SuspendTerminalRenderer = {
  requestFullRepaintRender(): void;
  resume(): void;
  suspend(): void;
};

type ResizeCapableRenderer = SuspendTerminalRenderer & {
  handleResize?(width: number, height: number): void;
  processResize?(width: number, height: number): void;
};

export function readTerminalSize(
  stdout: { columns?: number; rows?: number } = process.stdout,
): TerminalSize {
  return {
    columns: stdout.columns || 80,
    rows: stdout.rows || 24,
  };
}

/**
 * Pause OpenTUI while an external editor owns the tty.
 * 原因：spawnSync 阻塞事件循环时 SIGWINCH 会丢，resume 后必须重读并推送尺寸。
 */
export function createSuspendTerminal(
  renderer: SuspendTerminalRenderer,
  getSize: () => TerminalSize = readTerminalSize,
): SuspendTerminal {
  return {
    suspend: () => renderer.suspend(),
    resume: () => {
      renderer.resume();
      const { columns, rows } = getSize();
      // OpenTUI keeps these private; call processResize (what SIGWINCH eventually hits).
      const resizable = renderer as ResizeCapableRenderer;
      if (typeof resizable.processResize === "function") {
        resizable.processResize(columns, rows);
      } else if (typeof resizable.handleResize === "function") {
        resizable.handleResize(columns, rows);
      }
      renderer.requestFullRepaintRender();
    },
  };
}
