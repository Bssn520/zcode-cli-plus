import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSlashCommandHelp,
  listSlashCommandSuggestions,
  parseSlashCommand,
} from "../src/command-center.js";

test("parses /quit and /q", () => {
  assert.deepEqual(parseSlashCommand("/quit"), {
    args: "",
    name: "quit",
    rawName: "quit",
    type: "known",
  });
  assert.deepEqual(parseSlashCommand("/q"), {
    args: "",
    name: "quit",
    rawName: "q",
    type: "known",
  });
});

test("lists quit in slash suggestions and help", () => {
  const suggestions = listSlashCommandSuggestions();
  const quit = suggestions.find((entry) => entry.name === "quit");
  assert.ok(quit);
  assert.deepEqual(quit?.aliases, ["q"]);
  assert.match(formatSlashCommandHelp("quit"), /Exit the TUI/);
  assert.match(formatSlashCommandHelp("q"), /Aliases: \/q/);
});
