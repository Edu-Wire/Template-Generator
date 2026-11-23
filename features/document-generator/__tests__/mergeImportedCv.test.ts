import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeImportedIntoCv } from "../utils/mergeImportedCv";
import type { DocumentData } from "@/types";

const stored: DocumentData = {
  personal: { fullName: "Aafia Ameen", email: "crm@example.com", phone: "+91 98765 00000", photoUrl: "crm-photo" },
  aboutMe: "Stored summary",
  education: [{ id: "e1", qualification: "Class XII", institution: "National College Bangalore" }],
  skills: [{ id: "s1", name: "React" }],
  englishCertificate: { examName: "IELTS", score: "7.0" },
};

const uploaded: DocumentData = {
  personal: { fullName: "A. Ameen", email: "other@example.com", linkedinUrl: "https://linkedin.com/in/aafia", photoUrl: "pdf-photo" },
  aboutMe: "Uploaded summary",
  education: [
    { id: "e1", qualification: "class xii", institution: "National College, Bangalore" }, // duplicate
    { id: "e1", qualification: "B.Tech CSE", institution: "VTU" }, // new (id collides on purpose)
  ],
  internships: [{ id: "i1", role: "Full Stack Developer Intern", company: "Digiwire" }],
  skills: [{ id: "s9", name: "react" }, { id: "s2", name: "Node.js" }],
  englishCertificate: { examName: "TOEFL", score: "100" },
  customSections: [{ id: "c1", title: "Publications", content: "Paper 1" }],
};

describe("mergeImportedIntoCv", () => {
  const { data, summary } = mergeImportedIntoCv(stored, uploaded);

  it("never overwrites stored personal data, only fills empty fields", () => {
    assert.equal(data.personal?.fullName, "Aafia Ameen");
    assert.equal(data.personal?.email, "crm@example.com");
    assert.equal(data.personal?.photoUrl, "crm-photo");
    assert.equal(data.personal?.linkedinUrl, "https://linkedin.com/in/aafia");
  });

  it("keeps stored text blocks and english certificate", () => {
    assert.equal(data.aboutMe, "Stored summary");
    assert.equal(data.englishCertificate?.examName, "IELTS");
  });

  it("appends only new list entries and skips duplicates", () => {
    assert.equal(data.education?.length, 2);
    assert.equal(data.education?.[0].institution, "National College Bangalore");
    assert.equal(data.education?.[1].qualification, "B.Tech CSE");
    assert.notEqual(data.education?.[1].id, data.education?.[0].id);
    assert.deepEqual(data.skills?.map((s) => s.name), ["React", "Node.js"]);
  });

  it("adds sections that were empty and new custom sections", () => {
    assert.equal(data.internships?.length, 1);
    assert.equal(data.customSections?.[0].title, "Publications");
  });

  it("does not mutate the stored object", () => {
    assert.equal(stored.education?.length, 1);
  });

  it("reports what was added vs kept", () => {
    const edu = summary.find((s) => s.key === "education");
    assert.deepEqual([edu?.added, edu?.kept, edu?.duplicates], [1, 1, 1]);
    const work = summary.find((s) => s.key === "internships");
    assert.deepEqual([work?.added, work?.kept], [1, 0]);
  });

  it("lets an explicit CRM-conflict choice override a personal field", () => {
    const res = mergeImportedIntoCv(stored, uploaded, { overridePersonalFields: ["email"] });
    assert.equal(res.data.personal?.email, "other@example.com");
    assert.equal(res.data.personal?.fullName, "Aafia Ameen");
  });
});

describe("mergeImportedIntoCv photo rule", () => {
  it("never takes the profile photo from the uploaded resume, even when none is stored", () => {
    const noPhoto: DocumentData = { personal: { fullName: "Aafia Ameen" } };
    const res = mergeImportedIntoCv(noPhoto, { personal: { fullName: "Aafia", photoUrl: "pdf-photo" } });
    assert.equal(res.data.personal?.photoUrl, undefined);
    const withPhoto = mergeImportedIntoCv(
      { personal: { photoUrl: "crm-photo" } },
      { personal: { photoUrl: "pdf-photo" } },
      { overridePersonalFields: ["photoUrl"] }
    );
    assert.equal(withPhoto.data.personal?.photoUrl, "crm-photo");
  });
});

describe("mergeImportedIntoCv junk custom sections", () => {
  it("skips parser leftovers but keeps real custom sections", () => {
    const res = mergeImportedIntoCv(
      { personal: { fullName: "A" } },
      {
        customSections: [
          { id: "1", title: "A C ADE M IC P RO F IL E", content: "Btech-CSIT ..." },
          { id: "2", title: "▪ HTML and CSS", content: "▪ JavaScript development" },
          { id: "3", title: "Roles &", content: "Responsibilities" },
          { id: "4", title: "S K I L L S", content: "▪ Web Development" },
          { id: "5", title: "C E R T IF I C AT IO NS & P R O J E CT S", content: "" },
          { id: "6", title: "Publications", content: "Paper 1" },
        ],
      }
    );
    assert.deepEqual(res.data.customSections?.map((c) => c.title), ["Publications"]);
  });
});

