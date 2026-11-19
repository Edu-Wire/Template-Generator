import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findCrmResumeFiles } from "../utils/crmResume";
import { sniffDocumentKind } from "@/lib/net/safeDocumentFetch";
import { parseImageUrl } from "@/lib/net/safeImageFetch";
import type { CrmSnapshot } from "@/types/crmSnapshot";

describe("findCrmResumeFiles", () => {
  const snapshot: CrmSnapshot = {
    student: {
      documents: [
        { name: "Passport Size Photo", files: [{ url: "https://s3.example.com/photo.jpg" }] },
        { name: "Resume", uploadedOn: "2026-01-02", files: [{ url: "https://s3.example.com/resume.pdf" }] },
      ],
    },
    documents: [
      { name: "Updated CV", files: [{ fileUrl: "https://s3.example.com/cv.docx" }] },
      { name: "Resume", files: [{ url: "https://s3.example.com/resume.pdf" }] }, // duplicate URL
      { name: "Statement", category: "Curriculum Vitae", files: [{ url: "ftp://bad/host" }] }, // bad scheme
    ],
  } as CrmSnapshot;

  it("finds resume/CV files only, de-duplicated, http(s) only", () => {
    const found = findCrmResumeFiles(snapshot);
    assert.deepEqual(found.map((f) => f.url), [
      "https://s3.example.com/cv.docx",
      "https://s3.example.com/resume.pdf",
    ]);
  });

  it("returns nothing without a snapshot or resume document", () => {
    assert.deepEqual(findCrmResumeFiles(null), []);
    assert.deepEqual(findCrmResumeFiles({ documents: [{ name: "Passport", files: [{ url: "https://x/y.pdf" }] }] } as CrmSnapshot), []);
  });
});

describe("remote document safety", () => {
  it("accepts only PDF / DOCX bytes", () => {
    assert.equal(sniffDocumentKind(Buffer.from("%PDF-1.7 ...")), "pdf");
    assert.equal(sniffDocumentKind(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])), "docx");
    assert.equal(sniffDocumentKind(Buffer.from("<html>")), null);
  });

  it("rejects private / internal URLs before connecting", () => {
    for (const bad of ["http://localhost/a.pdf", "http://127.0.0.1/a.pdf", "http://169.254.169.254/latest", "file:///etc/passwd", "https://user:pw@example.com/a.pdf"]) {
      assert.throws(() => parseImageUrl(bad));
    }
  });
});
