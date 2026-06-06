import { CreditCard, IsoDate, Result, Statement } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { emit } from "../output.ts";

export const fatura = defineCommand({
  meta: {
    name: "fatura",
    description: "Show a card's open statement (and its purchases) for a reference date",
  },
  args: {
    card: { type: "string", required: true, description: "Credit-card name (must exist)" },
    ref: {
      type: "string",
      description: "Reference date YYYY-MM-DD — picks the statement covering it (default: today)",
    },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      const card = await CreditCard.findByName(db, args.card);
      if (!card.ok) {
        emit(card);
        return;
      }
      const refDate = IsoDate.parse(args.ref ?? IsoDate.today());
      if (!refDate.ok) {
        emit(refDate);
        return;
      }
      emit(Result.ok(await Statement.forCardAt(db, card.value, refDate.value)));
    } finally {
      await db.destroy();
    }
  },
});
