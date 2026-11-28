import { parseOtherLanguages, formatOtherLanguage } from "./languageSectionContent";

export function sanitizeAddressValue(raw: string): string {
  if (!raw) return "";
  let clean = raw.trim();
  // Strip surrounding quotes
  clean = clean.replace(/^['"`]+|['"`]+$/g, "").trim();
  // Strip trailing conversational sentences or instructions
  clean = clean.replace(/\s+(?:to|in|for)\s+(?:the\s+)?(?:about\s+me|cv|profile|section).*$/i, "");
  clean = clean.replace(/\s+as\s+requested.*$/i, "");
  clean = clean.replace(/\s+proceed\s+with\s+it.*$/i, "");
  clean = clean.replace(/^['"`]+|['"`]+$/g, "").trim();
  clean = clean.replace(/[.,;]+$/, "").trim();

  // If user typed "bhopal india", normalize to "Bhopal, India"
  if (/^[a-zA-Z\s]+$/.test(clean) && !clean.includes(",")) {
    const parts = clean.split(/\s+/);
    if (parts.length === 2) {
      clean = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(", ");
    } else {
      clean = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
    }
  }

  return clean;
}

import { DEFAULT_MOVABLE_SECTION_ORDER, type DocumentData } from "@/types/document";
import { parseDescriptionToBullets, stripLeadingMarkers } from "@/templates/europass/utils/descriptionParser";
import { sortEducationEntries } from "@/features/document-generator/utils/educationSequence";
import { parseDateRange } from "@/features/document-generator/utils/dateRange";

const EUROPASS_STUDIO_DEFAULT_ORDER: string[] = [
  "aboutMe",
  "education",
  "languages",
  "englishCertificate",
  "hobbies",
  "internships",
  "academicProjects",
  "achievements",
  "certifications",
  "skills",
  "leadershipActivities",
  "volunteering",
  "academicInterests",
  "recommendations",
  "declaration",
];

/** Stable id for a user-defined (custom) section, derived from its title. */
export function customSectionId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "custom";
}

/**
 * Maps a flat studio section heading to its canonical DocumentData sectionId.
 */
export function headingToSectionId(heading: string): string | null {
  const h = heading.toLowerCase();
  if (h.includes("about me") || h.includes("about")) return "aboutMe";
  if (h.includes("education") || h.includes("training")) return "education";
  if (
    h.includes("work") || h.includes("internship") || h.includes("employment") ||
    (h.includes("experience") && !h.includes("leadership") && !h.includes("volunteer"))
  ) return "internships";
  if (h.includes("english") || h.includes("ielts") || h.includes("toefl")) return "englishCertificate";
  if (h.includes("language")) return "languages";
  if (h.includes("digital") || h.includes("skill") || h.includes("technical")) return "skills";
  if (h.includes("certification") || h.includes("certificate")) return "certifications";
  if (h.includes("academic interest") || (h.includes("interest") && !h.includes("hobb"))) return "academicInterests";
  if (h.includes("hobbi") || h.includes("interest")) return "hobbies";
  if (h.includes("project")) return "academicProjects";
  if (h.includes("achievement") || h.includes("award")) return "achievements";
  if (h.includes("leadership") || h.includes("responsibilit") || h.includes("extracurricular")) return "leadershipActivities";
  if (h.includes("volunteer") || h.includes("community")) return "volunteering";
  if (h.includes("recommendation") || h.includes("referee")) return "recommendations";
  if (h.includes("declaration") || h.includes("compliance") || h.includes("genuine")) return "declaration";
  return null;
}

/**
 * Keeps a CV's flat studio sections well-formed after any edit (assistant, manual or import):
 *  - drops exact-duplicate headings (same heading, empty or identical content) so sections never stack,
 *  - keeps the closing DECLARATION as the very last section,
 *  - restores the DECLARATION from `declarationText` when an edit lost it.
 * Never mutates the input.
 */
export function normalizeCvSections(
  sections: { heading: string; content: string }[],
  declarationText?: string
): { heading: string; content: string }[] {
  const out: { heading: string; content: string }[] = [];
  const seen = new Map<string, number>();
  for (const sec of sections) {
    const key = (sec.heading || "").trim().toLowerCase();
    const prevIdx = key ? seen.get(key) : undefined;
    if (prevIdx !== undefined) {
      const prev = out[prevIdx];
      if (!prev.content.trim() && sec.content.trim()) prev.content = sec.content;
      if (!sec.content.trim() || sec.content.trim() === prev.content.trim()) continue;
    } else if (key) {
      seen.set(key, out.length);
    }
    out.push({ ...sec });
  }

  const declIdx = out.findIndex((s) => headingToSectionId(s.heading || "") === "declaration");
  if (declIdx >= 0) {
    const [decl] = out.splice(declIdx, 1);
    out.push(decl);
  } else if (declarationText?.trim()) {
    out.push({ heading: "DECLARATION", content: declarationText });
  }
  return out;
}

/** Finds the studio section whose heading maps to the canonical section id. */
function findSectionById<T extends { heading?: string }>(sections: T[], id: string): T | undefined {
  return sections.find((s) => headingToSectionId(s.heading || "") === id);
}
function findSectionIndexById<T extends { heading?: string }>(sections: T[], id: string): number {
  return sections.findIndex((s) => headingToSectionId(s.heading || "") === id);
}

/**
 * Synchronizes sections edited in the Caret Editor back into the structured DocumentData model.
 * Ensures that typed-out sections, customized text, empty sections, or deleted sections
 * are immediately and accurately reflected in the Cairo-compliant Europass layout.
 */
export function syncSectionsToCvData(
  sections: { heading?: string; content: string }[],
  baseCv: DocumentData
): DocumentData {
  const updatedCv: DocumentData = JSON.parse(JSON.stringify(baseCv));

  // 1. About Me
  const aboutSec = findSectionById(sections, "aboutMe");
  if (aboutSec && aboutSec.content.trim()) {
    // Strip accidental contact/address line pollution from About Me summary
    const cleanAbout = aboutSec.content
      .replace(/(?:\r?\n|\s+)(?:Home\s+Address|Address)\s*[:\-]\s*[^\n.]+(?:\.)?/gi, "")
      .trim();
    updatedCv.aboutMe = cleanAbout;
  } else if (aboutSec && !aboutSec.content.trim()) {
    updatedCv.aboutMe = "";
  } else if (!aboutSec) {
    updatedCv.aboutMe = "";
    if (updatedCv.sectionOrder) {
      updatedCv.sectionOrder = updatedCv.sectionOrder.filter((id) => id !== "aboutMe" && id !== "about");
    }
  }

  // 2. Work Experience / Internships
  const workSec = findSectionById(sections, "internships");
  if (workSec && workSec.content.trim()) {
    // Tolerate raw pasted text (markdown, "- " bullets, "Company | Role" headers) from any source
    const rawChunks = normalizeInternshipPaste(workSec.content).split(/\n\s*\n+/).filter(Boolean);
    const consolidatedChunks: string[] = [];
    for (const chunk of rawChunks) {
      const trimmed = chunk.trim();
      const firstLine = trimmed.split("\n")[0].trim();
      const isNewEntry =
        /^(?:\d+\.|(?:role|position|company|employer)[:=-]|(?:german|social|marketing|software|frontend|backend|full\s*stack|data|product|trainee|intern|analyst))/i.test(firstLine) ||
        (!/^[•\-\*]/.test(firstLine) && (trimmed.includes("[") || trimmed.includes("–") || trimmed.includes("-")));
      const isBullet = /^[•\-\*]/.test(firstLine);
      if (!isNewEntry && isBullet && consolidatedChunks.length > 0) {
        consolidatedChunks[consolidatedChunks.length - 1] += "\n" + trimmed;
      } else {
        consolidatedChunks.push(trimmed);
      }
    }

    updatedCv.internships = consolidatedChunks
      .map((entryStr, idx) => {
        const lines = entryStr.split("\n").map((l) => l.trim()).filter(Boolean);
        const roleLine = lines[0] || "Role";
        const compLine = lines[1] || "";
        const datesMatch = compLine.match(/\[\s*([^\]]+)\s*\]/);
        const withoutDates = compLine.replace(/\[\s*([^\]]+)\s*\]/, "").trim();
        let compName = withoutDates;
        let locName = "";
        if (withoutDates.includes("|")) {
          const p = withoutDates.split("|").map((x) => x.trim()).filter(Boolean);
          compName = p[0] || "Company";
          locName = p.slice(1).join(", ").replace(/^Location:\s*/i, "").trim();
        } else if (/Location:\s*/i.test(withoutDates)) {
          const locM = withoutDates.match(/Location:\s*([^,.\n]+)/i);
          if (locM) locName = locM[1].trim();
          compName = withoutDates.replace(/Location:\s*[^,.\n]+/i, "").trim();
        }
        const descLines = lines.slice(2);
        const bullets = parseDescriptionToBullets(descLines.join("\n"));
        const cleanDesc = bullets.filter(Boolean).map((b) => `• ${stripLeadingMarkers(b)}`).join("\n");
        const { startDate, endDate } = datesMatch
          ? parseDateRange(datesMatch[1])
          : { startDate: "", endDate: "" };
        return {
          id: `intern-${idx}`,
          role: roleLine,
          company: compName || "Company",
          location: locName || undefined,
          startDate,
          endDate,
          description: cleanDesc,
        };
      })
      .filter((exp) => exp.role && exp.role.length < 100 && (exp.company || exp.description));
  } else if (workSec && !workSec.content.trim()) {
    updatedCv.internships = [];
  } else if (!workSec) {
    updatedCv.internships = [];
    if (updatedCv.sectionOrder) {
      updatedCv.sectionOrder = updatedCv.sectionOrder.filter((id) => id !== "internships");
    }
  }

  // 3. Education
  const eduSec = findSectionById(sections, "education");
  if (eduSec && eduSec.content.trim()) {
    const entries = eduSec.content.split(/\n\n+/).filter(Boolean);
    updatedCv.education = entries.map((entryStr, idx) => {
      const lines = entryStr.split("\n").map((l) => l.trim()).filter(Boolean);
      const qual = lines[0] || "Degree";
      const instLine = lines[1] || "";
      const datesMatch = instLine.match(/\[\s*([^\]]+)\s*\]/);
      const instName = instLine.replace(/\[\s*[^\]]+\s*\]/, "").trim();
      const metaLine = lines.slice(2).join(" | ");
      const gradeMatch = metaLine.match(/(?:Final grade|Score):\s*([^|]+)/i);
      const locMatch = metaLine.match(/(?:Location|Address|City):\s*([^|]+)/i);
      const webMatch = metaLine.match(/Website:\s*([^|]+)/i);
      const otherParts = metaLine
        .split("|")
        .map((p) => p.trim())
        .filter(
          (p) =>
            p &&
            !/^(?:location|address|city|website|final\s*grade|score)\s*:\s*/i.test(p)
        );
      const { startDate, endDate } = datesMatch
        ? parseDateRange(datesMatch[1])
        : { startDate: "", endDate: "" };
      return {
        id: `edu-${idx}`,
        qualification: qual,
        institution: instName,
        startDate,
        endDate,
        finalGrade: gradeMatch ? gradeMatch[1].trim() : undefined,
        address: locMatch ? locMatch[1].trim() : undefined,
        website: webMatch ? webMatch[1].trim() : undefined,
        description: otherParts.length > 0 ? otherParts.join(" | ") : undefined,
      };
    });
  } else if (eduSec && !eduSec.content.trim()) {
    updatedCv.education = [];
  } else if (!eduSec) {
    updatedCv.education = [];
    if (updatedCv.sectionOrder) {
      updatedCv.sectionOrder = updatedCv.sectionOrder.filter((id) => id !== "education");
    }
  }

  // 4. English Language Certificate
  const engSec = findSectionById(sections, "englishCertificate");
  if (engSec && engSec.content.trim()) {
    const content = engSec.content;
    const bandMatch = content.match(/(?:Overall Band Score|Overall|Band|Score)\s*[-:]\s*([0-9.]+)/i);
    const listeningMatch = content.match(/Listening\s*[-:]\s*([0-9.]+)/i);
    const readingMatch = content.match(/Reading\s*[-:]\s*([0-9.]+)/i);
    const writingMatch = content.match(/Writing\s*[-:]\s*([0-9.]+)/i);
    const speakingMatch = content.match(/Speaking\s*[-:]\s*([0-9.]+)/i);
    const trfMatch = content.match(/(?:Test Report Form Number|TRF Number|TRF)\s*[-:]\s*([a-zA-Z0-9]+)/i);
    const dateMatch = content.match(/(?:Issue Date|Date Taken|Test Date|Date)\s*[-:]\s*([^\n]+)/i);

    updatedCv.englishCertificate = {
      examName: "IELTS",
      score: bandMatch ? bandMatch[1].trim() : updatedCv.englishCertificate?.score || "7.5",
      listening: listeningMatch ? listeningMatch[1].trim() : updatedCv.englishCertificate?.listening,
      reading: readingMatch ? readingMatch[1].trim() : updatedCv.englishCertificate?.reading,
      writing: writingMatch ? writingMatch[1].trim() : updatedCv.englishCertificate?.writing,
      speaking: speakingMatch ? speakingMatch[1].trim() : updatedCv.englishCertificate?.speaking,
      trfNumber: trfMatch ? trfMatch[1].trim() : updatedCv.englishCertificate?.trfNumber,
      dateTaken: dateMatch ? dateMatch[1].trim() : updatedCv.englishCertificate?.dateTaken,
    };
  } else if (engSec && !engSec.content.trim()) {
    updatedCv.englishCertificate = undefined;
  } else if (!engSec) {
    updatedCv.englishCertificate = undefined;
    if (updatedCv.sectionOrder) {
      updatedCv.sectionOrder = updatedCv.sectionOrder.filter((id) => id !== "englishCertificate");
    }
  }

  // 5. Skills
  const skillsSecs = sections.filter((s) => headingToSectionId(s.heading || "") === "skills");
  const skillsSec = skillsSecs.find((s) => s.content && s.content.trim().length > 0) || skillsSecs[0];
  if (skillsSec && skillsSec.content.trim()) {
    const skillList = skillsSec.content
      .split(/\n+|[/•,]+/)
      .map((s) => s.replace(/^[•*\-\s/]+/, "").trim())
      .filter(Boolean);
    updatedCv.skills = skillList.map((name, idx) => ({ id: `skill-${idx}`, name }));
  } else if (skillsSec && !skillsSec.content.trim()) {
    updatedCv.skills = [];
  } else if (!skillsSec) {
    updatedCv.skills = [];
    if (updatedCv.sectionOrder) {
      updatedCv.sectionOrder = updatedCv.sectionOrder.filter((id) => id !== "skills");
    }
  }

  // 6. Certifications
  const certSec = findSectionById(sections, "certifications");
  if (certSec && certSec.content.trim()) {
    const rawChunks = certSec.content.split(/\n\s*\n+/).filter(Boolean);
    const consolidatedEntries: string[] = [];
    for (const chunk of rawChunks) {
      const chunkLines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
      let current = "";
      for (const line of chunkLines) {
        if (/^(?:issued\s*by|provider|platform|year|date|completion\s*date)[:=-]/i.test(line) && current) {
          current += " " + line;
        } else {
          if (current) consolidatedEntries.push(current);
          current = line;
        }
      }
      if (current) consolidatedEntries.push(current);
    }

    updatedCv.certifications = consolidatedEntries.map((line, idx) => {
      // Extract date if present: [ 2023 ] or (2023) or Year: 2024
      const yearLabelMatch = line.match(/(?:year|date|completed|completion\s*date)\s*[:=-]\s*([^\n,]+)/i);
      const bracketMatch = line.match(/\[\s*([^\]]+)\s*\]/) || line.match(/\((20\d\d)\)/);
      const completionDate = yearLabelMatch ? yearLabelMatch[1].trim() : (bracketMatch ? bracketMatch[1].trim() : undefined);
      
      let cleanLine = line;
      if (yearLabelMatch) cleanLine = cleanLine.replace(yearLabelMatch[0], "");
      cleanLine = cleanLine.replace(/\[\s*[^\]]+\s*\]/, "").replace(/\((20\d\d)\)/, "").trim();

      const issuedByMatch = cleanLine.match(/(?:issued\s*by|provider|organization|platform|institution)\s*[:=-]\s*([^\n,]+)/i);
      let provider: string | undefined = issuedByMatch ? issuedByMatch[1].trim() : undefined;
      if (issuedByMatch) cleanLine = cleanLine.replace(issuedByMatch[0], "").trim();

      let name = cleanLine.replace(/^[•\s*-]+/, "").trim();

      if (!provider) {
        const delimiterMatch = cleanLine.match(/\s*(?:–|—|-|\||\bby\b|\bfrom\b)\s*/i);
        if (delimiterMatch && delimiterMatch.index !== undefined) {
          name = cleanLine.slice(0, delimiterMatch.index).trim();
          provider = cleanLine.slice(delimiterMatch.index + delimiterMatch[0].length).trim();
        }
      }

      name = name.replace(/^[•\s*-]+/, "").replace(/^(?:certification|name|certificate)[:=-]\s*/i, "").trim();

      return {
        id: `cert-${idx}`,
        name: name || line,
        provider: provider && provider.toLowerCase() !== "online course provider" ? provider : undefined,
        completionDate,
      };
    });
  } else if (certSec && !certSec.content.trim()) {
    updatedCv.certifications = [];
  } else if (!certSec) {
    updatedCv.certifications = [];
    if (updatedCv.sectionOrder) {
      updatedCv.sectionOrder = updatedCv.sectionOrder.filter((id) => id !== "certifications");
    }
  }

  // 7. Hobbies
  const hobbySec = findSectionById(sections, "hobbies");
  if (hobbySec && hobbySec.content.trim()) {
    const hobbiesList = hobbySec.content
      .split(/[•,\n]+/)
      .map((h) => h.trim())
      .filter(Boolean);
    updatedCv.hobbies = hobbiesList.map((name, idx) => ({ id: `hobby-${idx}`, name }));
  } else if (hobbySec && !hobbySec.content.trim()) {
    updatedCv.hobbies = [];
  } else if (!hobbySec) {
    updatedCv.hobbies = [];
    if (updatedCv.sectionOrder) {
      updatedCv.sectionOrder = updatedCv.sectionOrder.filter((id) => id !== "hobbies");
    }
  }

  // 8. Declaration / Visa Compliance Intent
  const declSec = findSectionById(sections, "declaration");
  if (declSec && declSec.content.trim()) {
    updatedCv.declaration = declSec.content;
  } else if (declSec && !declSec.content.trim()) {
    updatedCv.declaration = "";
  }
  // A missing declaration section never wipes the stored declaration: it is the closing
  // section of every CV and must always remain (it is restored into the studio sections).

  // 9. Language Skills & Mother Tongue
  const langSec = findSectionById(sections, "languages");
  if (langSec && langSec.content.trim()) {
    const raw = langSec.content;
    const mtMatch =
      raw.match(/mother\s*tou?ngue(?:\(s\))?\s*[-:]\s*([^\n]+)/i) ||
      raw.match(/(?:native\s*language|mother\s*language)[-:]\s*([^\n,]+)/i);
    if (mtMatch && mtMatch[1]) {
      updatedCv.motherTongue = mtMatch[1].trim();
    }
    const otherMatch = raw.match(/other\s*language(?:\(s\))?\s*[-:]\s*([^\n]+)/i);
    if (otherMatch && otherMatch[1] && otherMatch[1].trim()) {
      const cleanOther = otherMatch[1].trim();
      // If user typed "remove other language" or "none" or empty, clear languages
      if (/^(?:none|nil|n\/a|remove|no\s+other|empty)$/i.test(cleanOther) || cleanOther.toLowerCase().includes("remove the other")) {
        updatedCv.languages = [];
      } else {
        const otherLangs = parseOtherLanguages(cleanOther);
        if (otherLangs.length > 0) {
          updatedCv.languages = otherLangs.map((parsedLang, idx) => {
            const existing = (baseCv.languages || []).find(
              (l) => l.language?.toLowerCase() === parsedLang.language?.toLowerCase()
            );
            // The section text is the source of truth: a language written without
            // levels (e.g. just "English") must not inherit stale CEFR data.
            return {
              id: existing?.id ?? `lang-${idx}`,
              ...parsedLang,
            };
          });
        } else {
          updatedCv.languages = [];
        }
      }
    } else {
      // If section does NOT contain "Other language(s):", clear languages so previous defaults are removed
      updatedCv.languages = [];
    }
  } else if (langSec && !langSec.content.trim()) {
    updatedCv.motherTongue = "";
    updatedCv.languages = [];
  } else if (!langSec) {
    updatedCv.motherTongue = "";
    updatedCv.languages = [];
    if (updatedCv.sectionOrder) {
      updatedCv.sectionOrder = updatedCv.sectionOrder.filter((id) => id !== "languages");
    }
  }

  // 10. Personal Details & Home Address Sync
  const personalSec = sections.find(
    (s) =>
      s.heading?.toLowerCase().includes("personal") ||
      s.heading?.toLowerCase().includes("contact") ||
      s.heading?.toLowerCase().includes("address")
  );
  if (personalSec && personalSec.content.trim()) {
    const raw = personalSec.content;
    const addrMatch =
      raw.match(/(?:home\s*address|home|address)\s*[-:]\s*([^\n]+)/i) ||
      raw.match(/(?:residing at|living in|location)\s*[-:]?\s*([^\n]+)/i);
    if (addrMatch && addrMatch[1]?.trim()) {
      const sanitized = sanitizeAddressValue(addrMatch[1]);
      if (sanitized) {
        updatedCv.personal = {
          ...updatedCv.personal,
          address: sanitized,
        };
      }
    }
  }

  // 11. Academic Projects
  const projSec = findSectionById(sections, "academicProjects");
  if (projSec && projSec.content.trim()) {
    const entries = projSec.content.split(/\n\n+/).filter(Boolean);
    updatedCv.academicProjects = entries.map((entryStr, idx) => {
      const lines = entryStr.split("\n").map((l) => l.trim()).filter(Boolean);
      return {
        id: `proj-${idx}`,
        title: lines[0] || "Academic Project",
        role: lines[1] || "",
        description: lines.slice(2).join("\n"),
      };
    });
  }

  // 12. Achievements & Awards
  const achSec = findSectionById(sections, "achievements");
  if (achSec && achSec.content.trim()) {
    const entries = achSec.content.split(/[•\n]+/).map((l) => l.trim()).filter(Boolean);
    updatedCv.achievements = entries.map((ach, idx) => ({
      id: `ach-${idx}`,
      title: ach,
    }));
  }

  // 13. Leadership & Responsibilities
  const leaderSec = findSectionById(sections, "leadershipActivities");
  if (leaderSec && leaderSec.content.trim()) {
    const entries = leaderSec.content.split(/\n\n+/).filter(Boolean);
    updatedCv.leadershipActivities = entries.map((entryStr, idx) => {
      const lines = entryStr.split("\n").map((l) => l.trim()).filter(Boolean);
      const activityLine = lines[0] || "Leadership Role";
      const orgLine = lines[1] || "";
      const datesMatch = orgLine.match(/\[\s*([^\]]+)\s*\]/);
      const orgName = orgLine.replace(/\[\s*[^\]]+\s*\]/, "").trim();
      const descLines = lines.slice(2);
      return {
        id: `leader-${idx}`,
        activity: activityLine,
        organisation: orgName || undefined,
        duration: datesMatch ? datesMatch[1].trim() : undefined,
        description: descLines.join("\n") || undefined,
      };
    });
  } else if (leaderSec && !leaderSec.content.trim()) {
    updatedCv.leadershipActivities = [];
  }

  // 14. Academic Interests
  const interestSec = findSectionById(sections, "academicInterests");
  if (interestSec && interestSec.content.trim()) {
    const hasLines = /[\n•]/.test(interestSec.content);
    // A pasted prose paragraph (full sentences) stays whole; only short comma lists are split.
    const trimmedInterest = interestSec.content.trim();
    const isProseParagraph =
      !hasLines && (/[.!?]\s+\S/.test(trimmedInterest) || trimmedInterest.length > 160);
    const rawSplit = isProseParagraph
      ? [trimmedInterest]
      : hasLines
        ? interestSec.content.split(/[\n•]+/)
        : interestSec.content.split(/[,;]+/);
    const entries = rawSplit
      .map((l) => l.trim().replace(/^[•\-*0-9.)\s]+/, "").trim())
      .filter(Boolean);
    updatedCv.academicInterests = entries.map((name, idx) => ({ id: `interest-${idx}`, name }));
  } else if (interestSec && !interestSec.content.trim()) {
    updatedCv.academicInterests = [];
  }

  // 15. Volunteering
  const volSec = findSectionById(sections, "volunteering");
  if (volSec && volSec.content.trim()) {
    const entries = volSec.content.split(/\n\n+/).filter(Boolean);
    updatedCv.volunteering = entries.map((entryStr, idx) => {
      const lines = entryStr.split("\n").map((l) => l.trim()).filter(Boolean);
      const roleLine = lines[0] || "Volunteer";
      const orgLine = lines[1] || "";
      const datesMatch = orgLine.match(/\[\s*([^\]]+)\s*\]/);
      const orgName = orgLine.replace(/\[\s*[^\]]+\s*\]/, "").trim();
      const descLines = lines.slice(2);
      const { startDate, endDate } = datesMatch
        ? parseDateRange(datesMatch[1])
        : { startDate: "", endDate: "" };
      return {
        id: `vol-${idx}`,
        role: roleLine,
        organization: orgName || undefined,
        startDate,
        endDate,
        description: descLines.join("\n") || undefined,
      };
    });
  } else if (volSec && !volSec.content.trim()) {
    updatedCv.volunteering = [];
  }

  // 16. Recommendations
  const recSec = findSectionById(sections, "recommendations");
  if (recSec && recSec.content.trim()) {
    const entries = recSec.content.split(/\n\n+/).filter(Boolean);
    updatedCv.recommendations = entries.map((entryStr, idx) => {
      const lines = entryStr.split("\n").map((l) => l.trim()).filter(Boolean);
      return {
        id: `rec-${idx}`,
        recommenderName: lines[0] || "Recommender",
        recommenderTitle: lines[1] || undefined,
        organization: lines[2] || undefined,
        text: lines.slice(3).join("\n") || undefined,
      };
    });
  } else if (recSec && !recSec.content.trim()) {
    updatedCv.recommendations = [];
  }

  // 16b. Custom (non-standard) sections: any heading that maps to no canonical id
  // becomes a customSections entry so it survives the flat -> structured sync,
  // even while still empty.
  {
    const prevCustom = baseCv.customSections ?? [];
    const customs: NonNullable<DocumentData["customSections"]> = [];
    for (const sec of sections) {
      const heading = (sec.heading || "").trim();
      if (!heading || headingToSectionId(heading) !== null) continue;
      const prev = prevCustom.find((c) => c.title.trim().toLowerCase() === heading.toLowerCase());
      customs.push({
        id: prev?.id ?? customSectionId(heading),
        title: prev?.title ?? heading,
        content: sec.content || "",
      });
    }
    updatedCv.customSections = customs;
  }

  // 17. Map dynamic section order from sections array for Europass template
  const detectedOrder: string[] = [];
  for (const sec of sections) {
    if (sec.heading) {
      const id =
        headingToSectionId(sec.heading) ??
        updatedCv.customSections?.find((c) => c.title.trim().toLowerCase() === sec.heading!.trim().toLowerCase())?.id ??
        null;
      if (id && !detectedOrder.includes(id)) {
        detectedOrder.push(id);
      }
    }
  }

  // Preserve existing sections from baseCv.sectionOrder that weren't in sections,
  // BUT do not re-add sections that were explicitly removed from sections
  const removedSectionIds = new Set<string>();
  if (!aboutSec) { removedSectionIds.add("aboutMe"); removedSectionIds.add("about"); }
  if (!workSec) removedSectionIds.add("internships");
  if (!eduSec) removedSectionIds.add("education");
  if (!engSec) removedSectionIds.add("englishCertificate");
  if (!skillsSec) removedSectionIds.add("skills");
  if (!certSec) removedSectionIds.add("certifications");
  if (!hobbySec) removedSectionIds.add("hobbies");
  if (!langSec) removedSectionIds.add("languages");
  if (!projSec) removedSectionIds.add("academicProjects");
  if (!achSec) removedSectionIds.add("achievements");
  if (!leaderSec) removedSectionIds.add("leadershipActivities");
  if (!interestSec) removedSectionIds.add("academicInterests");
  if (!volSec) removedSectionIds.add("volunteering");
  if (!recSec) removedSectionIds.add("recommendations");

  const existingOrder = baseCv.sectionOrder && baseCv.sectionOrder.length > 0
    ? baseCv.sectionOrder
    : EUROPASS_STUDIO_DEFAULT_ORDER;
  const mergedOrder = [...detectedOrder];
  for (const id of existingOrder) {
    if (!mergedOrder.includes(id) && !removedSectionIds.has(id)) {
      mergedOrder.push(id);
    }
  }
  const filteredOrder = mergedOrder.filter((id) => !removedSectionIds.has(id));
  const nonDecl = filteredOrder.filter((id) => id !== "declaration");
  if (filteredOrder.includes("declaration")) {
    nonDecl.push("declaration");
  }
  updatedCv.sectionOrder = nonDecl;

  // Drop pending (newly created, still empty) sections whose studio section was removed
  if (updatedCv.pendingSections) {
    updatedCv.pendingSections = updatedCv.pendingSections.filter((id) => detectedOrder.includes(id));
  }

  return updatedCv;
}

