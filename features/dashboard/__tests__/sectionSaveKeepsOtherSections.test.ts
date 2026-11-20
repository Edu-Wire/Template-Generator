import test from "node:test";
import assert from "node:assert/strict";
import { headingToSectionId, syncSectionsToCvData } from "../utils/documentStudioSync";
import { createEmptyDocumentData } from "@/features/document-generator/utils/documentDefaults";

test("headings such as 'Professional Experience' map to the internships section", () => {
  assert.equal(headingToSectionId("PROFESSIONAL EXPERIENCE"), "internships");
  assert.equal(headingToSectionId("TECHNICAL SKILLS"), "skills");
  assert.equal(headingToSectionId("LANGUAGE SKILLS"), "languages");
  assert.equal(headingToSectionId("LEADERSHIP EXPERIENCE"), "leadershipActivities");
});

test("saving another section does not wipe 'Professional Experience' data", () => {
  const base = createEmptyDocumentData();
  const sections = [
    { heading: "ABOUT ME", content: "Updated summary." },
    {
      heading: "PROFESSIONAL EXPERIENCE",
      content: "UI/UX Designer Intern\nJayaris Solution Pvt. Ltd. [ 01/2024 – 03/2024 ]\n• Designed responsive websites.",
    },
  ];
  const synced = syncSectionsToCvData(sections, base);
  assert.equal(synced.aboutMe, "Updated summary.");
  assert.equal(synced.internships?.length, 1);
  assert.equal(synced.internships?.[0].role, "UI/UX Designer Intern");
  assert.ok(synced.sectionOrder?.includes("internships"));
});
