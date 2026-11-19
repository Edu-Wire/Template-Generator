/**
 * features/document-generator/utils/crmResume.ts
 *
 * Finds resume / CV files that are already stored on the CRM student record, so the
 * counsellor can import one without downloading and re-uploading it.
 */

import type { CrmSnapshot } from "@/types/crmSnapshot";

export interface CrmResumeFile {
  /** Document name as shown in the CRM (e.g. "Resume"). */
  name: string;
  url: string;
  uploadedOn?: string;
}

const RESUME_NAME = /\b(resume|résumé|cv|curriculum\s+vitae)\b/i;

export function findCrmResumeFiles(snapshot: CrmSnapshot | null | undefined): CrmResumeFile[] {
  if (!snapshot) return [];
  const docs = [...(snapshot.documents ?? []), ...(snapshot.student?.documents ?? [])];
  const found: CrmResumeFile[] = [];
  const seen = new Set<string>();

  for (const doc of docs) {
    if (!RESUME_NAME.test(doc.name ?? "") && !RESUME_NAME.test(doc.category ?? "")) continue;
    for (const file of doc.files ?? []) {
      const url = (file.url || file.fileUrl || "").trim();
      if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
      seen.add(url);
      found.push({ name: doc.name?.trim() || "Resume", url, uploadedOn: doc.uploadedOn });
    }
  }
  return found;
}
