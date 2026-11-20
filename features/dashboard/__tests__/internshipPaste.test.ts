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

describe("internship paste with ● bullets, wrapped lines and no blank line between jobs", () => {
  const RAW = `Aditya Juices and Snacks
Digital Marketing Consultant (Practicum) [ 2025 ]
● Led a 3-month digital transformation initiative, planning and executing integrated social media campaigns that grew brand visibility
and consumer engagement.
● Built SEO-focused content and data-driven marketing strategies to strengthen customer acquisition and online brand presence.
Marketing Intern | NALCO
2025
● Analyzed the aluminium industry landscape, evaluating NALCO's operations, marketing strategy, and competitive positioning.
● Authored a formal report on industry structure and competition, presented to internal stakeholders at NALCO, Bhubaneswar.`;

  it("keeps every line and splits the two jobs", () => {
    const cv = syncSectionsToCvData([{ heading: "WORK EXPERIENCE", content: RAW }], createEmptyDocumentData());
    assert.equal(cv.internships?.length, 2);
    const [first, second] = cv.internships!;
    assert.equal(first.role, "Digital Marketing Consultant (Practicum)");
    assert.equal(first.company, "Aditya Juices and Snacks");
    assert.ok(first.description?.includes("grew brand visibility and consumer engagement."));
    assert.equal(first.description?.split("\n").length, 2);
    assert.equal(second.role, "Marketing Intern");
    assert.equal(second.company, "NALCO");
    assert.equal(second.description?.split("\n").length, 2);
  });

  it("is stable when saved and opened again", () => {
    const once = normalizeInternshipPaste(RAW);
    assert.equal(normalizeInternshipPaste(once), once);
  });
});
