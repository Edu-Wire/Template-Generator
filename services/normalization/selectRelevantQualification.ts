/**
 * services/normalization/selectRelevantQualification.ts
 *
 * Picks the qualification an SOP should be grounded in, based on the level of the
 * program being applied to:
 *   - Bachelor's / undergraduate target  -> the 12th / senior-secondary record
 *   - Master's / postgraduate target     -> the bachelor's (undergraduate) record
 *
 * Nothing is fabricated: if no record matches the preferred level we fall back to the
 * highest-level record that exists, and finally to the first record.
 */

import type { NormalizedQualification } from "@/types/normalizedStudent";
import { DEGREE_KEYWORDS, is12thLevel, is10thLevel, isSchoolLevel, looksLikeSubjectsList } from "./mapNormalizedToResume";

export type TargetLevel = "BACHELORS" | "MASTERS" | "DOCTORATE" | "UNKNOWN";

/** Normalizes a free-text degree level ("Master's", "MSc", "Undergraduate") to a TargetLevel. */
export function classifyTargetLevel(degreeLevel?: string | null): TargetLevel {
  const v = (degreeLevel || "").toLowerCase().trim();
  if (!v) return "UNKNOWN";
  if (/\bph\.?d\b|doctorate|doctoral/.test(v)) return "DOCTORATE";
  if (/master|postgraduate|post-graduate|\bmsc\b|\bm\.?sc\b|\bmba\b|\bm\.?tech\b|\bm\.?a\b|\bllm\b|laurea magistrale/.test(v)) {
    return "MASTERS";
  }
  if (/bachelor|undergraduate|under-graduate|\bbsc\b|\bb\.?sc\b|\bb\.?tech\b|\bbba\b|laurea triennale|\bllb\b/.test(v)) {
    return "BACHELORS";
  }
  return "UNKNOWN";
}

function textOf(q: NormalizedQualification): string {
  return [q.levelOfStudy, q.qualification].filter(Boolean).join(" ");
}

/** True when the record is a 12th / senior-secondary entry. */
export function isTwelfthRecord(q: NormalizedQualification): boolean {
  return is12thLevel(q.levelOfStudy) || is12thLevel(q.qualification);
}

/** True when the record is a school-level (10th/12th) entry. */
function isSchoolRecord(q: NormalizedQualification): boolean {
  return isSchoolLevel(q.levelOfStudy, q.qualification) || is10thLevel(q.levelOfStudy);
}

/** True when the record is an undergraduate / bachelor's degree entry. */
export function isBachelorRecord(q: NormalizedQualification): boolean {
  if (isSchoolRecord(q)) return false;
  const level = (q.levelOfStudy || "").toLowerCase();
  if (/\b(master|postgraduate|post-graduate|doctor|ph\.?d)\b/.test(level)) return false;
  if (/\b(undergraduate|under-graduate|bachelor|graduate)\b/.test(level)) return true;
  const text = textOf(q);
  if (/\b(m\.?tech|m\.?sc|m\.?com|m\.?a|mba|mca|llm|ph\.?d|master|postgraduate|doctorate)\b/i.test(text)) {
    return false;
  }
  return DEGREE_KEYWORDS.test(text) && !/\bdiploma\b/i.test(text);
}

/** Rank used for the fallback ("highest level that exists"). Higher = more advanced. */
function levelRank(q: NormalizedQualification): number {
  if (isTwelfthRecord(q)) return 2;
  if (isSchoolRecord(q)) return 1;
  const text = textOf(q);
  if (/\b(ph\.?d|doctorate)\b/i.test(text)) return 6;
  if (/\b(master|postgraduate|m\.?tech|m\.?sc|m\.?com|mba|mca|llm)\b/i.test(text)) return 5;
  if (isBachelorRecord(q)) return 4;
  return 3; // diploma / unclassified
}

function latestFirst(a: NormalizedQualification, b: NormalizedQualification): number {
  const ay = Number(a.completionYear) || 0;
  const by = Number(b.completionYear) || 0;
  return by - ay;
}

/**
 * Name to show for a qualification in running text. For school records the CRM often stores the
 * subject list in the qualification field ("Accountancy, Business Studies, Economics, …"), which
 * must never be used as the qualification's name — those get a proper title instead.
 */
