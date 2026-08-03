import { useState } from "react";
import { emptyRow, missingField, trimRow } from "./task-forms";
import type { RowValues, TaskFormSpec } from "./task-forms";

/**
 * Typing a task in instead of importing one. A single-row task is not worth
 * opening Excel for, so the same columns the template has are offered as fields:
 * fill them, press ADD ROW, and the row joins the list SEND TASK will post.
 */
export default function HwCheckManualRows({
  spec,
  onAdd,
  onError,
}: {
  spec: TaskFormSpec;
  onAdd: (row: RowValues) => void;
  /** Shown in the panel's own status line, where every other message goes. */
  onError: (message: string) => void;
}) {
  const [row, setRow] = useState<RowValues>(() => emptyRow(spec));

  const addRow = () => {
    const missing = missingField(spec, row);
    if (missing) {
      onError(`A kézi sorhoz a ${missing} mező kitöltése kötelező.`);
      return;
    }

    onAdd(trimRow(spec, row));
    setRow(emptyRow(spec));
  };

  return (
    <div className="manual-rows">
      <p className="manual-rows-heading">
        MANUAL ROW <span>egy soros taskot nem kell importálni</span>
      </p>

      <div className="manual-fields">
        {spec.fields.map((field) => (
          <label
            className={`field ${field.isWide ? "field-wide" : ""}`}
            key={field.key}
          >
            <span>
              {field.label}
              {field.isRequired ? " *" : ""}
            </span>
            {field.options ? (
              <select
                name={field.key}
                value={row[field.key] ?? ""}
                onChange={(event) =>
                  setRow((current) => ({ ...current, [field.key]: event.target.value }))
                }
              >
                <option value="">Select</option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                name={field.key}
                maxLength={120}
                placeholder={field.placeholder ?? ""}
                value={row[field.key] ?? ""}
                onChange={(event) =>
                  setRow((current) => ({ ...current, [field.key]: event.target.value }))
                }
              />
            )}
          </label>
        ))}
      </div>

      <button className="add-row-button" type="button" onClick={addRow}>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
        ADD ROW
      </button>
    </div>
  );
}
