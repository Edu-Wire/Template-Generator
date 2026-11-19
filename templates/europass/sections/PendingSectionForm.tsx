import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

/**
 * Window event the CV canvas fires to ask the Studio to open the paste-style
 * section editor. `mode: "add"` appends a new entry, `mode: "edit"` edits the
 * whole section text.
 */
export const SECTION_EDITOR_OPEN_EVENT = "cv-section-editor-open";

export interface SectionEditorOpenDetail {
  sectionId: string;
  mode: "add" | "edit";
}

export function requestSectionEditor(detail: SectionEditorOpenDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SectionEditorOpenDetail>(SECTION_EDITOR_OPEN_EVENT, { detail }));
}

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  border: "1px solid #b8c0cc",
  borderRadius: 6,
  fontSize: 14,
  fontFamily: "inherit",
  color: "#111827",
  background: "#fff",
};

interface SectionEditorFormProps {
  heading: string;
  mode: "add" | "edit";
  initialTitle: string;
  initialContent: string;
  /** Show the "above / below existing entries" choice (add mode on a section that already has content). */
  showPosition?: boolean;
  onSave: (title: string, content: string, position: "above" | "below") => void;
  onClose: () => void;
}

/** Simple "title + paste your content" editor used to add to, or edit, a CV section. */
export function SectionEditorForm({
  heading,
  mode,
  initialTitle,
  initialContent,
  showPosition = false,
  onSave,
  onClose,
}: SectionEditorFormProps) {
  const [position, setPosition] = useState<"above" | "below">("below");
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const canSave = title.trim().length > 0 && content.trim().length > 0;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${mode === "edit" ? "Edit" : "Add to"} ${heading}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSave(title.trim(), content.trim(), position);
        }}
        style={{
          width: "100%",
          maxWidth: 680,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#fff",
          borderRadius: 10,
          padding: 24,
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ paddingBottom: 12, borderBottom: "1px solid #1f2937", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>
          {heading}
        </div>
        <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13, color: "#334155" }}>
            <span>
              Title <span style={{ color: "#dc2626" }}>*</span>
            </span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13, color: "#334155" }}>
            <span>
              {mode === "add" ? "New entry" : "Content"} <span style={{ color: "#dc2626" }}>*</span>
            </span>
            <textarea
              autoFocus
              rows={12}
              value={content}
              placeholder={
                mode === "add"
                  ? "Paste or type the new entry here. It is added below the existing content."
                  : "Paste or type the details for this section here..."
              }
              onChange={(e) => setContent(e.target.value)}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
            />
          </label>
          {showPosition && (
            <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", gap: 20, fontSize: 13, color: "#334155" }}>
              <legend style={{ padding: 0, marginBottom: 6 }}>Where should this entry go?</legend>
              {(["above", "below"] as const).map((pos) => (
                <label key={pos} style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="entry-position"
                    checked={position === pos}
                    onChange={() => setPosition(pos)}
                  />
                  {pos === "above" ? "Above existing entries" : "Below existing entries"}
                </label>
              ))}
            </fieldset>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "8px 18px", border: "1px solid #b8c0cc", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14 }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            style={{
              padding: "8px 22px",
              border: "none",
              borderRadius: 6,
              background: canSave ? "#1d4ed8" : "#93a8e0",
              color: "#fff",
              cursor: canSave ? "pointer" : "not-allowed",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Save
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
