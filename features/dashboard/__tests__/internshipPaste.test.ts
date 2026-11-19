import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeInternshipPaste, syncSectionsToCvData } from "../utils/documentStudioSync";
import { createEmptyDocumentData } from "@/features/document-generator/utils/documentDefaults";

const BULLETS = [
  "Developed and enhanced web applications using React.js, Next.js, Node.js, and Express.js.",
  "Worked with MongoDB and Redis for database management and data handling.",
  "Implemented REST APIs, JWT authentication, and Role-Based Access Control (RBAC).",
];

const PASTE = `**Digiwire Smart Solutions | Full Stack Developer Intern**
*January 2026 – May 2026*
• ${BULLETS.join("\n• ")}

**Digiwire Smart Solutions | Full Stack Developer Intern**
*January 2026 – May 2026*

- ${BULLETS.join("\n- ")}

** Edu-wire Smart Solutions | Full Stack Developer **
*January 2026 – May 2026*

- ${BULLETS.join("\n- ")}`;

describe("internship paste", () => {
  it("normalizes markdown work experience into parseable entries", () => {
    const out = normalizeInternshipPaste(PASTE);
    console.log(out);
    const cv = syncSectionsToCvData([{ heading: "WORK EXPERIENCE / INTERNSHIPS", content: out }], createEmptyDocumentData());
    console.log(JSON.stringify(cv.internships, null, 1));
    assert.equal(cv.internships?.length, 3);
    assert.equal(cv.internships?.[0].role, "Full Stack Developer Intern");
    assert.equal(cv.internships?.[0].company, "Digiwire Smart Solutions");
    assert.ok(cv.internships?.[0].startDate);
  });
});

describe("internship paste (raw, un-normalized section text)", () => {
  it("parses raw pasted text directly and is idempotent", () => {
    const raw = syncSectionsToCvData([{ heading: "WORK EXPERIENCE / INTERNSHIPS", content: PASTE }], createEmptyDocumentData());
    assert.equal(raw.internships?.length, 3);
    assert.equal(raw.internships?.[2].company, "Edu-wire Smart Solutions");
    const once = normalizeInternshipPaste(PASTE);
    assert.equal(normalizeInternshipPaste(once), once);
    // Existing structured format still parses
    const legacy = syncSectionsToCvData(
      [{ heading: "WORK EXPERIENCE", content: "Software Intern\nAmazon | Bangalore [ June 2023 – December 2023 ]\n• Built things" }],
      createEmptyDocumentData()
    );
    assert.equal(legacy.internships?.[0].company, "Amazon");
    assert.equal(legacy.internships?.[0].location, "Bangalore");
  });
});
