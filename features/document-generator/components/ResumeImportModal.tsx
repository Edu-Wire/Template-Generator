/**
 * features/document-generator/components/ResumeImportModal.tsx
 *
 * Primary modal dialog orchestrating the entire Resume Import workflow:
 * 1. Safe import check (protects unsaved changes).
 * 2. File upload dropzone.
 * 3. Step-by-step processing animation.
 * 4. Interactive review workstation.
 */

"use client";

import React, { useState, useEffect } from "react";
import type { DocumentData } from "@/types";
import type { ResumeImportResult, ImportOverrides } from "../types/import";
import type { CrmSnapshot } from "@/types/crmSnapshot";
import type { ApplicationTarget } from "../guidance/types";
import { ResumeImportDropzone } from "./ResumeImportDropzone";
import { findCrmResumeFiles, type CrmResumeFile } from "../utils/crmResume";
import { ResumeImportReview } from "./ResumeImportReview";
import { ResumeUnsavedChangesDialog } from "./ResumeUnsavedChangesDialog";

interface ResumeImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportApplied: (data: DocumentData, overrides?: ImportOverrides) => void;
  /** The CV that is already stored/open. When given, the import is merged into it (nothing is overwritten). */
  existingData?: DocumentData | null;
  onSaveCurrentDraft: () => void;
  hasUnsavedChanges: boolean;
  crmSnapshot?: CrmSnapshot | null;
  applicationTarget?: ApplicationTarget;
}

type ModalStage =
  | "unsaved_check"
  | "upload"
  | "processing"
  | "review"
  | "error";

export function ResumeImportModal({
  isOpen,
  onClose,
  onImportApplied,
  existingData,
  onSaveCurrentDraft,
  hasUnsavedChanges,
  crmSnapshot,
  applicationTarget,
}: ResumeImportModalProps) {
  const [stage, setStage] = useState<ModalStage>(() =>
    hasUnsavedChanges ? "unsaved_check" : "upload"
  );
  const [processingStep, setProcessingStep] = useState<string>("Reading document...");
  const [importResult, setImportResult] = useState<ResumeImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStage(hasUnsavedChanges ? "unsaved_check" : "upload");
      setProcessingStep("Reading document...");
      setImportResult(null);
      setErrorMessage(null);
    }
  }, [isOpen, hasUnsavedChanges]);

  if (!isOpen) return null;

  const crmResumes = findCrmResumeFiles(crmSnapshot);

  async function handleFileSelect(file: File | null, crmResume?: CrmResumeFile) {
    setStage("processing");
    setErrorMessage(null);
    setProcessingStep("Reading document and extracting text...");

    try {
      const formData = new FormData();
      if (file) {
        formData.append("file", file);
      } else if (crmResume) {
        formData.append("crmResumeUrl", crmResume.url);
        formData.append("crmResumeName", crmResume.name);
      }
      if (crmSnapshot) {
        formData.append("crmSnapshot", JSON.stringify(crmSnapshot));
        formData.append("studentId", crmSnapshot.student?._id || "");
      }

      setProcessingStep("Classifying sections with AI and checking CRM records...");

      const res = await fetch("/api/resume/import", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Server returned error (${res.status})`);
      }

      setImportResult(json.data as ResumeImportResult);
      setStage("review");
    } catch (err: unknown) {
      console.error("[ResumeImportModal] Import error:", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while processing the document."
      );
      setStage("error");
    }
  }

  async function handleConfirmApply(finalData: DocumentData, overrides?: ImportOverrides) {
    if (importResult) {
      try {
        await fetch(`/api/resume/import/${importResult.importId}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: finalData,
            applicationTarget,
          }),
        });
      } catch (err) {
        console.warn("[ResumeImportModal] Server confirmation sync warning:", err);
      }
    }

    onImportApplied(finalData, overrides);
    onClose();
  }

  return (
    <>
      {/* 1. Unsaved Changes Guard Dialog */}
      {stage === "unsaved_check" && (
        <ResumeUnsavedChangesDialog
          isOpen={true}
          onClose={onClose}
          onSaveAndProceed={() => {
            onSaveCurrentDraft();
            setStage("upload");
          }}
          onDiscardAndProceed={() => {
            setStage("upload");
          }}
        />
      )}

      {/* 2. Main Upload / Processing / Review Modal */}
      {stage !== "unsaved_check" && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            className={`bg-white rounded-2xl shadow-2xl border border-slate-200 w-full overflow-hidden transition-all ${
              stage === "review" ? "max-w-4xl" : "max-w-xl p-6"
            }`}
          >
            {/* STAGE: UPLOAD */}
            {stage === "upload" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Import Existing CV
                    </h3>
                    <p className="text-xs text-slate-500">
                      Upload your existing resume and we&apos;ll organize its content into editable sections.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {crmResumes.length > 0 && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 space-y-2">
                    <p className="text-xs font-semibold text-sky-900">
                      Resume found in the CRM record
                    </p>
                    <ul className="space-y-1.5">
                      {crmResumes.map((r) => (
                        <li
                          key={r.url}
                          className="flex items-center justify-between gap-3 bg-white border border-sky-100 rounded-lg px-3 py-2 text-xs"
                        >
                          <span className="min-w-0 truncate text-slate-700">
                            <span className="font-medium">{r.name}</span>
                            {r.uploadedOn && (
                              <span className="text-slate-400">
                                {" "}
                                · uploaded {new Date(r.uploadedOn).toLocaleDateString()}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleFileSelect(null, r)}
                            className="shrink-0 px-3 py-1.5 rounded-lg bg-[#096491] hover:bg-[#074e72] text-white font-semibold cursor-pointer"
                          >
                            Use this resume
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-sky-800/80">
                      Or upload a different file below.
                    </p>
                  </div>
                )}

                <ResumeImportDropzone onFileSelect={(f) => handleFileSelect(f)} />

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* STAGE: PROCESSING */}
            {stage === "processing" && (
              <div className="py-10 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-sky-50 text-[#096491] flex items-center justify-center text-2xl font-bold animate-pulse">
                  ⚙️
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Importing Resume...
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">{processingStep}</p>
                </div>
                <div className="w-48 h-1.5 bg-slate-100 rounded-full mx-auto overflow-hidden">
                  <div className="h-full bg-[#096491] rounded-full animate-indeterminate" />
                </div>
              </div>
            )}

            {/* STAGE: REVIEW */}
            {stage === "review" && importResult && (
              <ResumeImportReview
                importResult={importResult}
                existingData={existingData}
                onApply={handleConfirmApply}
                onCancel={onClose}
              />
            )}

            {/* STAGE: ERROR */}
            {stage === "error" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-rose-600">
                  <span className="text-2xl">⚠️</span>
                  <h4 className="text-sm font-bold text-slate-900">
                    Import Failed
                  </h4>
                </div>

                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium leading-relaxed">
                  {errorMessage || "Unable to import resume document."}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-medium cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage("upload")}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium cursor-pointer"
                  >
                    Try Another File
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
