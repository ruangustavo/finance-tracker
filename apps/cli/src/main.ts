import { defineCommand, runMain } from "citty";
import { edit } from "./commands/edit.ts";
import { entries } from "./commands/entries.ts";
import { register } from "./commands/register.ts";
import { remove } from "./commands/remove.ts";
import { spending } from "./commands/spending.ts";

const main = defineCommand({
  meta: {
    name: "chatter",
    description: "chatter — personal finance CLI",
  },
  subCommands: { register, entries, edit, remove, spending },
});

await runMain(main);
