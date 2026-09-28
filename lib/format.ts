const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** 89500 -> "₹89,500.00" (Indian digit grouping: 12,74,900) */
export function formatINR(amount: number): string {
  return inr.format(amount);
}

const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

/** ISO timestamp from the API -> "26 Sept 2026, 6:00 pm" in IST */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

const dateOnly = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" });

/**
 * "2026-10-05" (a DATE column) -> "5 Oct 2026".
 * Also accepts a full timestamp, which is shown as its date in IST.
 */
export function formatDate(value: string): string {
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plain) {
    // Build the date at UTC midnight and format it in UTC, so no timezone
    // shift can move it to the day before.
    const [, y, m, d] = plain;
    return dateOnly.format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))));
  }
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
    new Date(value),
  );
}
