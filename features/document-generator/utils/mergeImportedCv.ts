/**
 * features/document-generator/utils/mergeImportedCv.ts
 *
 * Merges a freshly imported CV into the CV that is already stored/open.
 * Rule: existing data is never overwritten or removed. The upload only
 *   - fills personal fields / text blocks that are currently empty,
 *   - appends list entries that are not already present, and
 *   - adds custom sections whose title is not already used.
 * The profile photo is never taken from the uploaded resume.
 * A personal field can still be replaced when the counsellor explicitly chose the
 * uploaded value for a CRM conflict (`overridePersonalFields`).
 */

import type { DocumentData, PersonalDetails } from "@/types";

export interface MergeSummaryItem {
  key: string;
  label: string;
  /** Entries (or fields) taken from the uploaded CV. */
  added: number;
  /** Entries already in the CV that stay untouched. */
  kept: number;
  /** Uploaded entries skipped because the CV already has them. */
  duplicates: number;
}

export interface MergeResult {
  data: DocumentData;
  summary: MergeSummaryItem[];
}

export interface MergeOptions {
  /** Personal fields (e.g. "email") for which the uploaded value should replace the stored one. */
  overridePersonalFields?: string[];
  /** Replace the stored English test score with the uploaded one (CRM conflict resolved to the upload). */
  overrideEnglishScore?: boolean;
}

type ListKey =
  | "education"
  | "internships"
  | "academicProjects"
  | "achievements"
  | "leadershipActivities"
  | "volunteering"
  | "certifications"
  | "skills"
  | "hobbies"
  | "academicInterests"
  | "languages"
  | "recommendations";

const LIST_SECTIONS: { key: ListKey; label: string; identity: (e: Record<string, unknown>) => string }[] = [
  { key: "education", label: "Education", identity: (e) => `${e.qualification ?? ""}|${e.institution ?? ""}` },
  { key: "internships", label: "Work Experience", identity: (e) => `${e.role ?? ""}|${e.company ?? ""}` },
  { key: "academicProjects", label: "Academic Projects", identity: (e) => `${e.title ?? ""}` },
  { key: "achievements", label: "Achievements", identity: (e) => `${e.title ?? ""}` },
  { key: "leadershipActivities", label: "Leadership", identity: (e) => `${e.activity ?? ""}` },
  { key: "volunteering", label: "Volunteering", identity: (e) => `${e.role ?? ""}|${e.organization ?? ""}` },
  { key: "certifications", label: "Certifications", identity: (e) => `${e.name ?? ""}` },
  { key: "skills", label: "Skills", identity: (e) => `${e.name ?? ""}` },
  { key: "hobbies", label: "Hobbies", identity: (e) => `${e.name ?? ""}` },
  { key: "academicInterests", label: "Academic Interests", identity: (e) => `${e.name ?? ""}` },
  { key: "languages", label: "Languages", identity: (e) => `${e.language ?? ""}` },
  { key: "recommendations", label: "Recommendations", identity: (e) => `${e.recommenderName ?? ""}` },
];

/**
 * Custom sections that are really parser leftovers (a failed import can save table headings,
 * bullet lines or letter-spaced headings such as "S K I L L S" as sections). They are skipped.
 */
export function isJunkCustomSection(title: string, content: string): boolean {
  const t = title.trim();
  if (!t || !content.trim()) return true;
  if (/^[▪•·●◦■□\-*–—]/.test(t)) return true;
  if (/^(?:\S{1,3}\s+){3,}\S{1,3}$/.test(t)) return true; // letter-spaced heading
  const collapsed = t.toLowerCase().replace(/[^a-z&]/g, "");
  return /^(academicprofile|accomplishments&?honors|skills|internshipexperience|certifications&?projects|roles&?|responsibilities|education|experience|workexperience|projects|certifications|achievements|declaration|aboutme)$/.test(collapsed);
}


// ── Fuzzy "is this the same item?" helpers ─────────────────────────────────────
// CRM data and a resume often describe the same item with different wording
// ("Csit" vs "Btech-CSIT", "Inwizio" vs "Inwizio Technologies"), so exact comparison misses duplicates.

const ORG_STOPWORDS = new Set([
  "the", "of", "and", "at", "in", "for", "int", "intl", "international", "cbse", "icse", "school", "college",
  "university", "institute", "institution", "academy", "technologies", "technology", "tech", "solutions",
  "pvt", "private", "ltd", "limited", "inc", "llp", "corp", "company", "co", "labs", "systems", "services",
  "india", "indore", "pune", "mumbai", "delhi", "bangalore", "bengaluru", "mp", "mh",
]);

function orgTokens(value: unknown): string[] {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !ORG_STOPWORDS.has(t));
}

/** Organisation names match when one's meaningful words are all contained in the other's. */
function sameOrganisation(a: unknown, b: unknown): boolean {
  const ta = orgTokens(a);
  const tb = orgTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return small.every((t) => large.includes(t));
}

