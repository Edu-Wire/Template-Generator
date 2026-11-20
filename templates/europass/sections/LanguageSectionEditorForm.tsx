import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  parseLanguageSectionContent,
  serializeLanguageSectionContent,
  type LanguageRow,
} from "@/features/dashboard/utils/languageSectionContent";

const CEFR = [
  ["A1", "A1 - Basic User"],
  ["A2", "A2 - Basic User"],
  ["B1", "B1 - Independent user"],
  ["B2", "B2 - Independent user"],
  ["C1", "C1 - Proficient user"],
  ["C2", "C2 - Proficient user"],
] as const;

interface Props {
  heading: string;
  mode: "add" | "edit";
  initialTitle: string;
  initialContent: string;
  showPosition?: boolean;
  onSave: (title: string, content: string, position: "above" | "below") => void;
  onClose: () => void;
}

const input: CSSProperties = { width: "100%", padding: "9px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, background: "#fff" };
const label: CSSProperties = { display: "grid", gap: 4, fontSize: 13, color: "#334155" };
const bold: CSSProperties = { fontWeight: 700, fontSize: 14, color: "#0f172a", margin: "10px 0 6px" };
const link: CSSProperties = { background: "none", border: "none", color: "#1d4ed8", fontSize: 13, cursor: "pointer", padding: 0 };
const rule: CSSProperties = { borderTop: "1px solid #cbd5e1", margin: "14px 0" };

const emptyRow = (): LanguageRow => ({ language: "" });

export function LanguageSectionEditorForm({ heading, mode, initialTitle, initialContent, onSave, onClose }: Props) {
  const parsed = parseLanguageSectionContent(mode === "edit" ? initialContent : "");
  const [title, setTitle] = useState(initialTitle);
  const [mothers, setMothers] = useState<string[]>(parsed.motherTongues.length ? parsed.motherTongues : [""]);
  const [others, setOthers] = useState<LanguageRow[]>(parsed.others.length ? parsed.others : [emptyRow()]);

  const content = serializeLanguageSectionContent(mothers, others);
  const canSave = title.trim().length > 0 && content.length > 0;

  const patch = (i: number, p: Partial<LanguageRow>) =>
    setOthers((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  const select = (i: number, key: keyof LanguageRow, text: string) => {
    const cur = ((others[i][key] as string) || "").slice(0, 2).toUpperCase();
    return (
      <label style={label}>
        <span>{text}</span>
        <select style={input} value={cur} onChange={(e) => patch(i, { [key]: e.target.value } as Partial<LanguageRow>)}>
          <option value="">Select level</option>
          {CEFR.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </label>
    );
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSave(title.trim(), content, "below");
        }}
        style={{ width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 10, padding: 24, boxShadow: "0 20px 50px rgba(0,0,0,0.25)", fontFamily: "system-ui, sans-serif" }}
      >
        <div style={{ paddingBottom: 12, borderBottom: "1px solid #1f2937", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>{heading}</div>

        <label style={{ ...label, marginTop: 16 }}>
          <span>Title <span style={{ color: "#dc2626" }}>*</span></span>
          <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        {mothers.map((m, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
              <span style={bold}>Mother tongue</span>
              {mothers.length > 1 && (
                <button type="button" style={link} onClick={() => setMothers((r) => r.filter((_, idx) => idx !== i))}>Delete</button>
              )}
            </div>
            <input
              style={input}
              value={m}
              placeholder="e.g. Hindi"
              onChange={(e) => setMothers((r) => r.map((x, idx) => (idx === i ? e.target.value : x)))}
            />
          </div>
        ))}
        <div style={rule} />
        <button type="button" style={link} onClick={() => setMothers((r) => [...r, ""])}>⊕ Add another mother tongue</button>
        <div style={rule} />

        {others.map((row, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={bold}>Other language</span>
              {others.length > 1 && (
                <button type="button" style={link} onClick={() => setOthers((r) => r.filter((_, idx) => idx !== i))}>Delete</button>
              )}
            </div>
            <input style={input} value={row.language ?? ""} placeholder="e.g. English" onChange={(e) => patch(i, { language: e.target.value })} />
            <div style={bold}>Understanding</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {select(i, "listening", "Listening")}
              {select(i, "reading", "Reading")}
            </div>
            <div style={bold}>Speaking</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {select(i, "spokenInteraction", "Spoken interaction")}
              {select(i, "spokenProduction", "Spoken production")}
            </div>
            <div style={bold}>Writing</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {select(i, "writing", "Writing")}
            </div>
            <div style={rule} />
          </div>
        ))}
        <button type="button" style={link} onClick={() => setOthers((r) => [...r, emptyRow()])}>⊕ Add another language</button>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 18px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", cursor: "pointer" }}>Cancel</button>
          <button type="submit" disabled={!canSave} style={{ padding: "9px 22px", border: "none", borderRadius: 8, background: "#1d4ed8", color: "#fff", fontWeight: 600, cursor: canSave ? "pointer" : "not-allowed", opacity: canSave ? 1 : 0.5 }}>Save</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
