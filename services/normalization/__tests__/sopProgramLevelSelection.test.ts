/**
 * SOP program-level grounding:
 *   Bachelor's program -> 12th details; Master's program -> bachelor's details.
 *   Switching the applied program changes the education facts, university and course.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapCrmToNormalizedStudent, mapNormalizedToSop } from "@/services/normalization";
import {
  classifyTargetLevel,
  selectRelevantQualification,
} from "@/services/normalization/selectRelevantQualification";
import { normalizeDocumentData } from "@/services/ai/documents/normalizeDocumentData";
import { detectEducationLevel } from "@/services/ai/prompts/studentVoiceGuidelines";
import {
  findDraftForProgram,
  formatProgramLabel,
  resolveSelectedProgram,
} from "@/features/sop-generator/lib/programSelection";
import type { SopDraftRecord } from "@/features/sop-generator/types/sop-generator";
import type { CrmSnapshot } from "@/types/crmSnapshot";

// Bachelor's entry deliberately listed FIRST so "first record" != "12th record".
const snapshot = {
  student: {
    _id: "65a000000000000000000099",
    personalDetails: { firstName: "Umar", lastName: "Khan", gender: "male" },
    academicQualifications: [
      {
        _id: "q-btech",
        levelOfStudy: "Undergraduate",
        qualification: "B.Tech Computer Science",
        institution: "Sample Engineering College",
        boardOrUniversity: "Sample University",
        score: "8.1 CGPA",
        endDate: "2026-06-01",
      },
      {
        _id: "q-12",
        levelOfStudy: "12th",
        qualification: "Higher Secondary",
        subjects: "Physics, Chemistry, Mathematics",
        institution: "Sample Senior School",
        boardOrUniversity: "CBSE",
        score: "88%",
        endDate: "2022-03-01",
      },
      {
        _id: "q-10",
        levelOfStudy: "10th",
        qualification: "Secondary",
        institution: "Sample School",
        score: "90%",
        endDate: "2020-03-01",
      },
    ],
    workExperience: [],
    tests: [],
  },
  appliedPrograms: [
    {
      _id: "p-bach",
      university: { name: "University of Padua" },
      course: { title: "Bachelor Degree in Information Engineering" },
      country: { name: "Italy" },
    },
    {
      _id: "p-mast",
      university: { name: "University of Catania" },
      course: { title: "Master Degree in Data Science" },
      country: { name: "Italy" },
    },
  ],
  documents: [],
} as unknown as CrmSnapshot;

function sopFor(programId: string) {
  const normalized = mapCrmToNormalizedStudent(snapshot, { activeProgramId: programId });
  return { normalized, ctx: mapNormalizedToSop(normalized) };
}

describe("selectRelevantQualification", () => {
  it("classifies target levels", () => {
    assert.equal(classifyTargetLevel("Bachelor's"), "BACHELORS");
    assert.equal(classifyTargetLevel("Undergraduate"), "BACHELORS");
    assert.equal(classifyTargetLevel("Master's"), "MASTERS");
    assert.equal(classifyTargetLevel("Master of Science"), "MASTERS");
    assert.equal(classifyTargetLevel("PhD"), "DOCTORATE");
    assert.equal(classifyTargetLevel(""), "UNKNOWN");
  });

  it("picks the 12th record for a Bachelor's target even when it is not first", () => {
    const { normalized } = sopFor("p-bach");
    const picked = selectRelevantQualification(normalized.academics.qualifications, "Bachelor's");
    assert.equal(picked?.qualification.id, "q-12");
    assert.equal(picked?.reason, "level-match");
  });

  it("picks the bachelor's record for a Master's target", () => {
    const { normalized } = sopFor("p-mast");
    const picked = selectRelevantQualification(normalized.academics.qualifications, "Master's");
    assert.equal(picked?.qualification.id, "q-btech");
  });

  it("falls back to the highest available record when the preferred level is missing", () => {
    const { normalized } = sopFor("p-mast");
    const onlySchool = normalized.academics.qualifications.filter((q) => q.id !== "q-btech");
    const picked = selectRelevantQualification(onlySchool, "Master's");
    assert.equal(picked?.qualification.id, "q-12");
    assert.equal(picked?.reason, "highest-available");
  });

  it("returns null with no qualifications", () => {
    assert.equal(selectRelevantQualification([], "Master's"), null);
  });
});

describe("SOP context follows the selected program", () => {
  it("Bachelor's program is grounded in 12th details, with no previous degree", () => {
    const { ctx } = sopFor("p-bach");
    assert.equal(ctx.destination.university, "University of Padua");
    assert.equal(ctx.destination.degreeLevel, "Bachelor's");
    assert.equal(ctx.academics.institution, "Sample Senior School");
    assert.equal(ctx.academics.percentage, "88%");
    assert.equal(ctx.academics.subjects, "Physics, Chemistry, Mathematics");
    assert.equal(ctx.academics.previousDegree, "");
  });

  it("Master's program is grounded in bachelor's details and sets previousDegree", () => {
    const { ctx } = sopFor("p-mast");
    assert.equal(ctx.destination.university, "University of Catania");
    assert.equal(ctx.destination.degreeLevel, "Master's");
    assert.equal(ctx.academics.institution, "Sample Engineering College");
    assert.equal(ctx.academics.latestQualification, "B.Tech Computer Science");
    assert.equal(ctx.academics.previousDegree, "B.Tech Computer Science");
  });

  it("switching programs changes university, course and education facts", () => {
    const a = sopFor("p-bach").ctx;
    const b = sopFor("p-mast").ctx;
    assert.notEqual(a.destination.university, b.destination.university);
    assert.notEqual(a.destination.course, b.destination.course);
    assert.notEqual(a.academics.institution, b.academics.institution);
  });

  it("detectEducationLevel follows the program, not the qualification text", () => {
    const bachelors = sopFor("p-bach").ctx;
    // Even with a previousDegree wrongly present, a Bachelor's target stays Bachelor's.
    bachelors.academics.previousDegree = "B.Tech";
    assert.equal(detectEducationLevel(bachelors).level, "BACHELORS_APPLICANT");
    assert.equal(detectEducationLevel(sopFor("p-mast").ctx).level, "MASTERS_APPLICANT");
  });

  it("AI canonical data picks the record matching the target program", () => {
    const bach = sopFor("p-bach").normalized;
    const mast = sopFor("p-mast").normalized;
    const bachData = normalizeDocumentData({
      documentType: "SOP",
      data: { ...bach, destination: { degreeLevel: bach.applications.activeProgram?.degreeLevel } },
    } as never);
    const mastData = normalizeDocumentData({
      documentType: "SOP",
      data: { ...mast, destination: { degreeLevel: mast.applications.activeProgram?.degreeLevel } },
    } as never);
    assert.equal(bachData.education.institution, "Sample Senior School");
    assert.equal(mastData.education.institution, "Sample Engineering College");
  });
});

describe("program selection helpers and per-program drafts", () => {
  const { normalized } = sopFor("p-mast");
  const programs = normalized.applications.all;

  it("formats labels with the degree level", () => {
    assert.match(formatProgramLabel(programs[1]), /University of Catania — .*Data Science \(Master's\)/);
  });

  it("resolves the selected program, else active, else first", () => {
    assert.equal(resolveSelectedProgram(programs, "p-bach", null)?.id, "p-bach");
    assert.equal(resolveSelectedProgram(programs, "nope", programs[1])?.id, programs[1].id);
    assert.equal(resolveSelectedProgram(programs, "", null)?.id, programs[0].id);
    assert.equal(resolveSelectedProgram([], "x", null), null);
  });

  function draft(over: Partial<SopDraftRecord>): SopDraftRecord {
    return {
      id: "d",
      studentName: "Umar",
      course: "",
      university: "",
      templateId: "t",
      savedAt: "2026-01-01T00:00:00.000Z",
      sectionContents: {},
      sectionStatuses: {},
      docApproved: false,
      ctx: {} as SopDraftRecord["ctx"],
      currentSource: "live-crm",
      documentType: "UNIVERSITY_SOP",
      studentId: "s1",
      ...over,
    };
  }

  it("drafts are matched per student + program and never cross programs", () => {
    const drafts = [
      draft({ id: "bach", programId: "p-bach" }),
      draft({ id: "mast-old", programId: "p-mast", savedAt: "2026-01-02T00:00:00.000Z" }),
      draft({ id: "mast-new", programId: "p-mast", savedAt: "2026-01-03T00:00:00.000Z" }),
      draft({ id: "legacy" }), // saved before program scoping
      draft({ id: "other-student", programId: "p-mast", studentId: "s2" }),
    ];
    assert.equal(findDraftForProgram(drafts, "s1", "p-bach", "UNIVERSITY_SOP")?.id, "bach");
    assert.equal(findDraftForProgram(drafts, "s1", "p-mast", "UNIVERSITY_SOP")?.id, "mast-new");
    assert.equal(findDraftForProgram(drafts, "s1", "p-none", "UNIVERSITY_SOP"), null);
    assert.equal(findDraftForProgram(drafts, undefined, "p-mast"), null);
  });
});

// ---------------------------------------------------------------------------
// Missing-detail fixes + Studio layout / program switching
// ---------------------------------------------------------------------------
import { lookupUniversityCity } from "@/services/normalization/universityCity";
import { deriveSubjectsText } from "@/services/normalization/selectRelevantQualification";
import { docSectionsToHtml } from "@/features/dashboard/utils/docSectionsToHtml";
import { hydrateDocumentFromSnapshot } from "@/features/dashboard/utils/documentHydrator";

describe("destination.city and academics.subjects are never left [MISSING] for known data", () => {
  it("looks up the city of well-known Italian universities and never guesses", () => {
    assert.equal(lookupUniversityCity("University of Messina"), "Messina");
    assert.equal(lookupUniversityCity("Università degli Studi di Catania"), "Catania");
    assert.equal(lookupUniversityCity("University of Padua"), "Padua");
    assert.equal(lookupUniversityCity("Politecnico di Milano"), "Milan");
    assert.equal(lookupUniversityCity("Some Unknown Institute"), "");
    assert.equal(lookupUniversityCity(""), "");
  });

  it("derives subjects for degree records from the field in the title", () => {
    const q = (qualification: string, extra = {}) => ({ id: "x", levelOfStudy: "Undergraduate", qualification, ...extra });
    assert.equal(deriveSubjectsText(q("AI ML")), "AI ML");
    assert.equal(deriveSubjectsText(q("B.Tech Computer Science")), "Computer Science");
    assert.equal(deriveSubjectsText(q("Bachelor of Technology in Civil Engineering")), "Civil Engineering");
    assert.equal(deriveSubjectsText(q("B.Tech")), "", "bare degree name stays a visible placeholder");
    assert.equal(deriveSubjectsText(q("B.Tech", { fieldOfStudy: "Mechanical" })), "Mechanical");
    assert.equal(
      deriveSubjectsText({ id: "s", levelOfStudy: "12th", qualification: "Higher Secondary" }),
      "",
      "school records are never given an invented subject"
    );
  });

  it("SOP context for a Master's program has city and subjects filled", () => {
    const ctx = sopFor("p-mast").ctx;
    assert.equal(ctx.destination.city, "Catania");
    assert.equal(ctx.academics.subjects, "Computer Science");
  });
});

describe("Studio SOP layout and program switching", () => {
  const sections = [{ heading: "A", content: "First paragraph.\n\nSecond paragraph." }, { heading: "B", content: "Closing." }];

  it("renders the Catania layout: centered underlined title, salutation, sign-off with name", () => {
    const html = docSectionsToHtml(sections, "SOP", "Umar Ali Khan – Statement of Purpose (University of Catania)");
    assert.match(html, /<p style="text-align: center"><strong><u>STATEMENT OF PURPOSE<\/u><\/strong><\/p>/);
    assert.match(html, /Dear Admissions Committee,/);
    assert.match(html, /Yours sincerely,<br\/><strong>Umar Ali Khan<\/strong>/);
    assert.ok(html.indexOf("Dear Admissions Committee,") < html.indexOf("First paragraph."));
    assert.ok(html.indexOf("Closing.") < html.indexOf("Yours sincerely,"));
  });

  it("escapes the signer name", () => {
    const html = docSectionsToHtml(sections, "SOP", "<b>X</b> – Statement of Purpose");
    assert.doesNotMatch(html, /<strong><b>X/);
  });

  it("hydrating for another program changes university, course, programId and education facts", () => {
    const bach = hydrateDocumentFromSnapshot("SOP", snapshot, "s1", "university-sop-standard", "p-bach");
    const mast = hydrateDocumentFromSnapshot("SOP", snapshot, "s1", "university-sop-standard", "p-mast");
    assert.equal(bach.programId, "p-bach");
    assert.equal(mast.programId, "p-mast");
    assert.equal(bach.targetUniversity, "University of Padua");
    assert.equal(mast.targetUniversity, "University of Catania");
    const text = (d: typeof bach) => d.sections.map((s) => s.content).join(" ");
    assert.match(text(bach), /Sample Senior School/);
    assert.match(text(mast), /Sample Engineering College/);
    assert.doesNotMatch(text(mast), /Sample Senior School/);
    assert.doesNotMatch(text(mast), /\[MISSING: (?:destination\.city|academics\.subjects)\]/);
  });
});

// ---------------------------------------------------------------------------
// Missing details: never inside the SOP text, listed separately
// ---------------------------------------------------------------------------
import { interpolate } from "@/features/sop-generator/lib/interpolateTemplate";
import {
  applyFieldValues,
  getSopMissingCount,
  getSopMissingGroups,
  getSopMissingKeys,
  renderSopSections,
  updateSopSectionsWithFields,
} from "@/features/dashboard/utils/sopMissingFields";

describe("SOP missing details live in a separate list, not in the text", () => {
  // A context with real gaps: no city (unknown university), no subjects, no board, no score.
  const gapCtx = () => {
    const ctx = sopFor("p-mast").ctx;
    ctx.destination.university = "Unlisted Institute";
    ctx.destination.city = "";
    ctx.academics.subjects = "";
    ctx.academics.board = "";
    ctx.academics.percentage = "";
    return ctx;
  };
  const text = (secs: { content: string }[]) => secs.map((s) => s.content).join("\n");

  it("optional segments drop whole when omitting, and unwrap normally otherwise", () => {
    const ctx = gapCtx();
    assert.equal(interpolate("In X[[ in {{destination.city}}]].", ctx, { omitMissing: true }), "In X.");
    assert.equal(interpolate("In X[[ in {{destination.city}}]].", ctx), "In X in [MISSING: destination.city].");
    assert.equal(interpolate("A {{academics.board}} B", ctx, { omitMissing: true }), "A B");
  });

  it("rendered SOP never contains [MISSING] or leftover braces/brackets or broken punctuation", () => {
    const out = text(renderSopSections(gapCtx()));
    assert.doesNotMatch(out, /\[MISSING|\{\{|\}\}|\[\[|\]\]/);
    assert.doesNotMatch(out, /\s,|,\s*,|,\s*\.|\s\./);
    assert.doesNotMatch(out, /focusing on|aggregate score|under the/);
  });

  it("lists exactly the gaps, grouped, with labels", () => {
    const keys = getSopMissingKeys(gapCtx());
    for (const k of ["destination.city", "academics.subjects", "academics.board", "academics.percentage"]) {
      assert.ok(keys.includes(k), `${k} should be listed`);
    }
    assert.equal(getSopMissingCount(gapCtx()), keys.length);
    const groups = getSopMissingGroups(gapCtx());
    const labels = groups.flatMap((g) => g.fields.map((f) => f.label));
    assert.ok(labels.includes("University City"));
    assert.ok(labels.includes("Score / Percentage"));
  });

  it("a complete context has nothing missing and keeps every clause", () => {
    const ctx = sopFor("p-mast").ctx; // Catania + subjects known
    ctx.student.city = "Bhopal";
    ctx.student.country = "India";
    ctx.academics.board = "Sample University";
    ctx.academics.percentage = "8.1 CGPA";
    const out = text(renderSopSections(ctx));
    assert.equal(getSopMissingCount(ctx), 0);
    assert.match(out, /focusing on Computer Science/);
    assert.match(out, /aggregate score of \*\*8\.1 CGPA\*\*/);
    assert.match(out, /in \*\*Catania\*\*/);
  });

  it("supplying a detail removes it from the list and writes it into the text", () => {
    const ctx = gapCtx();
    const values = { "destination.city": "Catania", "academics.subjects": "Data Science" };
    assert.ok(!getSopMissingKeys(ctx, values).includes("destination.city"));
    assert.ok(!getSopMissingKeys(ctx, values).includes("academics.subjects"));
    const out = text(renderSopSections(ctx, values));
    assert.match(out, /in \*\*Catania\*\*/);
    assert.match(out, /focusing on Data Science/);
    assert.equal(ctx.academics.subjects, "", "the original context is not mutated");
    assert.equal(applyFieldValues(ctx, values).academics.subjects, "Data Science");
  });

  it("filling a detail rewrites untouched sections but keeps hand-edited ones", () => {
    const ctx = gapCtx();
    const current = renderSopSections(ctx);
    const idx = current.findIndex((s) => s.heading === "Why This University");
    const academicIdx = current.findIndex((s) => s.heading === "Academic Background");
    current[idx] = { ...current[idx], content: "My own hand-written paragraph about this university." };
    const { sections, keptEditedSections } = updateSopSectionsWithFields(current, ctx, undefined, {
      "destination.city": "Catania",
      "academics.subjects": "Data Science",
    });
    assert.equal(sections[idx].content, "My own hand-written paragraph about this university.");
    assert.deepEqual(keptEditedSections, ["Why This University"]);
    assert.match(sections[academicIdx].content, /focusing on Data Science/);
  });

  it("hydrated SOP documents contain no [MISSING] text", () => {
    const doc = hydrateDocumentFromSnapshot("SOP", snapshot, "s1", "university-sop-standard", "p-mast");
    assert.doesNotMatch(doc.sections.map((s) => s.content).join("\n"), /\[MISSING/);
  });
});