/** Words of a title, ignoring punctuation (used for projects, achievements, certifications). */
function titleTokens(value: unknown): string[] {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function similarTitle(a: unknown, b: unknown): boolean {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return small.length >= 2 && small.every((t) => large.includes(t));
}

/** School level implied by a qualification name; null when it says nothing (e.g. "Csit"). */
function educationLevel(q: unknown): string | null {
  const t = String(q ?? "").toLowerCase();
  if (/\b(xii|12th|twelfth|hsc|senior secondary|pcb|pcm|plus two|\+2)\b/.test(t)) return "12";
  if (/\b(x|10th|tenth|ssc|secondary)\b/.test(t)) return "10";
  if (/\b(b\.?\s?tech|btech|b\.?\s?e|bsc|b\.?\s?sc|bca|bba|b\.?\s?com|bachelor)/.test(t)) return "bachelor";
  if (/\b(m\.?\s?tech|mtech|msc|m\.?\s?sc|mca|mba|master)/.test(t)) return "master";
  return null;
}

function yearOf(value: unknown, last = false): number | null {
  const years = String(value ?? "").match(/(?:19|20)\d{2}/g);
  if (!years) return null;
  return Number(last ? years[years.length - 1] : years[0]);
}

/** True when the two dates (any format) point to the same year, within `tolerance`; unknown dates do not conflict. */
function yearsCompatible(a: unknown, b: unknown, tolerance: number): boolean {
  const ya = yearOf(a);
  const yb = yearOf(b);
  if (ya === null || yb === null) return true;
  return Math.abs(ya - yb) <= tolerance;
}

type Entry = Record<string, unknown>;

/** Entries with the same name but clearly different dates are different stints, not duplicates. */
const DATES_COMPATIBLE: Partial<Record<ListKey, (a: Entry, b: Entry) => boolean>> = {
  education: (a, b) => yearsCompatible(a.startDate, b.startDate, 1) && yearsCompatible(a.endDate, b.endDate, 1),
  internships: (a, b) => yearsCompatible(a.startDate, b.startDate, 0) && yearsCompatible(a.endDate, b.endDate, 0),
  volunteering: (a, b) => yearsCompatible(a.startDate, b.startDate, 0) && yearsCompatible(a.endDate, b.endDate, 0),
};

/** Per-section "same item" test used on top of the exact identity comparison. */
const FUZZY_MATCH: Partial<Record<ListKey, (a: Entry, b: Entry) => boolean>> = {
  education: (a, b) => {
    if (!sameOrganisation(a.institution, b.institution)) return false;
    const la = educationLevel(a.qualification);
    const lb = educationLevel(b.qualification);
    if (la && lb && la !== lb) return false;
    // Without any date on either side there is not enough evidence for same-school entries
    const hasDates = (yearOf(a.startDate) !== null && yearOf(b.startDate) !== null) ||
      (yearOf(a.endDate, true) !== null && yearOf(b.endDate, true) !== null);
    if (!hasDates) return la !== null && la === lb;
    return yearsCompatible(a.startDate, b.startDate, 1) && yearsCompatible(a.endDate, b.endDate, 1);
  },
  internships: (a, b) => {
    if (!sameOrganisation(a.company, b.company)) return false;
    return yearsCompatible(a.startDate, b.startDate, 0) && yearsCompatible(a.endDate, b.endDate, 0);
  },
  volunteering: (a, b) =>
    sameOrganisation(a.organization, b.organization) &&
    yearsCompatible(a.startDate, b.startDate, 0) &&
    yearsCompatible(a.endDate, b.endDate, 0),
  academicProjects: (a, b) => similarTitle(a.title, b.title),
  achievements: (a, b) => similarTitle(a.title, b.title),
  certifications: (a, b) => similarTitle(a.name, b.name) && (isBlank(a.provider) || isBlank(b.provider) || sameOrganisation(a.provider, b.provider)),
  leadershipActivities: (a, b) => similarTitle(a.activity, b.activity),
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

export function mergeImportedIntoCv(
  existing: DocumentData,
  imported: DocumentData,
  options: MergeOptions = {}
): MergeResult {
  const overrides = new Set(options.overridePersonalFields ?? []);
  const summary: MergeSummaryItem[] = [];
  const data: DocumentData = JSON.parse(JSON.stringify(existing));

  // ── Personal details ──────────────────────────────────────────────────────
  const personal: PersonalDetails = { ...(data.personal ?? {}) };
  let personalAdded = 0;
  let personalKept = 0;
  for (const [field, value] of Object.entries(imported.personal ?? {})) {
    if (isBlank(value) || field === "photoUrl") {
      continue;
    }
    const current = (personal as Record<string, unknown>)[field];
    if (isBlank(current) || overrides.has(field)) {
      if (current !== value) personalAdded++;
      (personal as Record<string, unknown>)[field] = value;
    } else {
      personalKept++;
    }
  }
  // The profile photo always comes from the CRM / stored CV, never from an uploaded resume.
  data.personal = personal;
  summary.push({ key: "personal", label: "Personal Details", added: personalAdded, kept: personalKept, duplicates: 0 });

  // ── Single text blocks ────────────────────────────────────────────────────
  const textBlocks: { key: "aboutMe" | "declaration" | "motherTongue"; label: string }[] = [
    { key: "aboutMe", label: "About Me" },
    { key: "declaration", label: "Declaration" },
    { key: "motherTongue", label: "Mother Tongue" },
  ];
  for (const { key, label } of textBlocks) {
    const incoming = imported[key];
    if (isBlank(incoming)) continue;
    if (isBlank(data[key])) {
      data[key] = incoming;
      summary.push({ key, label, added: 1, kept: 0, duplicates: 0 });
    } else {
      summary.push({ key, label, added: 0, kept: 1, duplicates: 1 });
    }
  }

  // ── English certificate ───────────────────────────────────────────────────
  if (imported.englishCertificate) {
    const hasStored = Object.values(data.englishCertificate ?? {}).some((v) => !isBlank(v));
    const hasIncoming = Object.values(imported.englishCertificate).some((v) => !isBlank(v));
    if (hasIncoming && hasStored && options.overrideEnglishScore && imported.englishCertificate.score) {
      data.englishCertificate = { ...data.englishCertificate, score: imported.englishCertificate.score };
      summary.push({ key: "englishCertificate", label: "English Certificate", added: 1, kept: 0, duplicates: 0 });
    } else if (hasIncoming && !hasStored) {
      data.englishCertificate = { ...imported.englishCertificate };
      summary.push({ key: "englishCertificate", label: "English Certificate", added: 1, kept: 0, duplicates: 0 });
    } else if (hasIncoming) {
      summary.push({ key: "englishCertificate", label: "English Certificate", added: 0, kept: 1, duplicates: 1 });
    }
  }

  // ── Repeatable list sections ──────────────────────────────────────────────
  const newlyPopulated: string[] = [];
  for (const { key, label, identity } of LIST_SECTIONS) {
    const incoming = ((imported[key] as Record<string, unknown>[] | undefined) ?? []).filter((e) => {
      const id = norm(identity(e));
      return id.length > 0;
    });
    if (incoming.length === 0) continue;

    const current = ((data[key] as Record<string, unknown>[] | undefined) ?? []).filter((e) => norm(identity(e)).length > 0);
    const usedIds = new Set(current.map((e) => String(e.id)));
    const fuzzy = FUZZY_MATCH[key];
    // Everything already in the CV, plus entries accepted from this upload (so the upload can't duplicate itself)
    const known: Entry[] = [...current];
    const datesOk = DATES_COMPATIBLE[key];
    const isKnown = (entry: Entry) =>
      known.some(
        (k) =>
          (norm(identity(k)) === norm(identity(entry)) && (datesOk ? datesOk(k, entry) : true)) ||
          (fuzzy ? fuzzy(k, entry) : false)
      );

    let added = 0;
    let duplicates = 0;
    const merged = [...((data[key] as Record<string, unknown>[] | undefined) ?? [])];
    for (const entry of incoming) {
      if (isKnown(entry)) {
        duplicates++;
        continue;
      }
      known.push(entry);
      const entryId = usedIds.has(String(entry.id)) ? `${String(entry.id)}-imp${added}` : String(entry.id);
      usedIds.add(entryId);
      merged.push({ ...entry, id: entryId });
      added++;
    }
    (data as Record<string, unknown>)[key] = merged;
    if (added > 0 && current.length === 0) newlyPopulated.push(key);
    summary.push({ key, label, added, kept: current.length, duplicates });
  }

  // ── Custom sections ───────────────────────────────────────────────────────
  const incomingCustom = (imported.customSections ?? []).filter((c) => !isJunkCustomSection(c.title, c.content));
  if (incomingCustom.length > 0) {
    const titles = new Set((data.customSections ?? []).map((c) => norm(c.title)));
    const mergedCustom = [...(data.customSections ?? [])];
    let added = 0;
    let duplicates = 0;
    for (const section of incomingCustom) {
      if (titles.has(norm(section.title))) {
        duplicates++;
        continue;
      }
      titles.add(norm(section.title));
      mergedCustom.push(section);
      added++;
    }
    data.customSections = mergedCustom;
    summary.push({ key: "customSections", label: "Other sections", added, kept: (existing.customSections ?? []).length, duplicates });
  }

  // ── Section order: keep the stored order, append sections that just got content ─
  const orderIds: Record<string, string> = {
    internships: "internships",
    leadershipActivities: "leadershipActivities",
  };
  if (data.sectionOrder && newlyPopulated.length > 0) {
    for (const key of newlyPopulated) {
      const id = orderIds[key] ?? key;
      if (!data.sectionOrder.includes(id)) data.sectionOrder.push(id);
    }
  }
  if (data.pendingSections) {
    data.pendingSections = data.pendingSections.filter((id) => !newlyPopulated.includes(id));
  }

  return { data, summary };
}
