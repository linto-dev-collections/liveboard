import type { ManipulateType, OpUnitType, QUnitType } from "dayjs";
import dayjs from "dayjs";
import "dayjs/locale/ja";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("ja");

export const TZ = "Asia/Tokyo";
export type { Dayjs } from "dayjs";
export type { ManipulateType, OpUnitType, QUnitType };

// ---------------------------------------------------------------------------
// Core: JST-aware dayjs constructors
// ---------------------------------------------------------------------------

/** Create a dayjs instance in JST. Without arguments, returns current time in JST. */
export function jst(date?: string | number | Date | dayjs.Dayjs): dayjs.Dayjs {
  if (date === undefined) return dayjs().tz(TZ);
  return dayjs(date).tz(TZ);
}

/** Parse booking date ("YYYY-MM-DD") + time ("HH:MM") into a JST dayjs. */
export function parseBookingTime(date: string, time: string): dayjs.Dayjs {
  return dayjs.tz(`${date} ${time}`, TZ);
}

// ---------------------------------------------------------------------------
// Format constants
// ---------------------------------------------------------------------------

export const FORMAT = {
  /** "YYYY-MM-DD" */
  DATE: "YYYY-MM-DD",
  /** "YYYY年M月D日" */
  DATE_JP: "YYYY年M月D日",
  /** "YYYY年M月D日(ddd)" */
  DATE_WITH_DAY_JP: "YYYY年M月D日(ddd)",
  /** "YYYY/MM/DD" */
  DATE_SLASH: "YYYY/MM/DD",
  /** "YYYY/MM" */
  YEAR_MONTH_SLASH: "YYYY/MM",
  /** "HH:mm" */
  TIME: "HH:mm",
  /** "YYYY-MM-DD HH:mm" */
  DATETIME: "YYYY-MM-DD HH:mm",
  /** "YYYY/MM/DD HH:mm" */
  DATETIME_SLASH: "YYYY/MM/DD HH:mm",
} as const;

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Current JST hour (0–23). */
export function jstHour(): number {
  return jst().hour();
}

/** Next JST 9:00 AM as a native Date (UTC). */
export function nextJST9AM(): Date {
  let next = jst().hour(9).minute(0).second(0).millisecond(0);
  if (!next.isAfter(jst())) {
    next = next.add(1, "day");
  }
  return next.toDate();
}

/** Format a date string ("YYYY-MM-DD") to "YYYY年M月D日(曜)" in JST. */
export function formatDateJP(dateStr: string): string {
  return jst(`${dateStr} 00:00`).format(FORMAT.DATE_WITH_DAY_JP);
}

/**
 * Relative date label for chat UI: "今日", "昨日", "月/日", or "年/月/日".
 * Input can be an ISO string or timestamp.
 */
export function formatRelativeDate(date: string | number | Date): string {
  const d = jst(date);
  const today = jst().startOf("day");
  const target = d.startOf("day");
  const diffDays = today.diff(target, "day");

  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "昨日";

  if (d.year() === today.year()) {
    return d.format("M月D日(ddd)");
  }
  return d.format(FORMAT.DATE_WITH_DAY_JP);
}

/**
 * Short time label for chat list: "HH:mm", "昨日", weekday, or "M/D".
 */
export function formatRelativeTime(date: string | number | Date): string {
  const d = jst(date);
  const today = jst().startOf("day");
  const target = d.startOf("day");
  const diffDays = today.diff(target, "day");

  if (diffDays === 0) return d.format(FORMAT.TIME);
  if (diffDays === 1) return "昨日";
  if (diffDays < 7) return d.format("ddd");
  return d.format("M/D");
}

/** Check if two date values fall on the same calendar day in JST. */
export function isSameDay(
  a: string | number | Date,
  b: string | number | Date,
): boolean {
  return jst(a).format(FORMAT.DATE) === jst(b).format(FORMAT.DATE);
}

// ---------------------------------------------------------------------------
// Calendar helpers (for LIFF date picker)
// ---------------------------------------------------------------------------

/** Days in a month (1-indexed month internally handled). */
export function daysInMonth(year: number, month: number): number {
  return jst().year(year).month(month).daysInMonth();
}

/** Day of week of the 1st day of a month (0=Sun, 6=Sat). */
export function firstDayOfWeek(year: number, month: number): number {
  return jst().year(year).month(month).date(1).day();
}

/** Format year/month/day to "YYYY-MM-DD". */
export function formatYMD(year: number, month: number, day: number): string {
  return jst().year(year).month(month).date(day).format(FORMAT.DATE);
}
