import { Result } from "../result.ts";

export type Money = Readonly<{ cents: number }>;

export type InvalidAmount = Readonly<{
  kind: "InvalidAmount";
  raw: string;
}>;

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const SIGNED_AMOUNT_PATTERN = /^-?\d+(\.\d{1,2})?$/;

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const Money = {
  parse(raw: string): Result<Money, InvalidAmount> {
    const trimmed = raw.trim();

    if (!AMOUNT_PATTERN.test(trimmed)) {
      return Result.err({ kind: "InvalidAmount", raw });
    }

    const cents = Math.round(Number.parseFloat(trimmed) * 100);
    if (cents <= 0) {
      return Result.err({ kind: "InvalidAmount", raw });
    }

    return Result.ok({ cents });
  },

  parseSigned(raw: string): Result<Money, InvalidAmount> {
    const trimmed = raw.trim();

    if (!SIGNED_AMOUNT_PATTERN.test(trimmed)) {
      return Result.err({ kind: "InvalidAmount", raw });
    }

    const cents = Math.round(Number.parseFloat(trimmed) * 100);
    return Result.ok({ cents });
  },

  format(money: Money): string {
    return BRL.format(money.cents / 100);
  },
} as const;
