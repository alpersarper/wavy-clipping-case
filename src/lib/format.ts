/**
 * Display helpers. All date handling is UTC, matching the server (NOTES.md),
 * so a campaign period reads the same wherever the browser happens to be.
 */

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `Date` -> `YYYY-MM-DD`, the value an `<input type="date">` expects. */
export function toDayInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `Date` -> `5 Sep 2026`. */
export function formatDate(date: Date): string {
  return dayFormatter.format(date);
}

/** `YYYY-MM-DD` -> `5 Sep 2026`. */
export function formatDay(day: string): string {
  return dayFormatter.format(new Date(`${day}T00:00:00.000Z`));
}

export function formatViews(views: number): string {
  return views.toLocaleString("en-US");
}
