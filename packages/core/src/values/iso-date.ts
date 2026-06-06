import {
  addDays,
  addMonths,
  differenceInDays,
  format,
  isValid,
  parse as parseDate,
} from "date-fns";
import { Result } from "../result.ts";

export type IsoDate = string & { readonly __brand: "IsoDate" };

export type InvalidDate = Readonly<{
  kind: "InvalidDate";
  raw: string;
}>;

const FORMAT = "yyyy-MM-dd";
const REFERENCE = new Date(0);

export const IsoDate = {
  parse(raw: string): Result<IsoDate, InvalidDate> {
    const date = parseDate(raw, FORMAT, REFERENCE);
    if (!isValid(date) || format(date, FORMAT) !== raw) {
      return Result.err({ kind: "InvalidDate", raw });
    }
    return Result.ok(raw as IsoDate);
  },

  today(): IsoDate {
    return new Date().toISOString().slice(0, 10) as IsoDate;
  },

  addDays(date: IsoDate, days: number): IsoDate {
    return format(addDays(parseDate(date, FORMAT, REFERENCE), days), FORMAT) as IsoDate;
  },

  addMonths(date: IsoDate, months: number): IsoDate {
    return format(addMonths(parseDate(date, FORMAT, REFERENCE), months), FORMAT) as IsoDate;
  },

  daysBetween(from: IsoDate, to: IsoDate): number {
    return differenceInDays(parseDate(to, FORMAT, REFERENCE), parseDate(from, FORMAT, REFERENCE));
  },
} as const;
