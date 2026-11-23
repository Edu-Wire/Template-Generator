/**
 * interpolateTemplate
 *
 * Safe placeholder resolver for SOP templates.
 *
 * Syntax: {{namespace.field}} or {{namespace.nested.field}}
 *
 * Behaviour:
 *   - If the value exists in CRM context → replaced with the verified string value.
 *   - If it is missing and the field is purely descriptive (see NEUTRAL_FALLBACKS) →
 *     replaced with neutral wording that asserts no fact about the student.
 *   - Otherwise → a visible `[MISSING: path]` marker. Embassy and admissions letters must
 *     never contain invented scores, sponsors, insurance, nationality or other facts; the
 *     marker keeps the gap visible to the counsellor and is caught by pre-export checks.
 *
 * This function is intentionally pure and side-effect free.
 * It only resolves values from the provided context object — it
 * does NOT call any external service or generate any content.
 */

import type { StudentDocumentContext } from "../types/sop-generator";

/** The regex that matches {{any.path.here}} */
const PLACEHOLDER_RE = /\{\{([a-zA-Z0-9_.]+)\}\}/g;

/**
 * Resolve a dot-separated path against an arbitrary nested object.
 * Returns `undefined` if any segment is missing or empty string.
 */
export function resolvePath(obj: unknown, path: string): string | undefined {
  const segments = path.split(".");
  let current: unknown = obj;

  for (const seg of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[seg];
  }

  if (current === undefined || current === null || current === "") {
    return undefined;
  }

  return String(current);
}

/**
 * Checks whether a path in ctx is genuinely resolved with a non-empty value,
 * or whether it is missing and would require a fallback.
 */
export function isPlaceholderMissing(ctx: StudentDocumentContext, path: string): boolean {
  return resolvePath(ctx, path) === undefined;
}

/**
 * Fields whose absence may be bridged with neutral wording. Everything else is a
 * factual claim (identity, scores, money, sponsor, logistics, institution facts) and is
 * rendered as a `[MISSING: path]` marker instead of an invented value.
 */
const NEUTRAL_FALLBACKS: Record<string, string> = {
  // Optional trailing sentence about extra entrance tests; omitted entirely when absent.
  "tests.additionalTestsText": "",
};

/** Matches the visible marker emitted for unresolved factual placeholders. */
export const MISSING_MARKER_RE = /\[MISSING:\s*([^\]]+)\]/g;

/**
 * Neutral wording for a missing descriptive field, or `null` when the field is factual
 * and must be shown as missing rather than filled in.
 */
export function getNaturalFallback(path: string): string | null {
  return Object.prototype.hasOwnProperty.call(NEUTRAL_FALLBACKS, path) ? NEUTRAL_FALLBACKS[path] : null;
}

export interface InterpolateOptions {
  /** If true, every missing value (including neutral fields) renders as [MISSING: path]. */
  rawMissingTokens?: boolean;
  /**
   * If true, nothing is ever rendered as `[MISSING: …]`. An optional segment `[[ … ]]` that
   * contains an unresolved placeholder is dropped whole, and any other unresolved placeholder
   * is removed. The gaps are reported separately (see getUnresolvedPlaceholders) so the UI can
   * list them in a "Missing Details" panel instead of showing them inside the letter.
   */
  omitMissing?: boolean;
}

/**
 * Optional segment: `[[ from {{student.city}}, ]]` — kept only when every placeholder inside
 * resolves. Segments may nest; this matches an innermost one (no `[[` inside it).
 */
const INNERMOST_SEGMENT_RE = /\[\[((?:(?!\[\[)[\s\S])*?)\]\]/;

function tidyAfterOmission(text: string): string {
  return text
    // Emphasis left empty by an omitted value ("****", "**  **", "__") must never show up.
    .replace(/\*\*\s*\*\*/g, "")
    .replace(/(^|[^_])__\s*__/g, "$1")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/([,;:])\s*([.!?])/g, "$2")
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    // A paragraph that is nothing but leftover punctuation means every clause was omitted.
    .replace(/^[\s.,;:!?]+$/, "");
}

/**
 * Replace all `{{placeholder}}` tokens in `template` using values from `ctx`.
 *
 * @param template  Raw template string with `{{ns.field}}` tokens.
 * @param ctx       The resolved StudentDocumentContext.
 * @param options   Optional configuration flags.
 * @returns         Rendered string with verified values, neutral wording for descriptive
 *                  fields, and `[MISSING: path]` for any missing factual field.
 */
export function interpolate(
  template: string,
  ctx: StudentDocumentContext,
  options?: InterpolateOptions
): string {
  const omit = Boolean(options?.omitMissing);

  // Optional segments: dropped whole when omitting and anything inside is unresolved;
  // otherwise just unwrapped so placeholders behave exactly as before.
  // Resolved innermost-first so segments can nest ("[[ at X[[, in {{city}}]] ]]").
  let withSegments = template;
  for (let guard = 0; guard < 50 && INNERMOST_SEGMENT_RE.test(withSegments); guard++) {
    withSegments = withSegments.replace(INNERMOST_SEGMENT_RE, (_m, inner: string) => {
      if (!omit) return inner;
      const allResolved = extractPlaceholders(inner).every((p) => resolvePath(ctx, p) !== undefined);
      return allResolved ? inner : "";
    });
  }

  const rendered = withSegments.replace(PLACEHOLDER_RE, (_match, path: string) => {
    const value = resolvePath(ctx, path);
    if (value !== undefined) {
      return value;
    }
    if (omit) return "";
    const neutral = options?.rawMissingTokens ? null : getNaturalFallback(path);
    return neutral !== null ? neutral : `[MISSING: ${path}]`;
  });

  return omit ? tidyAfterOmission(rendered) : rendered;
}

/**
 * Placeholder paths used by `template` that have no value in `ctx` — i.e. the details that
 * would be missing from the rendered text. Optional neutral-fallback fields are not reported.
 */
export function getUnresolvedPlaceholders(template: string, ctx: StudentDocumentContext): string[] {
  return extractPlaceholders(template).filter(
    (p) => resolvePath(ctx, p) === undefined && getNaturalFallback(p) === null
  );
}

/**
 * Returns a list of all placeholder paths used in the given template string.
 * Useful for ahead-of-time validation — checking which fields are required.
 */
export function extractPlaceholders(template: string): string[] {
  const found: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, "g");

  while ((match = re.exec(template)) !== null) {
    if (!found.includes(match[1])) {
      found.push(match[1]);
    }
  }

  return found;
}

/** Unique placeholder paths still shown as `[MISSING: …]` in rendered text. */
export function findMissingMarkers(rendered: string): string[] {
  const found = new Set<string>();
  for (const m of rendered.matchAll(MISSING_MARKER_RE)) found.add(m[1].trim());
  return [...found];
}
