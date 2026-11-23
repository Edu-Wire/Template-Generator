/**
 * features/dashboard/utils/sopMissingFields.ts
 *
 * Statement of Purpose: renders the template WITHOUT any `[MISSING: …]` text inside the
 * letter, and reports the unresolved details separately so the Studio can list them in the
 * "Missing Details" panel. Values the counsellor supplies there are kept as `fieldValues`
 * and applied on top of the CRM context.
 */

import type { StudentDocumentContext } from "@/features/sop-generator/types/sop-generator";
import { universitySopTemplate } from "@/features/sop-generator/templates/university-sop";
import {
  getUnresolvedPlaceholders,
  interpolate,
  resolvePath,
} from "@/features/sop-generator/lib/interpolateTemplate";
import {
  CATEGORY_ICONS,
  VALIDATION_FIELDS_DEFINITIONS,
  type ValidationCategory,
  type ValidationCategoryGroup,
  type ValidationFieldDefinition,
} from "./coverLetterCleaner";

/** SOP fields the shared cover-letter definitions don't cover. */
const SOP_EXTRA_DEFINITIONS: ValidationFieldDefinition[] = [
  {
    key: "student.fullName",
    label: "Student Full Name",
    category: "Personal",
    question: "What is the student's full name?",
    placeholder: "Umar Ali Khan",
  },
  {
    key: "destination.city",
    label: "University City",
    category: "University",
    question: "In which city is the university located?",
    placeholder: "Catania",
  },
  {
    key: "destination.country",
    label: "University Country",
    category: "University",
    question: "In which country is the university located?",
    placeholder: "Italy",
  },
  {
    key: "destination.degreeLevel",
    label: "Degree Level",
    category: "University",
    question: "Is this a Bachelor's or a Master's program?",
    placeholder: "Master's",
  },
  {
    key: "academics.percentage",
    label: "Score / Percentage",
    category: "Academic",
    question: "What score or percentage did the student achieve in this qualification?",
    placeholder: "85%",
  },
];

const DEFINITIONS_BY_KEY = new Map<string, ValidationFieldDefinition>(
  [...VALIDATION_FIELDS_DEFINITIONS, ...SOP_EXTRA_DEFINITIONS].map((d) => [d.key, d])
);

const CATEGORY_ORDER: ValidationCategory[] = ["Personal", "Academic", "University"];

function titleCase(s: string): string {
  return s
    .replace(/([A-Z])/g, " $1")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function definitionFor(path: string): ValidationFieldDefinition {
  const known = DEFINITIONS_BY_KEY.get(path);
  if (known) return known;
  const [ns, ...rest] = path.split(".");
  const label = titleCase(rest.join(".") || path);
  return {
    key: path,
    label,
    category: ns === "academics" ? "Academic" : ns === "destination" ? "University" : "Personal",
    question: `What is the ${label.toLowerCase()}?`,
    placeholder: "",
  };
}

/** Name-like fields that read wrong in all lower case ("catania", "university of messina"). */
const NAME_LIKE_KEYS = new Set([
  "student.fullName",
  "student.city",
  "student.country",
  "destination.city",
  "destination.country",
  "destination.university",
  "destination.course",
  "academics.institution",
  "academics.board",
]);
const LOWERCASE_WORDS = new Set(["of", "and", "the", "in", "for", "di", "del", "della", "degli", "e", "de", "la"]);

/**
 * Tidies a value typed into the chat. Only name-like fields typed entirely in lower case are
 * capitalised ("catania" -> "Catania"); anything with its own capitals is left exactly as typed.
 */
export function normalizeSopFieldValue(key: string, raw: string): string {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!NAME_LIKE_KEYS.has(key) || value !== value.toLowerCase()) return value;
  return value
    .split(" ")
    .map((w, i) =>
      i > 0 && LOWERCASE_WORDS.has(w) ? w : w.replace(/(^|[-'’(])([a-zà-ÿ])/g, (_m, p: string, c: string) => p + c.toUpperCase())
    )
    .join(" ");
}

/** `ctx` with the supplied `fieldValues` (dot-paths) laid over it. Never mutates `ctx`. */
export function applyFieldValues(
  ctx: StudentDocumentContext,
  fieldValues?: Record<string, string>
): StudentDocumentContext {
  const next = JSON.parse(JSON.stringify(ctx ?? {})) as Record<string, unknown>;
  for (const [path, raw] of Object.entries(fieldValues ?? {})) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value || value.toUpperCase().includes("MISSING")) continue;
    const segments = path.split(".");
    let cur = next;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (cur[seg] === null || typeof cur[seg] !== "object") cur[seg] = {};
      cur = cur[seg] as Record<string, unknown>;
    }
    cur[segments[segments.length - 1]] = value;
  }
  return next as unknown as StudentDocumentContext;
}

