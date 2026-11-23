/**
 * features/sop-generator/lib/programSelection.ts
 *
 * Single source of truth for "which applied program is this SOP for?".
 * Used by the workspace, the generate route and draft handling so they cannot disagree.
 */

import type { NormalizedAppliedProgram } from "@/types/normalizedStudent";
import type { SopDraftRecord } from "../types/sop-generator";

/** "University — Course (Degree level) · Applied/Shortlisted" label shown in the program dropdown. */
export function formatProgramLabel(
  prog: Pick<NormalizedAppliedProgram, "university" | "course" | "degreeLevel"> &
    Partial<Pick<NormalizedAppliedProgram, "status">>
): string {
  const base = [prog.university, prog.course].filter(Boolean).join(" — ") || "Untitled program";
  const withLevel = prog.degreeLevel ? `${base} (${prog.degreeLevel})` : base;
  if (prog.status === "applied") return `${withLevel} · Applied`;
  if (prog.status === "shortlisted") return `${withLevel} · Shortlisted`;
  return withLevel;
}

/**
 * Resolves the selected program: the one matching `programId`, else the CRM active program,
 * else the first applied program. Returns null when the student has no programs.
 */
export function resolveSelectedProgram(
  all: NormalizedAppliedProgram[] | undefined,
  programId?: string | null,
  activeProgram?: NormalizedAppliedProgram | null
): NormalizedAppliedProgram | null {
  const list = all ?? [];
  if (programId) {
    const match = list.find((p) => p.id === programId);
    if (match) return match;
  }
  if (activeProgram?.course) return activeProgram;
  return list[0] ?? null;
}

/**
 * Finds the most recent saved draft for this exact student + program + document type.
 * Drafts saved before program scoping (no programId) never match, so they are not
 * attributed to the wrong program.
 */
export function findDraftForProgram(
  drafts: SopDraftRecord[],
  studentId: string | null | undefined,
  programId: string | null | undefined,
  documentType?: SopDraftRecord["documentType"]
): SopDraftRecord | null {
  if (!studentId || !programId) return null;
  const matches = drafts
    .filter(
      (d) =>
        d.programId === programId &&
        d.studentId === studentId &&
        (!documentType || d.documentType === documentType)
    )
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  return matches[0] ?? null;
}