// ---------------------------------------------------------------------------
// Shortlisted + applied programs
// ---------------------------------------------------------------------------
describe("shortlisted and applied programs are both selectable", () => {
  const withShortlist = {
    ...(snapshot as unknown as Record<string, unknown>),
    shortlistedPrograms: [
      // Same university + course as the applied Padua program, different id -> must not duplicate
      {
        _id: "s-dup",
        university: { name: "University of Padua" },
        course: { title: "Bachelor Degree in Information Engineering" },
        country: { name: "Italy" },
      },
      {
        _id: "s-messina",
        university: { name: "University of Messina" },
        course: { title: "Master Degree in Heritage Innovation Engineering" },
        country: { name: "Italy" },
      },
    ],
  } as unknown as CrmSnapshot;

  it("lists applied first, then shortlisted, de-duplicating a program that is also applied", () => {
    const n = mapCrmToNormalizedStudent(withShortlist);
    assert.deepEqual(
      n.applications.all.map((p) => [p.id, p.status]),
      [
        ["p-bach", "applied"],
        ["p-mast", "applied"],
        ["s-messina", "shortlisted"],
      ]
    );
  });

  it("defaults to an applied program, not a shortlisted one", () => {
    const n = mapCrmToNormalizedStudent(withShortlist);
    assert.equal(n.applications.activeProgram?.status, "applied");
  });

  it("a student with only shortlisted programs gets the shortlisted one as active", () => {
    const only = {
      ...(withShortlist as unknown as Record<string, unknown>),
      appliedPrograms: [],
    } as unknown as CrmSnapshot;
    const n = mapCrmToNormalizedStudent(only);
    assert.equal(n.applications.activeProgram?.id, "s-dup");
    assert.equal(n.applications.all.length, 2);
  });

  it("the SOP can be written for a shortlisted program, with its own level and record", () => {
    const n = mapCrmToNormalizedStudent(withShortlist, { activeProgramId: "s-messina" });
    const ctx = mapNormalizedToSop(n);
    assert.equal(ctx.destination.university, "University of Messina");
    assert.equal(ctx.destination.city, "Messina");
    assert.equal(ctx.destination.degreeLevel, "Master's");
    assert.equal(ctx.academics.institution, "Sample Engineering College");
    const doc = hydrateDocumentFromSnapshot("SOP", withShortlist, "s1", "university-sop-standard", "s-messina");
    assert.equal(doc.programId, "s-messina");
    assert.equal(doc.targetUniversity, "University of Messina");
  });

  it("labels show whether a program is applied or shortlisted", () => {
    const n = mapCrmToNormalizedStudent(withShortlist);
    const labels = n.applications.all.map(formatProgramLabel);
    assert.match(labels[0], /· Applied$/);
    assert.match(labels[2], /· Shortlisted$/);
  });

  it("a snapshot with no shortlist behaves exactly as before", () => {
    const n = mapCrmToNormalizedStudent(snapshot);
    assert.equal(n.applications.all.length, 2);
    assert.ok(n.applications.all.every((p) => p.status === "applied"));
  });
});