describe("mergeImportedIntoCv duplicate detection (CRM wording vs resume wording)", () => {
  const crm: DocumentData = {
    education: [
      { id: "1", qualification: "Csit", institution: "Symbiosis University of Applied Sciences", startDate: "2021-01-08", endDate: "2025-06-08" },
      { id: "2", qualification: "Pcb", institution: "The Emerald Heights Int School", startDate: "2019-03-08", endDate: "2020-06-08" },
      { id: "3", qualification: "Grade 10th", institution: "Emerald Heights Int School", startDate: "2018-01-08", endDate: "2019-03-08" },
    ],
    internships: [{ id: "i1", role: "Intern in AI ,ML and Data Science", company: "Inwizio" }],
    certifications: [{ id: "c1", name: "AWS Certified Solutions Architect", provider: "Amazon" }],
  };

  it("does not re-add the same education / internship / certification under different wording", () => {
    const res = mergeImportedIntoCv(crm, {
      education: [
        { id: "a", qualification: "Btech-CSIT", institution: "Symbiosis University of Applied Sciences, Indore", startDate: "2021", endDate: "2025" },
        { id: "b", qualification: "Class XII", institution: "Emerald Heights Int. School, Indore (CBSE)", startDate: "2019", endDate: "2020" },
        { id: "c", qualification: "Class X", institution: "Emerald Heights Int. School , Indore (CBSE)", startDate: "2017", endDate: "2018" },
      ],
      internships: [{ id: "x", role: "Student Intern AI ,ML", company: "Inwizio Technologies", startDate: "Jan 2025", endDate: "May 2025" }],
      certifications: [{ id: "y", name: "AWS Certified Solutions Architect – Associate", provider: "Amazon Web Services" }],
    });
    assert.equal(res.data.education?.length, 3);
    assert.equal(res.data.internships?.length, 1);
    assert.equal(res.data.certifications?.length, 1);
  });

  it("still adds genuinely different entries", () => {
    const res = mergeImportedIntoCv(crm, {
      education: [
        { id: "m", qualification: "M.Sc Data Science", institution: "Symbiosis University of Applied Sciences", startDate: "2025", endDate: "2027" }, // same school, later degree
        { id: "k", qualification: "Class XII", institution: "Emerald Heights Int. School", startDate: "2019", endDate: "2020" }, // dup of Pcb
        { id: "t", qualification: "Class X", institution: "Different Public School", startDate: "2017", endDate: "2018" },
      ],
      internships: [
        { id: "w", role: "Python Developer Intern", company: "WebAsha Technologies", startDate: "June 2022", endDate: "Aug 2022" },
        { id: "z", role: "Intern", company: "Inwizio Technologies", startDate: "Jan 2023", endDate: "Mar 2023" }, // dates unknown on stored side -> treated as same company
      ],
    });
    assert.deepEqual(res.data.education?.map((e) => e.qualification), ["Csit", "Pcb", "Grade 10th", "M.Sc Data Science", "Class X"]);
    assert.deepEqual(res.data.internships?.map((i) => i.company), ["Inwizio", "WebAsha Technologies"]);
  });

  it("keeps Class X and Class XII of the same school distinct, and two stints at one company with different years", () => {
    const stored: DocumentData = {
      education: [{ id: "1", qualification: "Class XII", institution: "Emerald Heights Int. School", startDate: "2019", endDate: "2020" }],
      internships: [{ id: "i", role: "Intern", company: "Inwizio Technologies", startDate: "Jun 2024", endDate: "Aug 2024" }],
    };
    const res = mergeImportedIntoCv(stored, {
      education: [{ id: "2", qualification: "Class X", institution: "Emerald Heights Int. School", startDate: "2017", endDate: "2018" }],
      internships: [{ id: "j", role: "Intern", company: "Inwizio Technologies", startDate: "Jan 2025", endDate: "May 2025" }],
    });
    assert.equal(res.data.education?.length, 2);
    assert.equal(res.data.internships?.length, 2);
  });
});

describe("mergeImportedIntoCv link fill", () => {
  it("fills an empty website on a stored entry that the upload duplicates, without replacing a set one", () => {
    const existing = {
      personal: {},
      education: [
        { id: "a", qualification: "Grade 12th", institution: "Gyan Ganga International Academy", startDate: "2022", endDate: "2023" },
        { id: "b", qualification: "Grade 10th", institution: "Gyan Ganga International Academy", startDate: "2020", endDate: "2021", website: "https://keep.me" },
      ],
    } as DocumentData;
    const imported = {
      personal: {},
      education: [
        { id: "x", qualification: "Grade 12th", institution: "Gyan Ganga International Academy", startDate: "2022", endDate: "2023", website: "https://school.edu" },
        { id: "y", qualification: "Grade 10th", institution: "Gyan Ganga International Academy", startDate: "2020", endDate: "2021", website: "https://other.edu" },
      ],
    } as DocumentData;
    const { data } = mergeImportedIntoCv(existing, imported);
    assert.equal(data.education?.length, 2);
    assert.equal(data.education?.[0].website, "https://school.edu");
    assert.equal(data.education?.[1].website, "https://keep.me");
  });
});
