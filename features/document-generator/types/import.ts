/**
 * features/document-generator/types/import.ts
 *
 * Domain types for Resume Document Import and Interactive Review.
 */

import type { DocumentData } from "@/types";

export type ImportStatus =
  | "IDLE"
  | "UPLOADING"
  | "PROCESSING"
  | "NEEDS_REVIEW"
  | "APPLIED"
  | "FAILED";

export interface AmbiguousItem {
  id: string;
  originalText: string;
  suggestedSection: keyof DocumentData;
  candidateSections: (keyof DocumentData)[];
  reason: string;
}

export interface CrmConflictItem {
  field: string;
  label: string;
  crmValue: string;
  uploadedValue: string;
  resolution: "USE_CRM" | "USE_UPLOADED" | "CUSTOM";
  customValue?: string;
}

export interface DetectedSectionSummary {
  sectionKey: keyof DocumentData;
  title: string;
  itemCount: number;
  status: "DETECTED" | "NEEDS_REVIEW" | "NOT_FOUND" | "CONFLICT";
}

export interface ResumeImportResult {
  importId: string;
  fileName: string;
  fileSizeBytes: number;
  extractedAt: string;
  status: ImportStatus;
  data: DocumentData;
  sectionsSummary: DetectedSectionSummary[];
  ambiguousItems: AmbiguousItem[];
  crmConflicts: CrmConflictItem[];
  unmappedSnippets: string[];
  /** Problems the counsellor should know about before applying (e.g. the AI step failed). */
  warnings?: string[];
  gridfsFileId?: string;
  errorMessage?: string;
}

/** What the counsellor explicitly chose to replace when applying an import onto an existing CV. */
export interface ImportOverrides {
  /** Personal fields whose stored value should be replaced by the uploaded one. */
  personalFields: string[];
  /** Replace the stored English test score with the uploaded one. */
  englishScore: boolean;
}
