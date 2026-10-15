import {
  BUILTIN_ZCODE_SLASH_COMMAND_HELP_ENTRIES,
  type BuiltinZCodeSlashCommandHelpEntry,
} from "@zcode/shared";

export type SlashCommandHelpEntry = BuiltinZCodeSlashCommandHelpEntry;

/** Fork-only slash commands kept out of upstream shared help. */
export const LOCAL_SLASH_COMMAND_HELP_ENTRIES: readonly SlashCommandHelpEntry[] = [
  {
    aliases: ["q"],
    details: [
      "Exits the TUI immediately.",
      "Uses the same cleanup path as pressing Ctrl-C twice to confirm exit.",
    ],
    name: "quit",
    summary: "Exit the TUI.",
    usage: "/quit",
  },
];

export const SLASH_COMMAND_HELP_ENTRIES: readonly SlashCommandHelpEntry[] = [
  ...BUILTIN_ZCODE_SLASH_COMMAND_HELP_ENTRIES,
  ...LOCAL_SLASH_COMMAND_HELP_ENTRIES,
];
