/**
 * Uploads a generated PDF to /api/documents/[id]/pdf so the CRM can fetch it ("Save To CRM").
 * Never throws: always resolves with a user-facing outcome.
 */

export type FinalizeOutcome =
  | { status: "finalized"; message: string }
  | { status: "unlinked"; message: string }
  | { status: "failed"; message: string };

export const UNLINKED_MESSAGE =
  "This editor isn't linked to a CRM document, so Save To CRM won't work.";

export async function syncFinalizedPdf(
  docId: string | null | undefined,
  pdfBase64: string,
  fileName?: string
): Promise<FinalizeOutcome> {
  if (!docId) return { status: "unlinked", message: UNLINKED_MESSAGE };

  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfBase64, fileName, status: "FINALIZED" }),
    });

    if (res.ok) {
      return { status: "finalized", message: "✓ Finalized — you can now Save To CRM" };
    }

    let detail = "";
    try {
      const body = (await res.json()) as { message?: string; error?: { message?: string } };
      detail = body.message || body.error?.message || "";
    } catch {
      // non-JSON error body
    }
    return {
      status: "failed",
      message: `Couldn't finalize PDF for CRM (${res.status})${detail ? `: ${detail}` : "."}`,
    };
  } catch (err) {
    console.warn("[Finalize PDF Sync Failed]:", err);
    return {
      status: "failed",
      message: "Couldn't finalize PDF for CRM: could not reach the server.",
    };
  }
}