export function displayQualificationTitle(q: NormalizedQualification | null | undefined): string {
  if (!q) return "";
  const raw = (q.qualification || "").trim();
  // A real title from the CRM ("Senior Secondary Certificate (Class XII)", "BBA") is kept as is.
  if (raw && !looksLikeSubjectsList(raw)) return raw;
  // Only a subject list (or nothing) was stored: name the record by its level instead.
  if (isTwelfthRecord(q)) return "Higher Secondary (Class 12)";
  if (is10thLevel(q.levelOfStudy)) return "Secondary (Class 10)";
  return (q.levelOfStudy || "").trim() || raw;
}

const FIELD_FROM_ABBREVIATION: Record<string, string> = {
  bba: "Business Administration",
  bca: "Computer Applications",
  bcom: "Commerce",
  llb: "Law",
  bhm: "Hotel Management",
  barch: "Architecture",
  mba: "Business Administration",
  mca: "Computer Applications",
  mcom: "Commerce",
  llm: "Law",
};

/**
 * Best available "subjects / field" text for a qualification, without inventing anything:
 *   1. explicit subjects list (12th records), 2. explicit field of study,
 *   3. for degree records only, the field named in the qualification title
 *      ("B.Tech Computer Science" -> "Computer Science"; "AI ML" -> "AI ML").
 * A bare degree name with no field ("B.Tech") yields "" so it stays a visible placeholder.
 */
export function deriveSubjectsText(q: NormalizedQualification | null | undefined): string {
  if (!q) return "";
  if (q.subjects?.trim()) return q.subjects.trim();
  if (q.fieldOfStudy?.trim()) return q.fieldOfStudy.trim();
  if (isSchoolRecord(q)) return "";
  const title = (q.qualification || "").trim();
  if (!title) return "";
  // A bare abbreviation that itself names the field ("BBA" = Business Administration).
  const abbreviation = FIELD_FROM_ABBREVIATION[title.toLowerCase().replace(/[.\s]/g, "")];
  if (abbreviation) return abbreviation;
  const field = title
    .replace(
      /^(?:bachelor|master)s?(?:'s)?\s+(?:of|in)\s+(?:technology|engineering|science|arts|commerce|business administration|computer applications)\b\s*(?:\(.*?\))?\s*(?:in|-|,|:)?\s*/i,
      ""
    )
    .replace(/^(?:b\.?\s?tech|b\.?\s?e|b\.?\s?sc|b\.?\s?com|b\.?\s?a|bba|bca|m\.?\s?tech|m\.?\s?sc|m\.?\s?com|m\.?\s?a|mba|mca)\b\.?\s*(?:\(.*?\))?\s*(?:in|-|,|:)?\s*/i, "")
    .trim();
  if (field && field.toLowerCase() !== title.toLowerCase()) return field;
  // Title had no degree prefix at all (e.g. "AI ML"): the title itself names the field.
  return DEGREE_KEYWORDS.test(title) ? "" : title;
}

export interface SelectedQualification {
  qualification: NormalizedQualification;
  /** Why this record was chosen — useful for debugging and tests. */
  reason: "level-match" | "highest-available" | "first-record";
}

/**
 * Returns the qualification an SOP for `degreeLevel` should be grounded in, or null when the
 * student has no qualification records at all.
 */
export function selectRelevantQualification(
  qualifications: NormalizedQualification[] | undefined | null,
  degreeLevel?: string | null
): SelectedQualification | null {
  const list = (qualifications ?? []).filter(Boolean);
  if (list.length === 0) return null;

  const target = classifyTargetLevel(degreeLevel);

  let preferred: NormalizedQualification[] = [];
  if (target === "BACHELORS") {
    preferred = list.filter(isTwelfthRecord);
  } else if (target === "MASTERS") {
    preferred = list.filter(isBachelorRecord);
  } else if (target === "DOCTORATE") {
    preferred = list.filter((q) => levelRank(q) === 5);
    if (preferred.length === 0) preferred = list.filter(isBachelorRecord);
  }

  if (preferred.length > 0) {
    return { qualification: [...preferred].sort(latestFirst)[0], reason: "level-match" };
  }

  if (target !== "UNKNOWN") {
    // Preferred level is missing: use the highest-level record that exists.
    const sorted = [...list].sort((a, b) => levelRank(b) - levelRank(a) || latestFirst(a, b));
    return { qualification: sorted[0], reason: "highest-available" };
  }

  return { qualification: list[0], reason: "first-record" };
}