// ---------------------------------------------------------------------------
// University / program name missing: never "****", only in Missing Details
// ---------------------------------------------------------------------------
describe("missing university or program name never leaves asterisks or gaps in the SOP", () => {
  const noUniCtx = () => {
    const ctx = sopFor("p-mast").ctx;
    ctx.student.city = "Ayodhya";
    ctx.student.country = "India";
    ctx.academics.board = "University of Lucknow";
    ctx.destination.university = "";
    ctx.destination.city = "";
    return ctx;
  };
  const body = (ctx: ReturnType<typeof noUniCtx>) =>
    renderSopSections(ctx).map((s) => s.content).join("\n\n");

  it("no university: no '****', no leftover 'at .', no university paragraph", () => {
    const out = body(noUniCtx());
    assert.doesNotMatch(out, /\*\*\s*\*\*/);
    assert.doesNotMatch(out, /\bat\s*[.,]|\bat\s*$/m);
    assert.doesNotMatch(out, /I chose|As a student at/);
    assert.match(out, /programme\./, "course is still mentioned");
    const why = renderSopSections(noUniCtx()).find((s) => s.heading === "Why This University");
    assert.equal(why?.content, "", "the whole section is left out");
  });

  it("no university and no course: still clean", () => {
    const ctx = noUniCtx();
    ctx.destination.course = "";
    const out = body(ctx);
    assert.doesNotMatch(out, /\*\*\s*\*\*|\{\{|\[\[|MISSING/);
    assert.doesNotMatch(out, /\s,|\s\.|programme\s*\./);
  });

  it("university and program are listed under Missing Details, not in the text", () => {
    const ctx = noUniCtx();
    ctx.destination.course = "";
    const keys = getSopMissingKeys(ctx);
    assert.ok(keys.includes("destination.university"));
    assert.ok(keys.includes("destination.course"));
    const labels = getSopMissingGroups(ctx).flatMap((g) => g.fields.map((f) => f.label));
    assert.ok(labels.includes("Target University") || labels.some((l) => /universit/i.test(l)));
  });

  it("supplying the university from Missing Details writes it into the text", () => {
    const ctx = noUniCtx();
    const out = renderSopSections(ctx, { "destination.university": "University of Messina" })
      .map((s) => s.content)
      .join("\n\n");
    assert.match(out, /at \*\*University of Messina\*\*/);
    assert.match(out, /I chose \*\*University of Messina\*\*/);
  });

  it("with everything present the original sentences are unchanged", () => {
    const ctx = sopFor("p-mast").ctx;
    ctx.student.city = "Bhopal";
    ctx.student.country = "India";
    const out = body(ctx as ReturnType<typeof noUniCtx>);
    assert.match(out, /programme at \*\*University of Catania\*\*/);
    assert.match(out, /I chose \*\*University of Catania\*\* because/);
    assert.match(out, /in \*\*Catania\*\*, Italy/);
  });

  it("document title has no empty parentheses when the university is unknown", () => {
    const noUniSnap = {
      ...(snapshot as unknown as Record<string, unknown>),
      appliedPrograms: [{ _id: "p-x", course: { title: "Master Degree in Economics" }, country: { name: "Italy" } }],
      shortlistedPrograms: [],
    } as unknown as CrmSnapshot;
    const doc = hydrateDocumentFromSnapshot("SOP", noUniSnap, "s1", "university-sop-standard", "p-x");
    assert.doesNotMatch(doc.title, /\(\s*\)/);
    assert.doesNotMatch(doc.sections.map((s) => s.content).join(" "), /\*\*\s*\*\*/);
    assert.ok(doc.sections.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Chat-supplied values
// ---------------------------------------------------------------------------
import { normalizeSopFieldValue } from "@/features/dashboard/utils/sopMissingFields";

describe("values typed into the chat for missing details", () => {
  it("capitalises lower-case name-like values and leaves everything else alone", () => {
    assert.equal(normalizeSopFieldValue("destination.city", "catania"), "Catania");
    assert.equal(normalizeSopFieldValue("destination.university", "university of messina"), "University of Messina");
    assert.equal(normalizeSopFieldValue("destination.university", "Università degli Studi di Catania"), "Università degli Studi di Catania");
    assert.equal(normalizeSopFieldValue("destination.city", "  reggio   emilia "), "Reggio Emilia");
    assert.equal(normalizeSopFieldValue("academics.subjects", "physics, chemistry"), "physics, chemistry", "not a name field");
    assert.equal(normalizeSopFieldValue("academics.percentage", "85%"), "85%");
  });

  it("a city alone changes nothing in the text while the university is unknown, then appears with it", () => {
    const ctx = sopFor("p-mast").ctx;
    ctx.student.city = "Ayodhya";
    ctx.student.country = "India";
    ctx.destination.university = "";
    ctx.destination.city = "";
    const current = renderSopSections(ctx);

    const cityOnly = updateSopSectionsWithFields(current, ctx, undefined, { "destination.city": "Catania" });
    assert.deepEqual(cityOnly.sections, current, "nothing to show yet: the university paragraph needs the university");

    const both = updateSopSectionsWithFields(current, ctx, { "destination.city": "Catania" }, {
      "destination.city": "Catania",
      "destination.university": "University of Catania",
    });
    const why = both.sections.find((s) => s.heading === "Why This University");
    assert.match(why!.content, /University of Catania\*\* because/);
    assert.match(why!.content, /in \*\*Catania\*\*/);
  });
});

describe("answering missing details one by one (chat flow)", () => {
  it("each answer shrinks the missing list, the text updates, and it ends with nothing missing", () => {
    const ctx = sopFor("p-mast").ctx;
    ctx.student.city = "Ayodhya";
    ctx.student.country = "India";
    ctx.destination.university = "";
    ctx.destination.city = "";
    ctx.academics.subjects = "";
    ctx.academics.board = "";
    ctx.academics.percentage = "";

    let values: Record<string, string> = {};
    let sections = renderSopSections(ctx, values);
    const answers: Record<string, string> = {
      "destination.university": "university of catania",
      "destination.city": "catania",
      "academics.subjects": "Computer Science",
      "academics.board": "Sample University",
      "academics.percentage": "81%",
    };

    let remaining = getSopMissingGroups(ctx, values).flatMap((g) => g.fields);
    assert.equal(remaining.length, Object.keys(answers).length);

    let guard = 0;
    while (remaining.length > 0 && guard++ < 20) {
      const next = remaining[0]; // the question the bot asks next
      assert.ok(next.question.length > 0);
      const typed = answers[next.key];
      assert.ok(typed, `unexpected question for ${next.key}`);
      const nextValues = { ...values, [next.key]: normalizeSopFieldValue(next.key, typed) };
      const { sections: updated } = updateSopSectionsWithFields(sections, ctx, values, nextValues);
      values = nextValues;
      sections = updated;
      const after = getSopMissingGroups(ctx, values).flatMap((g) => g.fields);
      assert.equal(after.length, remaining.length - 1, "exactly one detail is resolved per answer");
      remaining = after;
    }

    assert.equal(remaining.length, 0);
    assert.equal(getSopMissingCount(ctx, values), 0);
    const out = sections.map((s) => s.content).join("\n\n");
    assert.match(out, /University of Catania/);
    assert.match(out, /in \*\*Catania\*\*/);
    assert.match(out, /focusing on Computer Science/);
    assert.match(out, /aggregate score of \*\*81%\*\*/);
    assert.doesNotMatch(out, /\*\*\s*\*\*|MISSING|\{\{|\[\[/);
    // Result equals rendering everything in one go: no drift from step-by-step updates.
    assert.deepEqual(sections, renderSopSections(ctx, values));
  });
});

// ---------------------------------------------------------------------------
// University / course / country names accepted in every CRM shape
// ---------------------------------------------------------------------------
import { resolveRefName } from "@/services/normalization/mapCrmToNormalizedStudent";

describe("university, course and country names are read from every CRM shape", () => {
  const withProgram = (program: Record<string, unknown>, list: "appliedPrograms" | "shortlistedPrograms" = "appliedPrograms") =>
    ({
      ...(snapshot as unknown as Record<string, unknown>),
      appliedPrograms: [],
      shortlistedPrograms: [],
      [list]: [{ _id: "px1", country: { name: "Italy" }, course: { title: "Master Degree in Economics" }, ...program }],
    }) as unknown as CrmSnapshot;
  const uniOf = (s: CrmSnapshot) => mapCrmToNormalizedStudent(s).applications.all[0].university;

  it("accepts { name }, { title }, plain text and flat fields", () => {
    assert.equal(uniOf(withProgram({ university: { name: "University of Messina" } })), "University of Messina");
    assert.equal(uniOf(withProgram({ university: { title: "University of Messina" } })), "University of Messina");
    assert.equal(uniOf(withProgram({ university: "University of Messina" })), "University of Messina");
    assert.equal(uniOf(withProgram({ universityName: "University of Messina" })), "University of Messina");
    assert.equal(uniOf(withProgram({ university: { _id: "5a0000000000000000000032" }, universityName: "University of Messina" })), "University of Messina");
  });

  it("trims whitespace and uses the nested name before the flat fallback", () => {
    assert.equal(uniOf(withProgram({ university: { name: "  University of Cassino " }, universityName: "Other" })), "University of Cassino");
  });

  it("never turns a database id into a name", () => {
    assert.equal(uniOf(withProgram({ university: "5a0000000000000000000032" })), "");
    assert.equal(uniOf(withProgram({ university: { _id: "5a0000000000000000000032" } })), "");
    assert.equal(uniOf(withProgram({ university: { name: "5A0000000000000000000032" } })), "");
    assert.equal(uniOf(withProgram({})), "");
    assert.equal(resolveRefName(undefined), "");
    assert.equal(resolveRefName(null, ""), "");
  });

  it("course and country accept the same shapes", () => {
    const n = mapCrmToNormalizedStudent(withProgram({ course: "Master Degree in Law", country: "Italy" }));
    assert.equal(n.applications.all[0].course, "Master Degree in Law");
    assert.equal(n.applications.all[0].country, "Italy");
    const n2 = mapCrmToNormalizedStudent(withProgram({ course: undefined, courseTitle: "MSc in Data Science" }));
    assert.equal(n2.applications.all[0].course, "MSc in Data Science");
  });

  it("shortlisted programs get the same treatment", () => {
    const n = mapCrmToNormalizedStudent(withProgram({ university: "University of Teramo" }, "shortlistedPrograms"));
    assert.equal(n.applications.all[0].university, "University of Teramo");
    assert.equal(n.applications.all[0].status, "shortlisted");
  });

  it("the SOP now carries the university when the CRM sends it as plain text", () => {
    const s = withProgram({ university: "University of Messina" });
    const n = mapCrmToNormalizedStudent(s);
    const ctx = mapNormalizedToSop(n);
    assert.equal(ctx.destination.university, "University of Messina");
    assert.equal(ctx.destination.city, "Messina");
    const doc = hydrateDocumentFromSnapshot("SOP", s, "s1", "university-sop-standard", "px1");
    assert.equal(doc.targetUniversity, "University of Messina");
    assert.match(doc.sections.map((x) => x.content).join(" "), /University of Messina/);
  });
});

// ---------------------------------------------------------------------------
// Real CRM shape: university = { _id, institutionName }, explicit level, shortlist-only student
// ---------------------------------------------------------------------------
import { levelFromCrm } from "@/services/normalization/mapCrmToNormalizedStudent";

describe("live CRM shape (institutionName, level, shortlist-only)", () => {
  const liveStyle = {
    student: {
      _id: "6a9e7e4b5c5bdc66094de938",
      personalDetails: { firstName: "Test", lastName: "Student" },
      academicQualifications: [
        { _id: "a", levelOfStudy: "Grade 10th", qualification: "English, Hindi, Science, Mathematics", institution: "School 10", score: "69%", endDate: "2021-08-03T00:00:00.000Z" },
        { _id: "b", levelOfStudy: "Grade 12th", qualification: "Accountancy, Business Studies, Economics, English", institution: "School 12", boardOrUniversity: "CBSE", score: "87.20%", endDate: "2023-05-12T00:00:00.000Z" },
        { _id: "c", levelOfStudy: "Undergraduate", qualification: "BBA", institution: "College of Innovative Management and Science", boardOrUniversity: "University of Lucknow", score: "69.5", endDate: "2026-06-25T00:00:00.000Z" },
      ],
    },
    appliedPrograms: [],
    shortlistedPrograms: [
      { _id: "s1", level: "PG", course: { _id: "c1", title: "Applied Economics and Markets" }, university: { _id: "u1", institutionName: "University of Bologna" }, country: { _id: "k", name: "Italy" } },
      { _id: "s2", level: "PG", course: { _id: "c2", title: "Global economy and business" }, university: { _id: "u2", institutionName: "University of Cassino" }, country: { name: "Italy" } },
      { _id: "s3", level: "UG", course: { _id: "c3", title: "Economics" }, university: { _id: "u3", institutionName: "University of Teramo" }, country: { name: "Italy" } },
      { _id: "s4", level: "", course: { _id: "c4", title: "Business Administration" }, university: { _id: "u4", institutionName: "University of Siena" }, country: { name: "Italy" } },
    ],
    documents: [],
  } as unknown as CrmSnapshot;

  it("reads the university from institutionName", () => {
    const n = mapCrmToNormalizedStudent(liveStyle);
    assert.deepEqual(
      n.applications.all.map((p) => p.university),
      ["University of Bologna", "University of Cassino", "University of Teramo", "University of Siena"]
    );
    assert.ok(n.applications.all.every((p) => p.status === "shortlisted"));
    assert.equal(n.applications.activeProgram?.university, "University of Bologna");
  });

  it("uses the CRM's explicit level, falling back to the title only when it is empty", () => {
    const n = mapCrmToNormalizedStudent(liveStyle);
    assert.deepEqual(n.applications.all.map((p) => p.degreeLevel), ["Master's", "Master's", "Bachelor's", "Master's"]);
    assert.equal(levelFromCrm("PG"), "Master's");
    assert.equal(levelFromCrm("Postgraduate"), "Master's");
    assert.equal(levelFromCrm("UG"), "Bachelor's");
    assert.equal(levelFromCrm("Undergraduate"), "Bachelor's");
    assert.equal(levelFromCrm("PhD"), "PhD");
    assert.equal(levelFromCrm(""), null);
    assert.equal(levelFromCrm("???"), null);
  });

  it("a UG-level program is grounded in the 12th record, a PG one in the bachelor's", () => {
    const ug = mapNormalizedToSop(mapCrmToNormalizedStudent(liveStyle, { activeProgramId: "s3" }));
    assert.equal(ug.academics.institution, "School 12");
    assert.equal(ug.academics.subjects, "Accountancy, Business Studies, Economics, English");
    const pg = mapNormalizedToSop(mapCrmToNormalizedStudent(liveStyle, { activeProgramId: "s1" }));
    assert.equal(pg.academics.institution, "College of Innovative Management and Science");
    assert.equal(pg.academics.previousDegree, "BBA");
  });

  it("a bare 'BBA' gives its field; subjects and city are no longer missing", () => {
    const ctx = mapNormalizedToSop(mapCrmToNormalizedStudent(liveStyle, { activeProgramId: "s1" }));
    assert.equal(ctx.academics.subjects, "Business Administration");
    assert.equal(ctx.destination.city, "Bologna");
    ctx.student.city = "Ayodhya";
    ctx.student.country = "India";
    assert.equal(getSopMissingCount(ctx), 0);
    const out = renderSopSections(ctx).map((s) => s.content).join(" ");
    assert.match(out, /programme at \*\*University of Bologna\*\*/);
    assert.match(out, /focusing on Business Administration/);
    assert.doesNotMatch(out, /\*\*\s*\*\*|MISSING/);
  });

  it("resolves more Italian university cities", () => {
    assert.equal(lookupUniversityCity("University of Cassino"), "Cassino");
    assert.equal(lookupUniversityCity("University of Teramo"), "Teramo");
    assert.equal(lookupUniversityCity('University of Naples "Federico II"'), "Naples");
    assert.equal(lookupUniversityCity("University of Tor Vergata"), "Rome");
    assert.equal(lookupUniversityCity("University of Milan, La Statale"), "Milan");
  });

  it("deriveSubjectsText: abbreviations map to a field, unknown bare degrees stay missing", () => {
    const q = (qualification: string) => ({ id: "x", levelOfStudy: "Undergraduate", qualification });
    assert.equal(deriveSubjectsText(q("BBA")), "Business Administration");
    assert.equal(deriveSubjectsText(q("B.Com")), "Commerce");
    assert.equal(deriveSubjectsText(q("BCA")), "Computer Applications");
    assert.equal(deriveSubjectsText(q("B.Tech")), "");
    assert.equal(deriveSubjectsText(q("B.Sc")), "");
  });
});

// ---------------------------------------------------------------------------
// Program duration and intake in the SOP
// ---------------------------------------------------------------------------
import {
  cleanIntakes,
  formatIntakeMonths,
  formatIntakePhrase,
  formatProgramDuration,
} from "@/services/normalization/programTiming";

describe("program duration and intake in the SOP", () => {
  it("formats durations in words and never from zero/unknown values", () => {
    assert.equal(formatProgramDuration(2, undefined), "two years");
    assert.equal(formatProgramDuration(1, null), "one year");
    assert.equal(formatProgramDuration("3", ""), "three years");
    assert.equal(formatProgramDuration(1, 6), "one year and six months");
    assert.equal(formatProgramDuration(undefined, 18), "18 months");
    assert.equal(formatProgramDuration(0, 0), "");
    assert.equal(formatProgramDuration(undefined, undefined), "");
    assert.equal(formatProgramDuration("abc", -2), "");
  });

  it("cleans, capitalises and de-duplicates intakes; phrases single vs multiple", () => {
    assert.deepEqual(cleanIntakes(["september", " SEPTEMBER ", "february", "", 5 as unknown as string]), ["September", "February"]);
    assert.deepEqual(cleanIntakes(undefined), []);
    assert.equal(formatIntakeMonths(["september", "february"]), "September and February");
    assert.equal(formatIntakePhrase(["september"]), "starts in September");
    assert.equal(formatIntakePhrase(["september", "february"]), "offers intakes in September and February");
    assert.equal(formatIntakePhrase(["a", "b", "c"]), "offers intakes in A, B and C");
    assert.equal(formatIntakePhrase([]), "");
  });

  const programSnap = (extra: Record<string, unknown>) =>
    ({
      ...(snapshot as unknown as Record<string, unknown>),
      appliedPrograms: [],
      shortlistedPrograms: [
        { _id: "t1", level: "PG", course: { title: "Master Degree in Economics" }, university: { institutionName: "University of Siena" }, country: { name: "Italy" }, ...extra },
      ],
    }) as unknown as CrmSnapshot;
  const sopText = (s: CrmSnapshot) => {
    const ctx = mapNormalizedToSop(mapCrmToNormalizedStudent(s));
    ctx.student.city = "Ayodhya";
    ctx.student.country = "India";
    return { ctx, text: renderSopSections(ctx).map((x) => x.content).join(" ") };
  };

  it("reads durationYear/durationMonth/intakes from the CRM program", () => {
    const n = mapCrmToNormalizedStudent(programSnap({ durationYear: 2, durationMonth: null, intakes: ["september"] }));
    const p = n.applications.all[0];
    assert.equal(p.durationYears, 2);
    assert.equal(p.durationMonths, undefined);
    assert.deepEqual(p.intakes, ["September"]);
  });

  it("writes the duration and a single intake into the SOP", () => {
    const { ctx, text } = sopText(programSnap({ durationYear: 2, intakes: ["september"] }));
    assert.equal(ctx.destination.duration, "two years");
    assert.equal(ctx.destination.intakeMonth, "September");
    assert.equal(ctx.destination.intakeYear, "", "no intake year is ever invented");
    assert.match(text, /The programme lasts two years\./);
    assert.match(text, /The programme starts in September\./);
  });

  it("says 'offers intakes' when the program has several, rather than picking one", () => {
    const { text } = sopText(programSnap({ durationYear: 1, intakes: ["september", "february"] }));
    assert.match(text, /The programme lasts one year\./);
    assert.match(text, /The programme offers intakes in September and February\./);
    assert.doesNotMatch(text, /starts in/);
  });

  it("leaves both sentences out when the CRM has neither, and does not list them as missing", () => {
    const { ctx, text } = sopText(programSnap({ durationYear: null, intakes: [] }));
    assert.doesNotMatch(text, /programme lasts|The programme (starts|offers)|MISSING|\*\*\s*\*\*/);
    assert.equal(getSopMissingCount(ctx), 0);
    assert.ok(!getSopMissingKeys(ctx).some((k) => /duration|intake/i.test(k)));
  });

  it("duration alone or intake alone each work on their own", () => {
    assert.match(sopText(programSnap({ durationYear: 2, intakes: [] })).text, /The programme lasts two years\./);
    assert.doesNotMatch(sopText(programSnap({ durationYear: 2, intakes: [] })).text, /starts in|offers intakes/);
    assert.match(sopText(programSnap({ intakes: ["september"] })).text, /The programme starts in September\./);
    assert.doesNotMatch(sopText(programSnap({ intakes: ["september"] })).text, /lasts/);
  });

  it("the sentences sit inside 'Why This Course' and stay on the right program", () => {
    const a = programSnap({ durationYear: 2, intakes: ["september"] });
    const doc = hydrateDocumentFromSnapshot("SOP", a, "s1", "university-sop-standard", "t1");
    const why = doc.sections.find((s) => s.heading === "Why This Course");
    assert.match(why!.content, /lasts two years/);
    const other = hydrateDocumentFromSnapshot("SOP", programSnap({ durationYear: 1, intakes: ["february"] }), "s1", "university-sop-standard", "t1");
    assert.match(other.sections.find((s) => s.heading === "Why This Course")!.content, /lasts one year\. The programme starts in February\./);
  });
});

// ---------------------------------------------------------------------------
// School records: the subject list must never be used as the qualification's name
// ---------------------------------------------------------------------------
import { displayQualificationTitle } from "@/services/normalization/selectRelevantQualification";

describe("12th / 10th records get a proper qualification name", () => {
  const subjectsAsQualification = {
    id: "q12",
    levelOfStudy: "Grade 12th",
    qualification: "Accountancy, Business Studies, Economics, English, Informatics Practices",
    subjects: "Accountancy, Business Studies, Economics, English, Informatics Practices",
    institution: "Tiny Tots Sr. Sec. School",
  };

  it("names school records by level, not by their subject list", () => {
    assert.equal(displayQualificationTitle(subjectsAsQualification), "Higher Secondary (Class 12)");
    assert.equal(displayQualificationTitle({ id: "q10", levelOfStudy: "Grade 10th", qualification: "English, Hindi, Science, Mathematics" }), "Secondary (Class 10)");
    assert.equal(displayQualificationTitle({ id: "d", levelOfStudy: "Undergraduate", qualification: "BBA" }), "BBA");
    assert.equal(displayQualificationTitle(null), "");
    // A real title stored by the CRM is kept exactly, even for a 12th record.
    assert.equal(
      displayQualificationTitle({ id: "r", levelOfStudy: "12th", qualification: "Senior Secondary Certificate (Class XII)" }),
      "Senior Secondary Certificate (Class XII)"
    );
    // Nothing stored: fall back to the level.
    assert.equal(displayQualificationTitle({ id: "e", levelOfStudy: "Grade 12th", qualification: "" }), "Higher Secondary (Class 12)");
  });

  it("a Bachelor's SOP reads 'my Higher Secondary (Class 12)', with the subjects kept separately", () => {
    const s = {
      ...(snapshot as unknown as Record<string, unknown>),
      student: {
        ...(snapshot as unknown as { student: Record<string, unknown> }).student,
        academicQualifications: [
          { _id: "a", levelOfStudy: "Grade 12th", qualification: subjectsAsQualification.qualification, institution: "Tiny Tots Sr. Sec. School", boardOrUniversity: "Central Board of Secondary Education", score: "87.20%", endDate: "2023-05-12T00:00:00.000Z" },
          { _id: "b", levelOfStudy: "Undergraduate", qualification: "BBA", institution: "College of Innovative Management and Science", boardOrUniversity: "University of Lucknow", score: "69.5", endDate: "2026-06-25T00:00:00.000Z" },
        ],
      },
      appliedPrograms: [],
      shortlistedPrograms: [{ _id: "u1", level: "UG", course: { title: "Economics" }, university: { institutionName: "University of Siena" }, country: { name: "Italy" } }],
    } as unknown as CrmSnapshot;
    const ctx = mapNormalizedToSop(mapCrmToNormalizedStudent(s));
    assert.equal(ctx.academics.latestQualification, "Higher Secondary (Class 12)");
    assert.equal(ctx.academics.subjects, "Accountancy, Business Studies, Economics, English, Informatics Practices");
    ctx.student.city = "Ayodhya";
    ctx.student.country = "India";
    const out = renderSopSections(ctx).map((x) => x.content).join(" ");
    assert.match(out, /Having completed my Higher Secondary \(Class 12\) at Tiny Tots Sr\. Sec\. School/);
    assert.match(out, /I completed my Higher Secondary \(Class 12\) from \*\*Tiny Tots Sr\. Sec\. School\*\* under the Central Board of Secondary Education/);
    assert.match(out, /focusing on Accountancy, Business Studies, Economics, English, Informatics Practices/);
    assert.doesNotMatch(out, /my Accountancy|completed my Accountancy/);
  });

  it("a Master's SOP still uses the degree name", () => {
    const ctx = sopFor("p-mast").ctx;
    assert.equal(ctx.academics.latestQualification, "B.Tech Computer Science");
    assert.equal(ctx.academics.previousDegree, "B.Tech Computer Science");
  });
});
