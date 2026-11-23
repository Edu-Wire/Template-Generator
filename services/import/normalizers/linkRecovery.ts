/**
 * services/import/normalizers/linkRecovery.ts
 *
 * Recovers hyperlinks that the AI classifier drops. The classifier only returns the fields in its
 * schema, so a CV line such as "Website: https://school.edu | Final grade: 7.5" loses its URL
 * unless we re-attach it from the raw text (or from the PDF's link annotations).
 *
 * Only fills values that are empty — anything the AI already returned is left alone.
 */

import type { DocumentData } from "@/types";

const URL_SOURCE = String.raw`(?:https?:\/\/|www\.)[^\s|<>"')\]]+`;

/** Strips punctuation that trails a URL in running text. */
export function cleanExtractedUrl(raw: string): string {
  return raw.replace(/[.,;:!?)\]}>'"]+$/, "").trim();
}

/** All distinct URLs in the text, in document order. */
export function extractUrls(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(new RegExp(URL_SOURCE, "gi"))) {
    const url = cleanExtractedUrl(m[0]);
    const key = url.toLowerCase().replace(/\/$/, "");
    if (url && !seen.has(key)) {
      seen.add(key);
      out.push(url);
    }
  }
  return out;
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
const sameUrl = (a: string, b: string) =>
  a.toLowerCase().replace(/\/$/, "") === b.toLowerCase().replace(/\/$/, "");

/** First URL that follows `anchor` in the text, within `window` characters. */
function urlAfter(text: string, anchor: string, window: number, taken: Set<string>): string | undefined {
  const key = norm(anchor);
  if (key.length < 3) return undefined;
  // Find the anchor ignoring spaces/punctuation differences.
  const compact = text.replace(/\s+/g, " ");
  const idx = compact.toLowerCase().indexOf(anchor.trim().toLowerCase().replace(/\s+/g, " "));
  if (idx < 0) return undefined;
  const after = compact.slice(idx + anchor.length, idx + anchor.length + window);
  for (const url of extractUrls(after)) {
    if (!taken.has(url.toLowerCase())) return url;
  }
  return undefined;
}

export function recoverLinks(data: DocumentData, rawText: string, annotationLinks: string[] = []): DocumentData {
  const text = rawText || "";
  const allUrls = extractUrls(`${text}\n${annotationLinks.join("\n")}`);
  const used = new Set<string>();

  // ── Education: "Website: <url>" after each institution ───────────────────────
  // Entries that already carry a website keep it; their URL is reserved so it is not reused.
  for (const e of data.education ?? []) {
    if (!isBlank(e.website)) used.add(String(e.website).trim().toLowerCase());
  }
  const edu = data.education ?? [];
  const missing = edu.filter((e) => isBlank(e.website));
  if (missing.length > 0) {
    // Walk the entries in order so two entries of the same school (Grade 12 / Grade 10) each get the next URL.
    let cursor = 0;
    for (const e of edu) {
      if (isBlank(e.institution)) continue;
      const compact = text.replace(/\s+/g, " ");
      const lower = compact.toLowerCase();
      const needle = String(e.institution).trim().toLowerCase().replace(/\s+/g, " ");
      const at = lower.indexOf(needle, cursor);
      if (at < 0) continue;
      cursor = at + needle.length;
      if (!isBlank(e.website)) continue;
      // Stop at the next entry's institution so one entry never takes another's URL.
      let end = Math.min(compact.length, cursor + 700);
      for (const other of edu) {
        if (other === e || isBlank(other.institution)) continue;
        const o = String(other.institution).trim().toLowerCase().replace(/\s+/g, " ");
        if (o === needle) continue;
        const oi = lower.indexOf(o, cursor);
        if (oi >= 0 && oi < end) end = oi;
      }
      const slice = compact.slice(cursor, end);
      // Prefer an explicit "Website:" label; otherwise any URL in this entry's block.
      const labelled = slice.match(new RegExp(String.raw`website\s*:?\s*(${URL_SOURCE})`, "i"));
      const url = labelled ? cleanExtractedUrl(labelled[1]) : extractUrls(slice)[0];
      if (url) {
        e.website = url;
        used.add(url.toLowerCase());
      }
    }
  }

  // ── Personal links ───────────────────────────────────────────────────────────
  const personal = { ...(data.personal ?? {}) };
  const header = text.slice(0, 1500);
  const headerUrls = extractUrls(`${header}\n${annotationLinks.join("\n")}`);
  const pick = (re: RegExp) => allUrls.find((u) => re.test(u));
  if (isBlank(personal.linkedinUrl)) {
    const u = pick(/linkedin\.com/i);
    if (u) personal.linkedinUrl = u;
  }
  if (isBlank(personal.githubUrl)) {
    const u = pick(/github\.com/i);
    if (u) personal.githubUrl = u;
  }
  if (isBlank(personal.portfolioUrl)) {
    const u = headerUrls.find(
      (x) =>
        !/linkedin\.com|github\.com|mailto:/i.test(x) &&
        !used.has(x.toLowerCase()) &&
        !(data.education ?? []).some((e) => !isBlank(e.website) && sameUrl(String(e.website), x))
    );
    if (u) personal.portfolioUrl = u;
  }
  data.personal = personal;

  // ── Project links and certificate credential links ───────────────────────────
  const taken = new Set<string>([...used]);
  for (const p of data.academicProjects ?? []) {
    if (isBlank(p.link) && !isBlank(p.title)) {
      const u = urlAfter(text, String(p.title), 400, taken);
      if (u) {
        p.link = u;
        taken.add(u.toLowerCase());
      }
    }
  }
  for (const c of data.certifications ?? []) {
    if (isBlank(c.credentialLink) && !isBlank(c.name)) {
      const u = urlAfter(text, String(c.name), 400, taken);
      if (u) {
        c.credentialLink = u;
        taken.add(u.toLowerCase());
      }
    }
  }

  return data;
}
