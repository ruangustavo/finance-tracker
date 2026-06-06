import {
  addMonths,
  format,
  getDate,
  parse as parseDate,
  setDate,
  subDays,
  subMonths,
} from "date-fns";
import { Result } from "../result.ts";
import type { IsoDate } from "./iso-date.ts";

export type PayCycle = Readonly<{
  from: IsoDate;
  to: IsoDate;
}>;

export type InvalidAnchorDay = Readonly<{
  kind: "InvalidAnchorDay";
  raw: string;
}>;

const FORMAT = "yyyy-MM-dd";
const REFERENCE = new Date(0);

const MIN_ANCHOR_DAY = 1;
const MAX_ANCHOR_DAY = 28;

export const PayCycle = {
  parseAnchorDay(raw: string): Result<number, InvalidAnchorDay> {
    if (!/^\d+$/.test(raw)) {
      return Result.err({ kind: "InvalidAnchorDay", raw });
    }
    const day = Number(raw);
    if (day < MIN_ANCHOR_DAY || day > MAX_ANCHOR_DAY) {
      return Result.err({ kind: "InvalidAnchorDay", raw });
    }
    return Result.ok(day);
  },

  current(anchorDay: number, today: IsoDate): PayCycle {
    const todayDate = parseDate(today, FORMAT, REFERENCE);
    const startMonth = getDate(todayDate) >= anchorDay ? todayDate : subMonths(todayDate, 1);
    const from = setDate(startMonth, anchorDay);
    const to = subDays(setDate(addMonths(startMonth, 1), anchorDay), 1);
    return {
      from: format(from, FORMAT) as IsoDate,
      to: format(to, FORMAT) as IsoDate,
    };
  },

  priorWindow(anchorDay: number, today: IsoDate, cycles: number): PayCycle {
    const current = PayCycle.current(anchorDay, today);
    const currentFrom = parseDate(current.from, FORMAT, REFERENCE);
    const from = setDate(subMonths(currentFrom, cycles), anchorDay);
    const to = subDays(currentFrom, 1);
    return {
      from: format(from, FORMAT) as IsoDate,
      to: format(to, FORMAT) as IsoDate,
    };
  },

  upcoming(anchorDay: number, today: IsoDate, cycles: number): PayCycle {
    const current = PayCycle.current(anchorDay, today);
    const to = addMonths(parseDate(current.to, FORMAT, REFERENCE), cycles - 1);
    return { from: today, to: format(to, FORMAT) as IsoDate };
  },
} as const;
