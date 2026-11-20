/**
 * Parse / serialize the text content of the LANGUAGE SKILLS section.
 *
 *   Mother tongue(s): Hindi, Punjabi
 *   Other language(s): English (Listening C1, Reading C1, Writing B2, Spoken Production C1, Spoken Interaction C1); German (B1)
 */
import type { LanguageEntry } from "@/types";

export type LanguageRow = Omit<LanguageEntry, "id">;

const SKILLS: Array<[keyof LanguageRow, string]> = [
  ["listening", "Listening"],
  ["reading", "Reading"],
  ["writing", "Writing"],
  ["spokenProduction", "Spoken Production"],
  ["spokenInteraction", "Spoken Interaction"],
];

/** Split on top-level separators only (ignores commas/semicolons inside parentheses). */
export function splitTopLevel(text: string, seps = /[;,\n•/]/): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && seps.test(ch)) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

export function parseOtherLanguages(text: string): LanguageRow[] {
  return splitTopLevel(text, /[;\n•,]/)
    .map((item) => {
      const m = item.match(/^([^()]+?)\s*(?:\(([^)]*)\))?$/);
      if (!m) return { language: item } as LanguageRow;
      const row: LanguageRow = { language: m[1].trim() };
      const inner = (m[2] ?? "").trim();
      if (inner) {
        let found = false;
        for (const [key, label] of SKILLS) {
          const sm = inner.match(new RegExp(`${label}\\s*[:\\-]?\\s*([ABC][12])`, "i"));
          if (sm) {
            (row as Record<string, string>)[key as string] = sm[1].toUpperCase();
            found = true;
          }
        }
        if (!found) row.level = inner;
      }
      return row;
    })
    .filter((r) => r.language);
}

export function parseLanguageSectionContent(content: string): { motherTongues: string[]; others: LanguageRow[] } {
  const mt = content.match(/mother\s*tou?ngue(?:\(s\))?\s*[-:]\s*([^\n]+)/i);
  const other = content.match(/other\s*language(?:\(s\))?\s*[-:]\s*([^\n]+)/i);
  return {
    motherTongues: mt ? splitTopLevel(mt[1], /[;,/]/) : [],
    others: other ? parseOtherLanguages(other[1]) : [],
  };
}

export function formatOtherLanguage(l: LanguageRow): string {
  const skills = SKILLS.filter(([k]) => l[k]).map(([k, label]) => `${label} ${l[k]}`);
  if (skills.length > 0) return `${l.language} (${skills.join(", ")})`;
  return l.level ? `${l.language} (${l.level})` : (l.language ?? "");
}

export function serializeLanguageSectionContent(motherTongues: string[], others: LanguageRow[]): string {
  const parts: string[] = [];
  const mts = motherTongues.map((m) => m.trim()).filter(Boolean);
  if (mts.length) parts.push(`Mother tongue(s): ${mts.join(", ")}`);
  const langs = others.filter((l) => l.language?.trim()).map(formatOtherLanguage);
  if (langs.length) parts.push(`Other language(s): ${langs.join("; ")}`);
  return parts.join("\n");
}
