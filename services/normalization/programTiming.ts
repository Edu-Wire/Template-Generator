/**
 * services/normalization/programTiming.ts
 *
 * Formats a program's duration and intake(s) from CRM data for use in documents.
 * Only what the CRM states is used: no intake year is ever invented, and when a program offers
 * several intakes the wording says so instead of claiming one of them was chosen.
 */

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function toCount(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function countWord(n: number): string {
  return n <= 10 ? NUMBER_WORDS[n] : String(n);
}

/** "two years", "one year", "one year and six months", "18 months"; "" when unknown. */
export function formatProgramDuration(years: unknown, months: unknown): string {
  const y = toCount(years);
  const m = toCount(months);
  const yText = y > 0 ? `${countWord(y)} ${y === 1 ? "year" : "years"}` : "";
  const mText = m > 0 ? `${countWord(m)} ${m === 1 ? "month" : "months"}` : "";
  if (yText && mText) return `${yText} and ${mText}`;
  return yText || mText;
}

/** Clean, de-duplicated, capitalised intake names in CRM order ("september" -> "September"). */
export function cleanIntakes(intakes: unknown): string[] {
  if (!Array.isArray(intakes)) return [];
  const out: string[] = [];
  for (const raw of intakes) {
    if (typeof raw !== "string") continue;
    const v = raw.trim().replace(/\s+/g, " ");
    if (!v) continue;
    const pretty = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
    if (!out.includes(pretty)) out.push(pretty);
  }
  return out;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "September" / "September and February"; "" when the CRM lists none. */
export function formatIntakeMonths(intakes: unknown): string {
  return joinList(cleanIntakes(intakes));
}

/**
 * Sentence fragment about the intake(s): "starts in September" or
 * "offers intakes in September and February"; "" when the CRM lists none.
 */
export function formatIntakePhrase(intakes: unknown): string {
  const list = cleanIntakes(intakes);
  if (list.length === 0) return "";
  if (list.length === 1) return `starts in ${list[0]}`;
  return `offers intakes in ${joinList(list)}`;
}
