import { appLocale, safeLocale } from "./locale";

// Date display. A date-only value ("2026-10-27") names a calendar day, not an
// instant: it is shown in UTC so it never moves to the previous day west of UTC.
// Instants are shown as a medium date and a short time, without seconds.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/;

type Options = { locale?: string | string[]; timeZone?: string };
const localeOf = (options: Options) =>
  options.locale === undefined ? appLocale() : safeLocale(...[options.locale].flat());

/** "Oct 27, 2026" for a date-only value; "Oct 27, 2026, 9:17 AM" for an instant. */
export function formatDate(value: string, options: Options = {}): string {
  if (DATE_ONLY.test(value)) {
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(time)) return value;
    return new Intl.DateTimeFormat(localeOf(options), { dateStyle: "medium", timeZone: "UTC" }).format(time);
  }
  if (!INSTANT.test(value)) return value;
  return formatTime(value, options);
}

/** An event time (download finished, check ran): medium date and short time. */
export function formatTime(value: string | number | Date, options: Options = {}): string {
  const time = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(time)) return typeof value === "string" ? value : "";
  return new Intl.DateTimeFormat(localeOf(options), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: options.timeZone,
  }).format(time);
}
