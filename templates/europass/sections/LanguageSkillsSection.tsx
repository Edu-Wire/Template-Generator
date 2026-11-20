import { memo, useState } from "react";
import type { LanguageEntry } from "@/types";
import styles from "../europass.module.css";
import { EuropassSectionTitle } from "../EuropassSectionTitle";
import { EditableText } from "@/features/document-generator/components/inline/EditableText";
import { LanguageInlineForm } from "../components/EuropassSectionEditors";

type SkillKey = "listening" | "reading" | "spokenInteraction" | "spokenProduction" | "writing";

/** Column order of the Europass editing table. */
const CEFR_COLUMNS: Array<[SkillKey, string]> = [
  ["listening", "Listening"],
  ["reading", "Reading"],
  ["spokenInteraction", "Spoken interaction"],
  ["spokenProduction", "Spoken production"],
  ["writing", "Writing"],
];

const CEFR_LEVELS: Array<[string, string]> = [
  ["A1", "Basic User"],
  ["A2", "Basic User"],
  ["B1", "Independent user"],
  ["B2", "Independent user"],
  ["C1", "Proficient user"],
  ["C2", "Proficient user"],
];

/** Row order of the downloaded CV. */
const PRINT_ROW_1: Array<[SkillKey, string]> = [
  ["listening", "LISTENING"],
  ["reading", "READING"],
  ["writing", "WRITING"],
];
const PRINT_ROW_2: Array<[SkillKey, string]> = [
  ["spokenProduction", "SPOKEN PRODUCTION"],
  ["spokenInteraction", "SPOKEN INTERACTION"],
];

const LEGEND_TEXT =
  "Levels: A1 and A2: Basic user; B1 and B2: Independent user; C1 and C2: Proficient user";

const levelCode = (raw?: string) => (raw ?? "").trim().slice(0, 2).toUpperCase();
const hasCefr = (l: LanguageEntry) =>
  Boolean(l.listening || l.reading || l.writing || l.spokenProduction || l.spokenInteraction);

interface LanguageSkillsSectionProps {
  motherTongue?: string;
  entries?: LanguageEntry[];
  title?: string;
  isInteractive?: boolean;
  onAdd?: (entry: Omit<LanguageEntry, "id">) => void;
  onUpdateMotherTongue?: (value: string) => void;
  onUpdateEntry?: (id: string, patch: Partial<LanguageEntry>) => void;
  onRemoveEntry?: (id: string) => void;
  onDeleteSection?: () => void;
}

