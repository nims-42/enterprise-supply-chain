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
