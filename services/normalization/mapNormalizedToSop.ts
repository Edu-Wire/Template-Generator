/**
 * services/normalization/mapNormalizedToSop.ts
 *
 * SOP Projection:
 * Converts a NormalizedStudentProfile into StudentDocumentContext
 * for the SOP & Visa Cover Letter Generator.
 *
 * SAFETY RULES:
 * 1. Populates all verified facts that genuinely exist in CRM.
 * 2. Does NOT fabricate fake sponsor incomes, bank balances, or flight PNRs.
 * 3. Unavailable visa-specific fields safely default to empty string ("").
 */

import type { StudentDocumentContext } from "@/features/sop-generator/types/sop-generator";
import type { NormalizedStudentProfile } from "@/types/normalizedStudent";
import {
  classifyTargetLevel,
  deriveSubjectsText,
  displayQualificationTitle,
  selectRelevantQualification,
} from "./selectRelevantQualification";
import { lookupUniversityCity } from "./universityCity";
import { formatIntakeMonths, formatIntakePhrase, formatProgramDuration } from "./programTiming";

export function mapNormalizedToSop(profile: NormalizedStudentProfile): StudentDocumentContext {
  const p = profile.personal;
  const a = profile.academics;
  const activeProg = profile.applications.activeProgram;
  const eng = profile.tests.english;
  const fam = profile.family;
  const fin = profile.finance as
    | (NonNullable<NormalizedStudentProfile["finance"]> & {
        availableBalance?: string;
        totalFundsAvailable?: string;
        disbursedAmount?: string;
        bankAccount?: string;
        statementDate?: string;
        availableBalanceEur?: string;
      })
    | undefined;
  const visa = profile.visaLogistics;

  // Ground the academic facts in the record that matches the program's level:
  // Bachelor's -> 12th details, Master's -> bachelor's details.
  const targetLevel = classifyTargetLevel(activeProg?.degreeLevel);
  const relevantQual = selectRelevantQualification(
    a.qualifications,
    activeProg?.degreeLevel
  )?.qualification;

  // Determine primary sponsor from family if available
  const sponsorName = fam?.father?.name || fam?.mother?.name || "";
  const sponsorRel = fam?.father?.name ? "Father" : fam?.mother?.name ? "Mother" : "";

  return {
    student: {
      fullName: p.fullName || "",
      dateOfBirth: p.dateOfBirth || "",
      placeOfBirth: p.placeOfBirth || "",
      city: p.city || "",
      country: p.country || "",
      nationality: p.nationality || "",
      passportNumber: p.passportNumber || "",
      phone: p.phone || "",
      email: p.email || "",
      address: p.address || "",
      gender: p.gender || "",
      languages: "", // Not present in CRM; not fabricated
    },

    academics: {
      latestQualification: displayQualificationTitle(relevantQual) || a.latest?.qualification || "",
      institution: relevantQual?.institution || a.latest?.institution || "",
      board: relevantQual?.boardOrUniversity || a.latest?.board || "",
      completionYear: relevantQual?.completionYear || a.latest?.completionYear || "",
      subjects: deriveSubjectsText(relevantQual) || a.latest?.subjects || "",
      percentage: relevantQual?.score || a.latest?.score || "",
      // For master's/postgraduate targets the selected record IS the bachelor's degree.
      previousDegree: targetLevel === "MASTERS" || targetLevel === "DOCTORATE"
        ? displayQualificationTitle(relevantQual)
        : "",
    },

    tests: {
      ielts: {
        overall: eng?.overallScore || "",
        listening: eng?.subscores?.listening || "",
        reading: eng?.subscores?.reading || "",
        writing: eng?.subscores?.writing || "",
        speaking: eng?.subscores?.speaking || "",
        dateTaken: eng?.testDate || "",
      },
    },

    destination: {
      country: activeProg?.country || "",
      // CRM program records have no city: known universities are looked up, others stay "".
      city: lookupUniversityCity(activeProg?.university),
      university: activeProg?.university || "",
      course: activeProg?.course || "",
      degreeLevel: activeProg?.degreeLevel || "",
      // From the program record when the CRM states them; never invented. The CRM gives no
      // intake year, so it stays empty.
      duration: formatProgramDuration(activeProg?.durationYears, activeProg?.durationMonths),
      intakeMonth: formatIntakeMonths(activeProg?.intakes),
      intakeYear: "",
      intakeText: formatIntakePhrase(activeProg?.intakes),
      consulate: visa?.consulate?.name || "",
      consulateCity: visa?.consulate?.city || "",
      consulateAddress: visa?.consulate?.address || "",
    },

    career: {
      shortTermGoal: "", // Narrative goal; not fabricated
      longTermGoal: "",
      returnIntention: "",
    },

    sponsor: {
      name: sponsorName,
      relationship: sponsorRel,
      occupation: fam?.father?.occupation || fam?.mother?.occupation || "",
      annualIncome: "", // Financial balance not fabricated
      incomeSource: "",
    },

    finance: {
      educationLoanAmount: fin?.loanAmountSanctioned || "",
      loanProvider: fin?.bankName || "",
      bankName: fin?.bankName || "",
      accountHolderName: sponsorName || p.fullName || "",
      availableBalance: fin?.availableBalance || "",
      totalFundsAvailable: fin?.totalFundsAvailable || "",
      currency: fin?.currency || "",
      disbursedAmount: fin?.disbursedAmount || "",
      bankAccount: fin?.bankAccount || "",
      statementDate: fin?.statementDate || "",
      availableBalanceEur: fin?.availableBalanceEur || "",
    },

    accommodation: {
      name: visa?.accommodation?.name || "",
      type: visa?.accommodation?.type || "",
      address: visa?.accommodation?.address || "",
      city: visa?.accommodation?.city || "",
      country: visa?.accommodation?.country || "",
      fromDate: visa?.accommodation?.fromDate || "",
      toDate: visa?.accommodation?.toDate || "",
      bookingReference: visa?.accommodation?.bookingReference || "",
    },

    insurance: {
      provider: visa?.insurance?.provider || "",
      policyNumber: visa?.insurance?.policyNumber || "",
      type: "",
      fromDate: visa?.insurance?.fromDate || "",
      toDate: visa?.insurance?.toDate || "",
      coverageAmount: visa?.insurance?.coverageAmount || "",
    },

    travel: {
      airline: visa?.travel?.airline || "",
      flightNumber: visa?.travel?.flightNumber || "",
      origin: visa?.travel?.origin || "",
      destination: visa?.travel?.destination || "",
      travelDate: visa?.travel?.travelDate || "",
      pnr: visa?.travel?.pnr || "",
      returnDate: visa?.travel?.returnDate || "",
    },
  };
}
