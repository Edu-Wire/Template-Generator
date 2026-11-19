/**
 * lib/net/safeDocumentFetch.ts
 *
 * SSRF-hardened fetch for a remote PDF / DOCX (a resume stored in the CRM).
 * Reuses the URL validation and connect-time DNS checks of the image proxy
 * (lib/net/safeImageFetch.ts): http(s) on default ports only, no credentials, private
 * and internal addresses blocked, redirects never followed. The body is size-capped and
 * must start with the PDF or DOCX (zip) magic bytes.
 */

import http from "node:http";
import https from "node:https";
import { ImageFetchError, parseImageUrl, safeLookup } from "./safeImageFetch";

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

export type RemoteDocumentKind = "pdf" | "docx";

/** Detects PDF / DOCX from magic bytes; null for anything else. */
export function sniffDocumentKind(buf: Buffer): RemoteDocumentKind | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "docx";
  return null;
}

export async function fetchRemoteDocument(
  rawUrl: string | null | undefined
): Promise<{ body: Buffer; kind: RemoteDocumentKind }> {
  const url = parseImageUrl(rawUrl);
  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.get(
      url,
      {
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: { Accept: "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*", "User-Agent": "TemplateGenerator-ResumeFetch/1.0" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return reject(new ImageFetchError("Resume redirects are not followed.", 502));
        }
        if (status !== 200) {
          res.resume();
          return reject(new ImageFetchError(`Could not download the CRM resume (HTTP ${status}).`, 502));
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > MAX_DOCUMENT_BYTES) {
          res.destroy();
          return reject(new ImageFetchError("The CRM resume exceeds the 8 MB limit.", 413));
        }

        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_DOCUMENT_BYTES) {
            res.destroy();
            reject(new ImageFetchError("The CRM resume exceeds the 8 MB limit.", 413));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const kind = sniffDocumentKind(body);
          if (!kind) return reject(new ImageFetchError("The CRM resume is not a PDF or DOCX file.", 415));
          resolve({ body, kind });
        });
        res.on("error", () => reject(new ImageFetchError("Failed to download the CRM resume.", 502)));
      }
    );
    req.on("timeout", () => req.destroy(new ImageFetchError("Downloading the CRM resume timed out.", 504)));
    req.on("error", (err) =>
      reject(err instanceof ImageFetchError ? err : new ImageFetchError("Failed to download the CRM resume.", 502))
    );
  });
}
