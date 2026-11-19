/**
 * app/api/resume/import/route.ts
 *
 * Backend endpoint for Resume Document Import.
 * Accepts multipart/form-data:
 * - file: PDF or DOCX file blob (up to 8MB)
 * - crmResumeUrl: alternative to `file` — URL of a resume already stored on the CRM record
 *   (downloaded server-side with SSRF protections, same 8MB / PDF-or-DOCX rules)
 * - studentId: optional CRM student ID
 * - crmSnapshot: optional JSON string of active CRM profile
 *
 * Validates magic bytes, size limit, authentication, and processes file.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { processResumeUpload } from "@/services/import/resumeImportService";
import { fetchRemoteDocument } from "@/lib/net/safeDocumentFetch";
import { ImageFetchError } from "@/lib/net/safeImageFetch";
import { mapCrmToNormalizedStudent } from "@/services/normalization";
import type { CrmSnapshot } from "@/types/crmSnapshot";
import type { NormalizedStudentProfile } from "@/types/normalizedStudent";

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isValidMagicBytes(buffer: Buffer, mime: string, filename: string): boolean {
  // PDF magic bytes: %PDF-
  if (
    filename.toLowerCase().endsWith(".pdf") ||
    mime.includes("pdf")
  ) {
    const header = buffer.subarray(0, 5).toString();
    return header.startsWith("%PDF");
  }

  // DOCX magic bytes: PK\x03\x04 (standard zip header)
  if (
    filename.toLowerCase().endsWith(".docx") ||
    mime.includes("wordprocessingml")
  ) {
    return (
      buffer.length > 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    );
  }

  return false;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const crmResumeUrl = (formData.get("crmResumeUrl") as string | null)?.trim() || null;
    const crmResumeName = (formData.get("crmResumeName") as string | null)?.trim() || "CRM-Resume";
    const studentId = formData.get("studentId") as string | null;
    const rawCrmSnapshot = formData.get("crmSnapshot") as string | null;

    let fileName: string;
    let mimeType: string;
    let buffer: Buffer;

    if (!file && crmResumeUrl) {
      // Resume already stored in the CRM: authenticate first, then download it server-side.
      const preAuth = await requireSession(req, { studentId });
      if (preAuth.response) return preAuth.response;
      try {
        const remote = await fetchRemoteDocument(crmResumeUrl);
        buffer = remote.body;
        fileName = `${sanitizeFilename(crmResumeName).replace(/\.(pdf|docx)$/i, "") || "CRM-Resume"}.${remote.kind}`;
        mimeType =
          remote.kind === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } catch (err) {
        if (err instanceof ImageFetchError) {
          return NextResponse.json({ success: false, error: err.message }, { status: err.status });
        }
        throw err;
      }
    } else {
      if (!file) {
        return NextResponse.json(
          { success: false, error: "No resume file was uploaded." },
          { status: 400 }
        );
      }

      fileName = sanitizeFilename(file.name);
      mimeType = file.type || "application/octet-stream";

      // 1. Extension check
      const isPdf = fileName.toLowerCase().endsWith(".pdf");
      const isDocx = fileName.toLowerCase().endsWith(".docx");
      if (!isPdf && !isDocx) {
        return NextResponse.json(
          {
            success: false,
            error: "Unsupported file type. Please upload a PDF or DOCX file.",
          },
          { status: 400 }
        );
      }

      // 2. Size limit check
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          {
            success: false,
            error: `File size exceeds the 8MB limit (uploaded: ${(file.size / 1024 / 1024).toFixed(1)}MB).`,
          },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);

      // 3. Magic bytes validation
      if (!isValidMagicBytes(buffer, mimeType, fileName)) {
        return NextResponse.json(
          {
            success: false,
            error: "The file format does not match its extension. Please upload a genuine PDF or DOCX.",
          },
          { status: 400 }
        );
      }
    }

    // 4. Parse CRM student profile if provided
    let crmProfile: NormalizedStudentProfile | undefined;
    if (rawCrmSnapshot) {
      try {
        const parsedSnapshot = JSON.parse(rawCrmSnapshot) as CrmSnapshot;
        crmProfile = mapCrmToNormalizedStudent(parsedSnapshot, {
          source: "senior-crm-api",
        });
      } catch (err) {
        console.warn("[api/resume/import] Could not parse CRM snapshot:", err);
      }
    }

    // 5. Process upload
    // The student this upload is for (form field or the attached CRM snapshot) must be one
    // the operator can access; uploads with no student belong to the uploading operator.
    const targetStudentId = studentId || crmProfile?.meta?.studentId || null;
    const auth = await requireSession(req, { studentId: targetStudentId });
    if (auth.response) return auth.response;

    const result = await processResumeUpload({
      createdBy: auth.session.sub,
      buffer,
      fileName,
      mimeType,
      crmProfile,
      studentId: studentId || undefined,
      studentName: crmProfile?.personal?.fullName,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    console.error("[api/resume/import] Error:", err);
    const message =
      err instanceof Error
        ? err.message
        : "Failed to process resume import. Please try again.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
