import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recoverLinks, extractUrls } from "../normalizers/linkRecovery";
import type { DocumentData } from "@/types";

// Text as extracted from a Europass PDF (the AI step returned education without any website).
const RAW = `Vidit Nagar Passport: AH201878 Email address: viditnagar154@gmail.com
EDUCATION AND TRAINING Bachelor of Business Administration The Bhopal School of Social Sciences [ 01/08/2023 – 30/04/2026 ]
Address: DRM OFFICE, Bhopal | Website: https://bsssbhopal.edu.in/ | Final grade: 7.49/10
Grade 12th Gyan Ganga International Academy [ 01/04/2022 – 12/05/2023 ]
Address: National Highway, 12, Bhopal | Website:https://www.orchidsinternationalschool.com/bhopal-branches/hoshangabad-road | Final grade: 90.2/100
Grade 10th Gyan Ganga International Academy [ 01/04/2020 – 03/08/2021 ]
Address: National Highway, 12, Bhopal | Website: https://www.orchidsinternationalschool.com/bhopal-branches/hoshangabad-road | Final grade: 73.4/100
LANGUAGE SKILLS`;

const baseData = (): DocumentData => ({
  personal: { fullName: "Vidit Nagar" },
  education: [
    { id: "1", qualification: "Bachelor of Business Administration", institution: "The Bhopal School of Social Sciences" },
    { id: "2", qualification: "Grade 12th", institution: "Gyan Ganga International Academy" },
    { id: "3", qualification: "Grade 10th", institution: "Gyan Ganga International Academy" },
  ] as DocumentData["education"],
});

describe("recoverLinks", () => {
  it("re-attaches each education entry's website from the CV text", () => {
    const out = recoverLinks(baseData(), RAW);
    assert.equal(out.education?.[0].website, "https://bsssbhopal.edu.in/");
    assert.equal(out.education?.[1].website, "https://www.orchidsinternationalschool.com/bhopal-branches/hoshangabad-road");
    assert.equal(out.education?.[2].website, "https://www.orchidsinternationalschool.com/bhopal-branches/hoshangabad-road");
  });

  it("never overwrites a website the AI already returned", () => {
    const data = baseData();
    data.education![0].website = "https://mine.example";
    const out = recoverLinks(data, RAW);
    assert.equal(out.education?.[0].website, "https://mine.example");
  });

  it("does not take another entry's URL when an entry has none", () => {
    const text = "Education Alpha College [2020 – 2022] Address: X | Final grade: 8 Beta School [2018 – 2020] Website: https://beta.edu";
    const data = {
      personal: {},
      education: [
        { id: "1", institution: "Alpha College" },
        { id: "2", institution: "Beta School" },
      ],
    } as DocumentData;
    const out = recoverLinks(data, text);
    assert.equal(out.education?.[0].website, undefined);
    assert.equal(out.education?.[1].website, "https://beta.edu");
  });

  it("fills LinkedIn / GitHub from text or PDF link annotations, without overwriting", () => {
    const out = recoverLinks(
      { personal: { githubUrl: "https://github.com/keep" } } as DocumentData,
      "Jane Doe jane@x.com",
      ["https://www.linkedin.com/in/jane", "https://github.com/other"]
    );
    assert.equal(out.personal?.linkedinUrl, "https://www.linkedin.com/in/jane");
    assert.equal(out.personal?.githubUrl, "https://github.com/keep");
  });

  it("recovers project and certificate links that follow their title", () => {
    const data = {
      personal: {},
      academicProjects: [{ id: "p", title: "Prabhav Website" }],
      certifications: [{ id: "c", name: "Google Data Analytics" }],
    } as DocumentData;
    const out = recoverLinks(
      data,
      "Projects Prabhav Website https://prabhav.org Certifications Google Data Analytics Credential: https://coursera.org/verify/ABC123."
    );
    assert.equal(out.academicProjects?.[0].link, "https://prabhav.org");
    assert.equal(out.certifications?.[0].credentialLink, "https://coursera.org/verify/ABC123");
  });

  it("extractUrls trims trailing punctuation and de-duplicates", () => {
    assert.deepEqual(extractUrls("see https://a.com/x, and https://a.com/x."), ["https://a.com/x"]);
  });
});
