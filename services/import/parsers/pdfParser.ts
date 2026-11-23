/**
 * services/import/parsers/pdfParser.ts
 *
 * Resilient server-side PDF text extraction using unpdf.
 * unpdf is cross-runtime (Node.js/Next.js/Serverless), avoids browser DOM/worker issues,
 * and extracts text cleanly without Canvas or DOMMatrix requirements.
 *
 * Features:
 * - 10-second timeout safeguard to prevent hung workers.
 * - Detects empty/scanned PDFs (<50 characters readable text).
 * - Identifies password-protected/encrypted PDFs.
 */

import { extractText, getDocumentProxy } from "unpdf";
import { decodeEmbeddedData } from "@/services/pdf/pdfMetadata";
import type { DocumentData } from "@/types";

export class ScannedPdfError extends Error {
  constructor(
    message = "We couldn't detect readable text in this PDF. Scanned documents or image-only PDFs are not supported in V1."
  ) {
    super(message);
    this.name = "ScannedPdfError";
  }
}

export class PasswordProtectedPdfError extends Error {
  constructor(message = "This PDF is password-protected. Please upload an unprotected copy.") {
    super(message);
    this.name = "PasswordProtectedPdfError";
  }
}

export interface PdfParseResult {
  text: string;
  numPages: number;
  embeddedData?: DocumentData | null;
  /** URLs of clickable link annotations (the visible text may not show the URL). */
  links?: string[];
}

async function collectLinkAnnotations(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<string[]> {
  const links: string[] = [];
  try {
    for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
      const page = await pdf.getPage(i);
      const annotations = (await page.getAnnotations()) as Array<{ subtype?: string; url?: string; unsafeUrl?: string }>;
      for (const a of annotations) {
        const url = a.url || a.unsafeUrl;
        if (a.subtype === "Link" && url && /^https?:\/\//i.test(url) && !links.includes(url)) links.push(url);
      }
    }
  } catch {
    // Links are a best-effort extra — never fail the import over them.
  }
  return links;
}

export async function parsePdfBuffer(
  buffer: Buffer,
  timeoutMs = 10000
): Promise<PdfParseResult> {
  const parsePromise = (async () => {
    try {
      const uint8 = new Uint8Array(buffer);
      const pdf = await getDocumentProxy(uint8);
      const [meta, textResult, links] = await Promise.all([
        pdf.getMetadata().catch(() => null),
        extractText(pdf, { mergePages: true }),
        collectLinkAnnotations(pdf),
      ]);

      const subject = (meta?.info as Record<string, unknown> | undefined)?.Subject as string | undefined;
      const embeddedPayload = decodeEmbeddedData<DocumentData>(subject);

      return {
        text: textResult?.text || "",
        numPages: textResult?.totalPages || 1,
        embeddedData: embeddedPayload?.data || null,
        links,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : "";
      if (
        name.includes("Password") ||
        msg.toLowerCase().includes("password") ||
        msg.toLowerCase().includes("encrypted") ||
        msg.toLowerCase().includes("bad decrypt")
      ) {
        throw new PasswordProtectedPdfError();
      }
      throw err;
    }
  })();

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error("PDF text extraction timed out. The file may be complex or corrupted.")
        ),
      timeoutMs
    )
  );

  const result = await Promise.race([parsePromise, timeoutPromise]);

  if ((!result.text || result.text.trim().length < 50) && !result.embeddedData) {
    throw new ScannedPdfError();
  }

  return result;
}