/** SOP sections with no `[MISSING: …]` text; unresolved clauses are dropped from the prose. */
export function renderSopSections(
  ctx: StudentDocumentContext | null | undefined,
  fieldValues?: Record<string, string>
): { heading: string; content: string }[] {
  const applied = applyFieldValues(ctx ?? ({} as StudentDocumentContext), fieldValues);
  return universitySopTemplate.sections.map((sec) => ({
    heading: sec.title,
    content: interpolate(sec.content, applied, { omitMissing: true }),
  }));
}

/**
 * Facts the CRM often does not state and the SOP reads fine without (program length and
 * intake). They are used when present but never reported as "missing details".
 */
const OPTIONAL_KEYS = new Set([
  "destination.duration",
  "destination.intakeText",
  "destination.intakeMonth",
  "destination.intakeYear",
]);

/** Unique placeholder paths the SOP needs that are still unresolved. */
export function getSopMissingKeys(
  ctx: StudentDocumentContext | null | undefined,
  fieldValues?: Record<string, string>
): string[] {
  const applied = applyFieldValues(ctx ?? ({} as StudentDocumentContext), fieldValues);
  const seen = new Set<string>();
  for (const sec of universitySopTemplate.sections) {
    for (const path of getUnresolvedPlaceholders(sec.content, applied)) seen.add(path);
  }
  return [...seen].filter((p) => !OPTIONAL_KEYS.has(p) && resolvePath(applied, p) === undefined);
}

/** Missing SOP details grouped for the "Missing Details" panel. */
export function getSopMissingGroups(
  ctx: StudentDocumentContext | null | undefined,
  fieldValues?: Record<string, string>
): ValidationCategoryGroup[] {
  const byCategory = new Map<ValidationCategory, ValidationFieldDefinition[]>();
  for (const key of getSopMissingKeys(ctx, fieldValues)) {
    const def = definitionFor(key);
    const list = byCategory.get(def.category) ?? [];
    list.push(def);
    byCategory.set(def.category, list);
  }
  const order = [...CATEGORY_ORDER, ...[...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c))];
  return order
    .filter((c) => (byCategory.get(c) ?? []).length > 0)
    .map((category) => ({ category, icon: CATEGORY_ICONS[category], fields: byCategory.get(category)! }));
}

export function getSopMissingCount(
  ctx: StudentDocumentContext | null | undefined,
  fieldValues?: Record<string, string>
): number {
  return getSopMissingKeys(ctx, fieldValues).length;
}

/**
 * After a detail is supplied, rewrites only the sections that were still the untouched
 * rendering — sections the counsellor has edited by hand are left exactly as they are.
 */
export function updateSopSectionsWithFields(
  currentSections: { heading: string; content: string }[],
  ctx: StudentDocumentContext | null | undefined,
  previousFieldValues: Record<string, string> | undefined,
  nextFieldValues: Record<string, string>
): { sections: { heading: string; content: string }[]; keptEditedSections: string[] } {
  const before = renderSopSections(ctx, previousFieldValues);
  const after = renderSopSections(ctx, nextFieldValues);
  const keptEditedSections: string[] = [];
  const sections = currentSections.map((sec, i) => {
    const wasUntouched = before[i] && sec.content === before[i].content;
    if (!after[i] || after[i].content === before[i]?.content) return sec;
    if (wasUntouched) return { ...sec, content: after[i].content };
    keptEditedSections.push(sec.heading);
    return sec;
  });
  return { sections, keptEditedSections };
}
