import { memo, useState } from "react";
import type { LanguageEntry } from "@/types";
import styles from "../europass.module.css";
import { EuropassSectionTitle } from "../EuropassSectionTitle";
import { EditableText } from "@/features/document-generator/components/inline/EditableText";
import { LanguageInlineForm } from "../components/EuropassSectionEditors";


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
  onRemoveEntry,
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

  return (
    <section className={styles.sectionWrapper}>
      {showTitle && (
        <EuropassSectionTitle
          title={title || "LANGUAGE SKILLS"}
          isInteractive={isInteractive}
          addLabel="Add Language entry"
          onDeleteSection={onDeleteSection}
        />
      )}

      {/* Mother tongue */}
      {effectiveMotherTongue && (
        <div className={styles.motherTongueRow}>
          <span className={styles.identityLabel} style={{ fontWeight: 400 }}>Mother tongue(s):</span>{" "}
          {isInteractive && onUpdateMotherTongue ? (
            <EditableText
              value={effectiveMotherTongue}
              onChange={onUpdateMotherTongue}
              isInteractive={isInteractive}
              className={styles.motherTongueName}
              placeholder="e.g. Hindi, English"
            />
          ) : (
            <span className={styles.motherTongueName}>{effectiveMotherTongue.toUpperCase()}</span>
          )}
        </div>
      )}

      {/* Inline entry editor for adding new language */}
      {isInteractive && isAdding && onAdd && (
        <LanguageInlineForm
          onSave={(data) => {
            onAdd(data);
            setIsAdding(false);
          }}
          onCancel={() => setIsAdding(false)}
        />
      )}

      {/* Other languages */}
      {otherLanguages.length > 0 && (() => {
        const cefrLanguages = otherLanguages.filter((l) =>
          Boolean(l.listening || l.reading || l.writing || l.spokenProduction || l.spokenInteraction)
        );
        const nonCefrLanguages = otherLanguages.filter(
          (l) => !cefrLanguages.includes(l)
        );

        return (
          <div className={styles.otherLanguagesRow}>
            {nonCefrLanguages.length > 0 && (
              <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px", marginBottom: "2mm" }}>
                <span className={styles.identityLabel}>Other language(s):</span>{" "}
                <span className={styles.identityValue}>
                  {nonCefrLanguages.map((lang, idx) => (
                    <span key={lang.id || idx}>
                      {idx > 0 && <span className={styles.pipeDivider}> | </span>}
                      {isInteractive && onUpdateEntry ? (
                        <EditableText
                          value={lang.language ?? ""}
                          onChange={(v) => onUpdateEntry(lang.id, { language: v })}
                          isInteractive={isInteractive}
                          placeholder="Language"
                        />
                      ) : (
                        lang.language
                      )}
                      {lang.level ? ` (${lang.level})` : ""}
                    </span>
                  ))}
                </span>
              </div>
            )}

            {cefrLanguages.length > 0 && (
              <>
                <div className={styles.otherLangLabel}>Other language(s):</div>
                <table className={styles.cefrTable}>
                  <thead>
                    <tr className={styles.cefrGroupRow}>
                      <th></th>
                      <th colSpan={2}>UNDERSTANDING</th>
                      <th colSpan={2}>SPEAKING</th>
                      <th>WRITING</th>
                    </tr>
                    <tr className={styles.cefrSubRow}>
                      <th></th>
                      <th>Listening</th>
                      <th>Reading</th>
                      <th>Spoken production</th>
                      <th>Spoken interaction</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cefrLanguages.map((lang, idx) => (
                      <tr key={lang.id || idx}>
                        <td className={styles.cefrTableLang}>
                          {isInteractive && onUpdateEntry ? (
                            <EditableText
                              value={lang.language ?? ""}
                              onChange={(v) => onUpdateEntry(lang.id, { language: v })}
                              isInteractive={isInteractive}
                              placeholder="Language (e.g. English)"
                            />
                          ) : (
                            (lang.language ?? "").toUpperCase()
                          )}
                        </td>
                        {(
                          ["listening", "reading", "spokenProduction", "spokenInteraction", "writing"] as const
                        ).map((key) => {
                          const raw = (lang[key] ?? "").trim();
                          const code = raw.slice(0, 2).toUpperCase();
                          return (
                            <td key={key} className={styles.cefrCell}>
                              {isInteractive && onUpdateEntry ? (
                                <EditableText
                                  value={code || raw}
                                  onChange={(v) => onUpdateEntry(lang.id, { [key]: v })}
                                  isInteractive={isInteractive}
                                  placeholder="C1"
                                />
                              ) : (
                                code || "–"
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {showGuidance && (
                  <div className={styles.cefrLegend}>
                    Levels: A1 and A2: Basic user; B1 and B2: Independent user; C1 and C2: Proficient user
                  </div>
                )}
                {isInteractive && (
                  <label
                    className={styles.cefrGuidanceToggle}
                    data-html2canvas-ignore="true"
                    data-pdf-ignore="true"
                    data-no-print="true"
                  >
                    <input
                      type="checkbox"
                      checked={showGuidance}
                      onChange={(e) => setShowGuidance(e.target.checked)}
                    />{" "}
                    Display language proficiency level guidance in the CV
                  </label>
                )}
              </>
            )}
          </div>
        );
      })()}
    </section>
  );
});
