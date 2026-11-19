import styles from "./europass.module.css";

export interface EuropassSectionTitleProps {
  title: string;
  isInteractive?: boolean;
  onAddEntry?: () => void;
  addLabel?: string;
  onDeleteSection?: () => void;
  deleteLabel?: string;
}

/**
 * Standard reusable section title component for the Europass template.
 * Matches uppercase blue typography with a 0.75pt gray divider line.
 * When in interactive edit mode, renders minimal '+' and delete controls
 * aligned to the right side of the section heading.
 */
export function EuropassSectionTitle({
  title,
  isInteractive = false,
  onAddEntry,
  addLabel,
  onDeleteSection,
  deleteLabel,
}: EuropassSectionTitleProps) {
  if (!title) return null;
  const showActions = isInteractive && (Boolean(onAddEntry) || Boolean(onDeleteSection));
  return (
    <div className={styles.sectionHeadingRow}>
      <div className={styles.sectionTitleBar}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {showActions && (
          <div
            className={styles.sectionHeaderActions}
            data-html2canvas-ignore="true"
            data-pdf-ignore="true"
            data-no-print="true"
          >
            <button
              type="button"
              data-action="edit-section"
              className={styles.editSectionBtn}
              title={`Edit ${title} section`}
              aria-label={`Edit ${title} section`}
              data-html2canvas-ignore="true"
              data-pdf-ignore="true"
              data-no-print="true"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            {onDeleteSection && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSection();
                }}
                className={styles.deleteSectionBtn}
                title={deleteLabel || `Delete ${title} section`}
                data-html2canvas-ignore="true"
                data-pdf-ignore="true"
                data-no-print="true"
                aria-label={deleteLabel || `Delete ${title} section`}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
      <div className={styles.sectionDivider} />
    </div>
  );
}