export const LanguageSkillsSection = memo(function LanguageSkillsSection({
  motherTongue,
  entries = [],
  title,
  isInteractive = false,
  onAdd,
  onUpdateMotherTongue,
  onUpdateEntry,
  onDeleteSection,
}: LanguageSkillsSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [showGuidance, setShowGuidance] = useState(true);

  const entryMother = entries?.find(
    (e) =>
      e.level?.toLowerCase().includes("mother") ||
      e.level?.toLowerCase().includes("native")
  );

  const effectiveMotherTongue =
    motherTongue?.trim() || entryMother?.language?.trim() || "";

  const otherLanguages = (entries ?? []).filter(
    (e) =>
      e !== entryMother &&
      Boolean(e.language?.trim()) &&
      !e.level?.toLowerCase().includes("mother") &&
      !e.level?.toLowerCase().includes("native")
  );

  if (!effectiveMotherTongue && otherLanguages.length === 0) return null;

  const showTitle = title === undefined ? true : Boolean(title);
  const cefrLanguages = otherLanguages.filter(hasCefr);
  const plainLanguages = otherLanguages.filter((l) => !hasCefr(l));
  const anyCefr = cefrLanguages.length > 0;

  // ── Editing layout: table with full level labels ───────────────────────────
  const editView = (
    <div data-pdf-ignore="true" data-no-print="true" data-html2canvas-ignore="true">
      <div className={styles.langEditHeading}>Mother tongue(s)</div>
      {effectiveMotherTongue ? (
        <div className={styles.langEditText}>
          {onUpdateMotherTongue ? (
            <EditableText
              value={effectiveMotherTongue}
              onChange={onUpdateMotherTongue}
              isInteractive
              placeholder="e.g. Hindi, English"
            />
          ) : (
            effectiveMotherTongue
          )}
        </div>
      ) : (
        <div className={styles.langEditText}>You have not indicated your mother tongue(s).</div>
      )}

      {isAdding && onAdd && (
        <LanguageInlineForm
          onSave={(data) => {
            onAdd(data);
            setIsAdding(false);
          }}
          onCancel={() => setIsAdding(false)}
        />
      )}

      {otherLanguages.length > 0 && (
        <>
          <div className={styles.langEditHeading}>Other language(s)</div>
          {anyCefr && (
            <table className={styles.langEditTable}>
              <thead>
                <tr>
                  <th></th>
                  {CEFR_COLUMNS.map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cefrLanguages.map((lang, idx) => (
                  <tr key={lang.id || idx}>
                    <td className={styles.langEditLang}>
                      {onUpdateEntry ? (
                        <EditableText
                          value={lang.language ?? ""}
                          onChange={(v) => onUpdateEntry(lang.id, { language: v })}
                          isInteractive
                          placeholder="Language"
                        />
                      ) : (
                        lang.language
                      )}
                    </td>
                    {CEFR_COLUMNS.map(([key]) => {
                      const code = levelCode(lang[key]);
                      return (
                        <td key={key}>
                          {onUpdateEntry ? (
                            <select
                              className={styles.langEditSelect}
                              value={code}
                              onChange={(e) => onUpdateEntry(lang.id, { [key]: e.target.value })}
                            >
                              <option value="">–</option>
                              {CEFR_LEVELS.map(([v, l]) => (
                                <option key={v} value={v}>{`${v} - ${l}`}</option>
                              ))}
                            </select>
                          ) : code ? (
                            <>
                              <strong>{code}</strong> - {CEFR_LEVELS.find(([v]) => v === code)?.[1]}
                            </>
                          ) : (
                            "–"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {plainLanguages.map((lang, idx) => (
            <div key={lang.id || idx} className={styles.langEditText}>
              {onUpdateEntry ? (
                <EditableText
                  value={lang.language ?? ""}
                  onChange={(v) => onUpdateEntry(lang.id, { language: v })}
                  isInteractive
                  placeholder="Language"
                />
              ) : (
                lang.language
              )}
              {lang.level ? ` (${lang.level})` : ""}
            </div>
          ))}
        </>
      )}

      {anyCefr && (
        <>
          <label className={styles.cefrGuidanceToggle}>
            <input
              type="checkbox"
              checked={showGuidance}
              onChange={(e) => setShowGuidance(e.target.checked)}
            />{" "}
            Display language proficiency level guidance in the CV
          </label>
          <div className={styles.langEditLegend}>{LEGEND_TEXT}</div>
        </>
      )}
    </div>
  );

  const skillRow = (lang: LanguageEntry, cols: Array<[SkillKey, string]>) => (
    <div className={styles.langPrintRow}>
      {cols.map(([key, label]) => (
        <span key={key}>
          <span className={styles.langPrintLabel}>{label}</span> {levelCode(lang[key]) || "–"}{" "}
        </span>
      ))}
    </div>
  );

  // ── Print layout: matches the downloaded CV (PDF / DOCX) ───────────────────
  // While editing it is hidden on screen; the PDF capture unhides it
  // (data-pdf-only) and drops the editing view (data-pdf-ignore).
  const printView = (
    <div
      data-pdf-only={isInteractive ? "true" : undefined}
      style={isInteractive ? { display: "none" } : undefined}
    >
      {effectiveMotherTongue && (
        <div className={styles.langPrintMother}>
          <span className={styles.langPrintLabel}>Mother tongue(s):</span> {effectiveMotherTongue}
        </div>
      )}
      {otherLanguages.length > 0 && (
        <>
          <div className={styles.langPrintLabel} style={{ marginTop: "2mm" }}>
            Other language(s):
          </div>
          {otherLanguages.map((lang, idx) => (
            <div key={lang.id || idx} className={styles.langPrintBlock}>
              <div className={styles.langPrintName}>{lang.language}</div>
              {hasCefr(lang) ? (
                <>
                  {skillRow(lang, PRINT_ROW_1)}
                  {skillRow(lang, PRINT_ROW_2)}
                </>
              ) : lang.level ? (
                <div className={styles.langPrintRow}>{lang.level}</div>
              ) : null}
            </div>
          ))}
          {anyCefr && showGuidance && <div className={styles.langPrintLegend}>{LEGEND_TEXT}</div>}
        </>
      )}
    </div>
  );

  return (
    <section className={styles.sectionWrapper}>
      {showTitle && (
        <EuropassSectionTitle
          title={title || "LANGUAGE SKILLS"}
          isInteractive={isInteractive}
          addLabel="Add Language entry"
          onAddEntry={isInteractive && onAdd ? () => setIsAdding(true) : undefined}
          onDeleteSection={onDeleteSection}
        />
      )}
      {isInteractive && editView}
      {printView}
    </section>
  );
});
