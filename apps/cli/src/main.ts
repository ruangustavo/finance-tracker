import { defineCommand, runMain } from "citty";
import { anchor } from "./commands/anchor.ts";
import { balance } from "./commands/balance.ts";
import { card } from "./commands/card.ts";
import { edit } from "./commands/edit.ts";
import { entries } from "./commands/entries.ts";
import { fatura } from "./commands/fatura.ts";
import { installment } from "./commands/installment.ts";
import { projecao } from "./commands/projecao.ts";
import { recurring } from "./commands/recurring.ts";
import { register } from "./commands/register.ts";
import { remove } from "./commands/remove.ts";
import { spending } from "./commands/spending.ts";
import { status } from "./commands/status.ts";

const main = defineCommand({
  meta: {
    name: "chatter",
    description: "chatter — personal finance CLI",
  },
  subCommands: {
    register,
    entries,
    edit,
    remove,
    spending,
    anchor,
    balance,
    recurring,
    installment,
    card,
    fatura,
    projecao,
    status,
  },
});

await runMain(main);
