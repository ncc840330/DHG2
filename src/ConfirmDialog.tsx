import { useEffect, useRef } from "react";

/**
 * Deleting a line is a two-step action everywhere in the app: the trash icon
 * only opens this dialog, the OK button is what actually removes the record.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "OK",
  busyLabel = "WORKING…",
  isBusy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  busyLabel?: string;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="confirm-backdrop"
      role="presentation"
      onClick={() => !isBusy && onCancel()}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-title">{title}</h3>
        <p id="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button
            className="confirm-cancel"
            type="button"
            disabled={isBusy}
            onClick={onCancel}
          >
            CANCEL
          </button>
          <button
            ref={confirmRef}
            className="confirm-ok"
            type="button"
            disabled={isBusy}
            onClick={onConfirm}
          >
            {isBusy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
