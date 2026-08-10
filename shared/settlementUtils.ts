/**
 * Shared settlement utilities — used by both the server router and tests.
 * All date arithmetic is performed in UTC to avoid DST edge cases.
 */

/** Nigerian public holidays (ISO date strings, updated annually). */
export const NIGERIAN_PUBLIC_HOLIDAYS_2026: string[] = [
  "2026-01-01", // New Year's Day
  "2026-04-03", // Good Friday
  "2026-04-06", // Easter Monday
  "2026-05-01", // Workers' Day
  "2026-05-27", // Children's Day
  "2026-06-12", // Democracy Day
  "2026-10-01", // Independence Day
  "2026-12-25", // Christmas Day
  "2026-12-26", // Boxing Day
];

/**
 * Returns true if the given UTC date falls on a weekend (Sat/Sun)
 * or is a recognised Nigerian public holiday.
 */
export function isNonBusinessDay(date: Date, holidays: string[] = NIGERIAN_PUBLIC_HOLIDAYS_2026): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return true;
  const iso = date.toISOString().slice(0, 10);
  return holidays.includes(iso);
}

/**
 * Adds `days` business days to `start`, skipping weekends and public holidays.
 * Returns a new Date object; does not mutate `start`.
 */
export function addBusinessDays(
  start: Date,
  days: number,
  holidays: string[] = NIGERIAN_PUBLIC_HOLIDAYS_2026,
): Date {
  const result = new Date(start.getTime());
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (!isNonBusinessDay(result, holidays)) added++;
  }
  return result;
}

/** Settlement windows by payment method (in business days). */
export const SETTLEMENT_DAYS: Record<string, number> = {
  bank_transfer: 0,   // T+0 — instant NIP
  card: 1,            // T+1
  mobile_money: 1,    // T+1
  ussd: 1,            // T+1
  usdc: 0,            // T+0 — on-chain
  bnpl: 2,            // T+2
  fx: 2,              // T+2 — cross-border
};

/**
 * Returns the expected settlement date for a given payment method and value date.
 */
export function settlementDate(
  method: string,
  valueDate: Date = new Date(),
  holidays: string[] = NIGERIAN_PUBLIC_HOLIDAYS_2026,
): Date {
  const days = SETTLEMENT_DAYS[method] ?? 1;
  return days === 0 ? new Date(valueDate.getTime()) : addBusinessDays(valueDate, days, holidays);
}
