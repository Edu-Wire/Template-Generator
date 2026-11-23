/**
 * features/document-generator/components/ResumeImportSectionEditors.tsx
 *
 * Small field-driven editors used by the import review's Direct Editor, so every extracted value
 * (dates, addresses, links, grades, descriptions, …) is visible and editable before it is applied.
 */

"use client";

import React from "react";
import type { DocumentData } from "@/types";
import { generateId } from "@/lib/generateId";

export interface FieldDef {
  key: string;
  label: string;
  multiline?: boolean;
  /** Spans the full row instead of half. */
  wide?: boolean;
}

const inputClass = "w-full border border-slate-300 rounded px-2 py-1 bg-white focus:border-[#096491]";

function Field({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className={`block ${def.wide || def.multiline ? "col-span-2" : ""}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 block mb-0.5">{def.label}</span>
      {def.multiline ? (
        <textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} resize-y`} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      )}
    </label>
  );
}

/** One object (personal details, English certificate) shown as a grid of fields. */
export function FieldGrid({
  fields,
  value,
  onChange,
}: {
  fields: FieldDef[];
  value: Record<string, unknown> | undefined;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const current = value ?? {};
  return (
    <div className="grid grid-cols-2 gap-2">
      {fields.map((f) => (
        <Field
          key={f.key}
          def={f}
          value={String(current[f.key] ?? "")}
          onChange={(v) => onChange({ ...current, [f.key]: v })}
        />
      ))}
    </div>
  );
}

/** A repeatable list of entries, each with the given fields. */
export function EntryListEditor({
  title,
  itemLabel,
  fields,
  items,
  onChange,
}: {
  title: string;
  itemLabel: string;
  fields: FieldDef[];
  items: Array<{ id: string } & Record<string, unknown>>;
  onChange: (next: Array<{ id: string } & Record<string, unknown>>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-slate-900">{title}</h4>
        <button
          type="button"
          onClick={() => onChange([...items, { id: generateId() }])}
          className="text-[#096491] hover:underline cursor-pointer"
        >
          + Add Entry
        </button>
      </div>
      {items.length === 0 && <p className="text-slate-400 italic text-center py-4">Nothing detected.</p>}
      {items.map((item, idx) => (
        <div key={item.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">
              {itemLabel} #{idx + 1}
            </span>
            <button
              type="button"
              onClick={() => onChange(items.filter((e) => e.id !== item.id))}
              className="text-rose-500 hover:text-rose-700 cursor-pointer"
            >
              ✕ Remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {fields.map((f) => (
              <Field
                key={f.key}
                def={f}
                value={String(item[f.key] ?? "")}
                onChange={(v) => onChange(items.map((e) => (e.id === item.id ? { ...e, [f.key]: v } : e)))}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export const PERSONAL_EXTRA_FIELDS: FieldDef[] = [
  { key: "nationality", label: "Nationality" },
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "placeOfBirth", label: "Place of birth" },
  { key: "gender", label: "Gender" },
  { key: "passportNumber", label: "Passport number" },
  { key: "drivingLicence", label: "Driving licence" },
  { key: "address", label: "Home address", wide: true },
  { key: "linkedinUrl", label: "LinkedIn", wide: true },
  { key: "portfolioUrl", label: "Portfolio / website", wide: true },
  { key: "githubUrl", label: "GitHub", wide: true },
];

export const ENGLISH_FIELDS: FieldDef[] = [
  { key: "examName", label: "Exam" },
  { key: "score", label: "Overall score" },
  { key: "dateTaken", label: "Date taken" },
  { key: "cefrLevel", label: "CEFR level" },
  { key: "listening", label: "Listening" },
  { key: "reading", label: "Reading" },
  { key: "writing", label: "Writing" },
  { key: "speaking", label: "Speaking" },
  { key: "trfNumber", label: "TRF number" },
];

/** List sections the Direct Editor can show, with the fields of each entry. */
export interface ListSectionDef {
  key: "education" | "internships" | "academicProjects" | "certifications" | "achievements" | "leadershipActivities" | "volunteering";
  label: string;
  itemLabel: string;
  /** Always listed in the sidebar, even when empty (so entries can be added). */
  alwaysShow?: boolean;
  fields: FieldDef[];
}

export const LIST_SECTION_DEFS: ListSectionDef[] = [
  {
    key: "education",
    label: "Education",
    itemLabel: "Entry",
    alwaysShow: true,
    fields: [
      { key: "qualification", label: "Degree / Qualification", wide: true },
      { key: "institution", label: "Institution / School", wide: true },
      { key: "startDate", label: "Start date" },
      { key: "endDate", label: "End date" },
      { key: "fieldOfStudy", label: "Field of study" },
      { key: "finalGrade", label: "Final grade" },
      { key: "address", label: "Address", wide: true },
      { key: "website", label: "Website", wide: true },
      { key: "description", label: "Other details", multiline: true },
    ],
  },
  {
    key: "internships",
    label: "Internships",
    itemLabel: "Experience",
    alwaysShow: true,
    fields: [
      { key: "role", label: "Job title / Role" },
      { key: "company", label: "Company / Employer" },
      { key: "location", label: "Location" },
      { key: "startDate", label: "Start date" },
      { key: "endDate", label: "End date" },
      { key: "description", label: "Description", multiline: true },
    ],
  },
  {
    key: "academicProjects",
    label: "Projects",
    itemLabel: "Project",
    fields: [
      { key: "title", label: "Title", wide: true },
      { key: "role", label: "Role" },
      { key: "dateYear", label: "Date / year" },
      { key: "skills", label: "Skills / technologies", wide: true },
      { key: "link", label: "Link", wide: true },
      { key: "description", label: "Description", multiline: true },
    ],
  },
  {
    key: "certifications",
    label: "Certifications",
    itemLabel: "Certificate",
    fields: [
      { key: "name", label: "Name", wide: true },
      { key: "provider", label: "Provider" },
      { key: "completionDate", label: "Completed" },
      { key: "credentialLink", label: "Credential link", wide: true },
      { key: "description", label: "Description", multiline: true },
    ],
  },
  {
    key: "achievements",
    label: "Achievements",
    itemLabel: "Achievement",
    fields: [
      { key: "title", label: "Title", wide: true },
      { key: "organisation", label: "Awarded by" },
      { key: "dateYear", label: "Date / year" },
      { key: "description", label: "Description", multiline: true },
    ],
  },
  {
    key: "leadershipActivities",
    label: "Leadership",
    itemLabel: "Activity",
    fields: [
      { key: "activity", label: "Role / activity", wide: true },
      { key: "organisation", label: "Organisation" },
      { key: "duration", label: "Duration" },
      { key: "impact", label: "Impact", wide: true },
      { key: "description", label: "Description", multiline: true },
    ],
  },
  {
    key: "volunteering",
    label: "Volunteering",
    itemLabel: "Entry",
    fields: [
      { key: "organization", label: "Organisation" },
      { key: "role", label: "Role" },
      { key: "startDate", label: "Start date" },
      { key: "endDate", label: "End date" },
      { key: "description", label: "Description", multiline: true },
    ],
  },
];

/** Count of entries extracted for a list section. */
export function listSectionCount(data: DocumentData, key: ListSectionDef["key"]): number {
  return ((data[key] as unknown[] | undefined) ?? []).length;
}

/** True when the English certificate holds at least one value. */
export function hasEnglishCertificate(data: DocumentData): boolean {
  return Object.values(data.englishCertificate ?? {}).some((v) => String(v ?? "").trim() !== "");
}
