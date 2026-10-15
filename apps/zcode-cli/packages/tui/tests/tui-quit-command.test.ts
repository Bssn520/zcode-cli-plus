import assert from "node:assert/strict";
import test from "node:test";
import { isQuitSlashCommand, resolveComposerSubmittedText } from "../src/app-submit-resolver.js";

test("isQuitSlashCommand accepts /quit and /q", () => {
  assert.equal(isQuitSlashCommand("/quit"), true);
  assert.equal(isQuitSlashCommand(" /q "), true);
  assert.equal(isQuitSlashCommand("/Quit"), true);
  assert.equal(isQuitSlashCommand("/exit"), false);
  assert.equal(isQuitSlashCommand("quit"), false);
});

test("slash suggestion for quit resolves to /quit", () => {
  assert.equal(
    resolveComposerSubmittedText({
      slashCommands: [{ name: "quit", summary: "Exit", aliases: ["q"] }],
      slashSelection: { selectedIndex: 0 },
      submittedValue: "/q",
    }),
    "/quit",
  );
});