/**
 * Synchronizes structured DocumentData updates (e.g. from inline Europass canvas editing)
 * back into the flat HydratedSection array used by the studio.
 */
export function syncCvDataToSections(
  cv: DocumentData,
  existingSections: { heading: string; content: string }[]
): { heading: string; content: string }[] {
  const sections = existingSections.map((s) => ({ ...s }));

  // 1. About Me
  const aboutIdx = findSectionIndexById(sections, "aboutMe");
  if (cv.aboutMe !== undefined && aboutIdx >= 0) {
    sections[aboutIdx].content = cv.aboutMe || "";
  }

  // 2. Work Experience / Internships
  const workIdx = findSectionIndexById(sections, "internships");
  if (cv.internships !== undefined && workIdx >= 0) {
    const validInternships = (cv.internships || []).filter(
      (e) => e.role && e.role.length < 100 && (e.company || e.description)
    );
    sections[workIdx].content = validInternships
      .map((exp) => {
        const lines: string[] = [];
        if (exp.role) lines.push(exp.role);
        const compParts: string[] = [];
        if (exp.company) compParts.push(exp.company);
        if (exp.location) compParts.push(`Location: ${exp.location}`);
        const dateStr = exp.startDate || exp.endDate ? `[ ${exp.startDate || ""} – ${exp.endDate || ""} ]` : "";
        if (dateStr) compParts.push(dateStr);
        if (compParts.length > 0) lines.push(compParts.join(" | "));
        if (exp.description) {
          const bullets = parseDescriptionToBullets(exp.description);
          const formatted = bullets.filter(Boolean).map((b) => `• ${stripLeadingMarkers(b)}`).join("\n");
          lines.push(formatted || exp.description);
        }
        return lines.join("\n");
      })
      .join("\n\n");
  }

  // 3. Education
  const eduIdx = findSectionIndexById(sections, "education");
  if (cv.education !== undefined && eduIdx >= 0) {
    const validEdu = sortEducationEntries(
      (cv.education || []).filter((e) => e.qualification || e.institution)
    );
    sections[eduIdx].content = validEdu
      .map((edu) => {
        const lines = [
          edu.qualification || "Degree",
          `${edu.institution || ""} [ ${edu.startDate || ""} – ${edu.endDate || ""} ]`,
        ];
        const meta = [
          edu.address ? `Location: ${edu.address}` : "",
          edu.website ? `Website: ${edu.website}` : "",
          edu.finalGrade ? `Final grade: ${edu.finalGrade}` : "",
        ]
          .filter(Boolean)
          .join(" | ");
        if (meta) lines.push(meta);
        if (edu.description) {
          const extraDesc = edu.description
            .split("|")
            .map((p) => p.trim())
            .filter((p) => {
              if (!p) return false;
              if (edu.address !== undefined && /^(?:address|city|location)\s*:\s*/i.test(p)) return false;
              if (edu.website !== undefined && /^(?:website\s*:|https?:\/\/|www\.)/i.test(p)) return false;
              if (edu.finalGrade !== undefined && /^(?:final\s*grade|score)\s*:\s*/i.test(p)) return false;
              return true;
            })
            .join(" | ");
          if (extraDesc) lines.push(extraDesc);
        }
        return lines.join("\n");
      })
      .join("\n\n");
  }

  // 4. Skills
  let skillsIdx = findSectionIndexById(sections, "skills");
  if (cv.skills && cv.skills.length > 0 && skillsIdx < 0) {
    const declIdx = sections.findIndex((s) => s.heading?.toLowerCase().includes("declaration"));
    const insertPos = declIdx >= 0 ? declIdx : sections.length;
    sections.splice(insertPos, 0, { heading: "DIGITAL SKILLS", content: "" });
    skillsIdx = insertPos;
  }
  if (cv.skills !== undefined && skillsIdx >= 0) {
    sections[skillsIdx].content = (cv.skills || [])
      .map((s) => {
        const clean = (s.name ?? "").replace(/^[•*\-\s/]+/, "").trim();
        return clean ? `• ${clean}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  // 5. Hobbies
  const hobbiesIdx = findSectionIndexById(sections, "hobbies");
  if (cv.hobbies !== undefined && hobbiesIdx >= 0) {
    sections[hobbiesIdx].content = (cv.hobbies || []).map((h) => h.name).filter(Boolean).join(" • ");
  }

  // 6. Certifications
  let certsIdx = findSectionIndexById(sections, "certifications");
  if (cv.certifications && cv.certifications.length > 0 && certsIdx < 0) {
    const declIdx = sections.findIndex((s) => s.heading?.toLowerCase().includes("declaration"));
    const insertPos = declIdx >= 0 ? declIdx : sections.length;
    sections.splice(insertPos, 0, { heading: "CERTIFICATIONS", content: "" });
    certsIdx = insertPos;
  }
  if (cv.certifications !== undefined && certsIdx >= 0) {
    sections[certsIdx].content = (cv.certifications || [])
      .map((c) => {
        const dateStr = c.completionDate ? ` [ ${c.completionDate} ]` : "";
        return c.provider ? `${c.name} – ${c.provider}${dateStr}` : `${c.name}${dateStr}`;
      })
      .join("\n");
  }

  // 7. Languages
  let langIdx = findSectionIndexById(sections, "languages");
  if ((cv.motherTongue || (cv.languages && cv.languages.length > 0)) && langIdx < 0) {
    const declIdx = sections.findIndex((s) => s.heading?.toLowerCase().includes("declaration"));
    const insertPos = declIdx >= 0 ? declIdx : sections.length;
    sections.splice(insertPos, 0, { heading: "LANGUAGE SKILLS", content: "" });
    langIdx = insertPos;
  }
  if ((cv.motherTongue !== undefined || cv.languages !== undefined) && langIdx >= 0) {
    const parts: string[] = [];
    if (cv.motherTongue?.trim()) parts.push(`Mother tongue(s): ${cv.motherTongue.trim()}`);
    const other = (cv.languages || []).filter((l) => l.language?.trim()).map(formatOtherLanguage);
    if (other.length > 0) parts.push(`Other language(s): ${other.join("; ")}`);
    sections[langIdx].content = parts.join("\n");
  }

  // 8. Academic Projects
  let projIdx = findSectionIndexById(sections, "academicProjects");
  if (cv.academicProjects && cv.academicProjects.length > 0 && projIdx < 0) {
    const declIdx = sections.findIndex((s) => s.heading?.toLowerCase().includes("declaration"));
    const insertPos = declIdx >= 0 ? declIdx : sections.length;
    sections.splice(insertPos, 0, { heading: "PROJECTS", content: "" });
    projIdx = insertPos;
  }
  if (cv.academicProjects !== undefined && projIdx >= 0) {
    sections[projIdx].content = (cv.academicProjects || [])
      .map((p) => [p.title, p.description].filter(Boolean).join("\n"))
      .join("\n\n");
  }

  // 9. Academic Interests
  const intIdx = findSectionIndexById(sections, "academicInterests");
  if (cv.academicInterests !== undefined && intIdx >= 0) {
    sections[intIdx].content = (cv.academicInterests || [])
      .map((i) => (i.name ? `• ${i.name.replace(/^[•\-*0-9.)\s]+/, "").trim()}` : ""))
      .filter(Boolean)
      .join("\n");
  }

  // 10. Achievements & Awards
  const achIdx = findSectionIndexById(sections, "achievements");
  if (cv.achievements !== undefined && achIdx >= 0) {
    sections[achIdx].content = (cv.achievements || []).map((a) => a.title).filter(Boolean).join("\n");
  }

  // 11. Leadership & Extracurricular
  const leadIdx = findSectionIndexById(sections, "leadershipActivities");
  if (cv.leadershipActivities !== undefined && leadIdx >= 0) {
    sections[leadIdx].content = (cv.leadershipActivities || [])
      .map((l) => [l.activity, [l.organisation, l.duration ? `[ ${l.duration} ]` : null].filter(Boolean).join(" "), l.description].filter(Boolean).join("\n"))
      .join("\n\n");
  }

  // 12. Volunteering
  const volIdx = findSectionIndexById(sections, "volunteering");
  if (cv.volunteering !== undefined && volIdx >= 0) {
    sections[volIdx].content = (cv.volunteering || [])
      .map((v) => [v.role, [v.organization, v.startDate || v.endDate ? `[ ${v.startDate || ""} – ${v.endDate || ""} ]` : null].filter(Boolean).join(" "), v.description].filter(Boolean).join("\n"))
      .join("\n\n");
  }

  // 13. Recommendations
  const recIdx = findSectionIndexById(sections, "recommendations");
  if (cv.recommendations !== undefined && recIdx >= 0) {
    sections[recIdx].content = (cv.recommendations || [])
      .map((r) => [r.recommenderName, [r.recommenderTitle, r.organization].filter(Boolean).join(", "), r.text ? `"${r.text}"` : null].filter(Boolean).join("\n"))
      .join("\n\n");
  }

  // 14. Custom Sections (e.g. Publications, Projects)
  if (cv.customSections && cv.customSections.length > 0) {
    for (const cs of cv.customSections) {
      const existingIdx = sections.findIndex((s) => s.heading?.toLowerCase() === cs.title.toLowerCase());
      if (existingIdx >= 0) {
        sections[existingIdx].content = cs.content;
      } else {
        const declIdx = sections.findIndex((s) => s.heading?.toLowerCase().includes("declaration"));
        const targetPos = declIdx >= 0 ? declIdx : sections.length;
        sections.splice(targetPos, 0, {
          heading: cs.title.toUpperCase(),
          content: cs.content,
        });
      }
    }
  }

  // 15. Reorder flat studio sections to stay in lockstep with cv.sectionOrder
  if (cv.sectionOrder && cv.sectionOrder.length > 0) {
    const isGenericDefault =
      cv.sectionOrder.length === DEFAULT_MOVABLE_SECTION_ORDER.length &&
      cv.sectionOrder.every((id, idx) => id === DEFAULT_MOVABLE_SECTION_ORDER[idx]);

    const targetOrder = isGenericDefault ? EUROPASS_STUDIO_DEFAULT_ORDER : cv.sectionOrder;
    const orderIndexMap = new Map<string, number>();
    targetOrder.forEach((id, idx) => {
      orderIndexMap.set(id, idx);
      if (id === "aboutMe") orderIndexMap.set("about", idx);
      if (id === "about") orderIndexMap.set("aboutMe", idx);
    });

    const declOrderIdx = orderIndexMap.get("declaration") ?? targetOrder.length;

    return [...sections]
      .map((sec, originalIdx) => {
        const secId = sec.heading ? headingToSectionId(sec.heading) : null;
        const mappedIdx = secId !== null ? orderIndexMap.get(secId) : undefined;
        return {
          sec,
          originalIdx,
          sortIdx: mappedIdx !== undefined ? mappedIdx : declOrderIdx - 0.5,
        };
      })
      .sort((a, b) => {
        if (a.sortIdx !== b.sortIdx) return a.sortIdx - b.sortIdx;
        return a.originalIdx - b.originalIdx;
      })
      .map((item) => item.sec);
  }

  return sections;
}

/**
 * Cleans pasted work-experience text (markdown emphasis, "- " bullets, "Company | Role" headers)
 * into the "Role / Company [dates] / • bullets" layout that syncSectionsToCvData parses.
 */
/** Words that mark a job title, used to tell "Role | Company" from "Company | Role". */
const ROLE_WORD_RE =
  /\b(?:intern|internship|trainee|apprentice|manager|consultant|analyst|developer|engineer|designer|executive|associate|assistant|officer|specialist|coordinator|director|scientist|architect|administrator|fellow|lead)\b/i;

export function normalizeInternshipPaste(raw: string): string {
  // Strip markdown emphasis and turn "- " / "* " / "●" list markers into bullets
  const cleaned = raw
    .replace(/\*\*/g, "")
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*[●◦▪•]\s*/, "• ")
        .replace(/^\s*[-*]\s+/, "• ")
        .replace(/^\s*\*([^*].*?)\*\s*$/, "$1")
        .trimEnd()
    )
    .join("\n");

  // Entries pasted back-to-back (no blank line): a new entry starts at a non-bullet line that
  // follows bullet text and is followed by a date line or a "Role [ dates ]" line. A wrapped
  // bullet continuation ("and consumer engagement.") is followed by neither, so it stays.
  const YEAR_RE = /(?:19|20)\d{2}|present|ongoing|current/i;
  const looksLikeDateLine = (l: string) =>
    l.length < 70 && !l.includes("|") && !/^•/.test(l) && YEAR_RE.test(l);
  const separated: string[] = [];
  for (const block of cleaned.split(/\n\s*\n+/)) {
    const blockLines = block.split("\n");
    let seenBullet = false;
    blockLines.forEach((line, i) => {
      const trimmed = line.trim();
      const next = (blockLines[i + 1] || "").trim();
      const isBullet = /^•/.test(trimmed);
      const startsEntry =
        seenBullet &&
        !isBullet &&
        trimmed.length > 0 &&
        next.length > 0 &&
        (looksLikeDateLine(next) || /\[[^\]]*(?:19|20)\d{2}[^\]]*\]/.test(next));
      if (startsEntry) {
        separated.push("");
        seenBullet = false;
      }
      separated.push(line);
      if (isBullet) seenBullet = true;
    });
    separated.push("");
  }

  // Bullet-only blocks belong to the entry above them
  const merged: string[] = [];
  for (const chunk of separated.join("\n").split(/\n\s*\n+/).map((c) => c.trim()).filter(Boolean)) {
    const isLoneSentence =
      !chunk.includes("\n") && !chunk.includes("|") && !chunk.includes("[") && !/^\d+\./.test(chunk);
    if (/^•/.test(chunk) && merged.length > 0) merged[merged.length - 1] += "\n" + chunk;
    else if (isLoneSentence && merged.length > 0 && merged[merged.length - 1].includes("\n")) {
      // A single blank-line-separated sentence can't be an entry (needs role + company):
      // it is a paragraph of the entry above, so keep it as a bullet.
      merged[merged.length - 1] += "\n• " + chunk;
    } else merged.push(chunk);
  }
  const isDateLine = (l: string) =>
    l.length < 70 && !l.includes("|") && !/^•/.test(l) && /(?:19|20)\d{2}|present|ongoing|current/i.test(l);
  return merged
    .map((chunk) => {
      const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
      const second = lines[1] || "";
      // Layout A: "Company | Role" / "dates" / bullets
      if (lines.length >= 2 && lines[0].includes("|") && !lines[0].includes("[") && isDateLine(second)) {
        const [first, ...restParts] = lines[0].split("|").map((p) => p.trim());
        const rest = restParts.join(" ");
        // "Marketing Intern | NALCO" is Role | Company; "Acme | Developer" is Company | Role.
        const swap = ROLE_WORD_RE.test(first) && !ROLE_WORD_RE.test(rest);
        const company = swap ? rest : first;
        const role = (swap ? first : rest) || "Role";
        return [role, `${company} [ ${second} ]`, ...lines.slice(2)].join("\n");
      }
      // "Company" / "Role [ dates ]" / bullets  →  "Role" / "Company [ dates ]" / bullets
      const secondDates = second.match(/\[\s*[^\]]+\s*\]/);
      if (
        lines.length >= 2 &&
        secondDates &&
        !lines[0].includes("|") &&
        !lines[0].includes("[") &&
        !/^[•\-*]/.test(lines[0]) &&
        !ROLE_WORD_RE.test(lines[0]) &&
        ROLE_WORD_RE.test(second.replace(secondDates[0], ""))
      ) {
        const roleOnly = second.replace(secondDates[0], "").trim();
        return [roleOnly, `${lines[0]} ${secondDates[0]}`, ...lines.slice(2)].join("\n");
      }
      // Layout B: "Company, Location" / "Role | dates" / bullets
      const isCompanyFirst =
        lines.length >= 2 &&
        !/^[•\-*]/.test(lines[0]) &&
        !lines[0].includes("|") &&
        !lines[0].includes("[") &&
        second.includes("|") &&
        !second.includes("[") &&
        /(?:19|20)\d{2}|present|ongoing|current/i.test(second);
      if (!isCompanyFirst) return lines.join("\n");
      const [role, ...dateParts] = second.split("|").map((p) => p.trim());
      const [company, ...loc] = lines[0].split(",").map((p) => p.trim());
      const compLine = [loc.length ? `${company} | ${loc.join(", ")}` : company, `[ ${dateParts.join(" ")} ]`].join(" ");
      return [role, compLine, ...lines.slice(2)].join("\n");
    })
    .join("\n\n");
}
