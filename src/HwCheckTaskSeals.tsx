import { useCallback, useEffect, useRef, useState } from "react";
import { groupByLocator } from "./excel";
import { SEAL_OPTIONS, taskTypeLabel } from "./hw-check";
import type { TaskDetail, TaskLine } from "./hw-check";
import { downloadSelection, getErrorMessage, loadJson, readApiError } from "./lib";

/**
 * Seal entry for one task, laid out the way photo entry is: the rows grouped by
 * locator, because the checker stands in front of a locator and works through
 * everything filed there, and each row keeps its own unsaved answer so a
 * half-done task still shows what is already in. A finished task prints as the
 * PDF the warehouse signs and files.
 */

type SealAnswer = { sealResult: string; remark: string };

/** Keyed by task line id, holding only the rows that have been touched. */
type PendingMap = Record<number, SealAnswer>;

function savedAnswer(line: TaskLine): SealAnswer {
  return { sealResult: line.sealResult, remark: line.remark };
}

/** What a row says once the unsaved answer is laid over the stored one. */
function answerOf(line: TaskLine, pending: PendingMap) {
  return pending[line.id] ?? savedAnswer(line);
}

function isLineReady(line: TaskLine, pending: PendingMap) {
  const answer = answerOf(line, pending);
  return answer.sealResult === "pass" || answer.sealResult === "fail";
}

function hasPendingChange(line: TaskLine, pending: PendingMap) {
  const change = pending[line.id];
  if (!change) return false;
  const saved = savedAnswer(line);
  return change.sealResult !== saved.sealResult || change.remark !== saved.remark;
}

function CheckMark() {
  return (
    <svg className="ready-check" aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export default function HwCheckTaskSeals({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: number;
  onClose: () => void;
  /** A save happened, so the task list and the day counts are out of date. */
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [pending, setPending] = useState<PendingMap>({});
  const [closedGroups, setClosedGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const didCollapse = useRef(false);

  const loadDetail = useCallback(async () => {
    const data = await loadJson<{ task: TaskDetail }>(
      `/api/hw-check-tasks?id=${taskId}`,
      "A task betöltése sikertelen.",
    );
    setDetail(data.task);
    return data.task;
  }, [taskId]);

  useEffect(() => {
    let isCurrent = true;

    void (async () => {
      try {
        const task = await loadDetail();
        // Locations that are already answered start folded away, so what is left
        // to check is what the operator sees on opening a part-done task.
        if (isCurrent && !didCollapse.current) {
          didCollapse.current = true;
          setClosedGroups(
            groupByLocator(task.lines)
              .filter((group) => group.items.every((line) => isLineReady(line, {})))
              .map((group) => group.locator),
          );
        }
      } catch (loadError) {
        if (isCurrent) {
          setError(getErrorMessage(loadError, "A task betöltése sikertelen."));
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [loadDetail]);

  const answer = (line: TaskLine, change: Partial<SealAnswer>) => {
    setError("");
    setPending((current) => ({
      ...current,
      [line.id]: { ...answerOf(line, current), ...change },
    }));
  };

  const saveAnswers = async () => {
    if (!detail || isSaving) return;

    const changed = detail.lines.filter((line) => hasPendingChange(line, pending));
    if (changed.length === 0) {
      setMessage("");
      setError("Nincs mentendő válasz.");
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/hw-check-task-seals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: detail.id,
          lines: changed.map((line) => ({
            id: line.id,
            ...answerOf(line, pending),
          })),
        }),
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, "A válaszok mentése sikertelen."),
        );
      }

      const data = (await response.json()) as { task: TaskDetail | null };
      setPending({});
      const task = data.task ?? (await loadDetail());
      setDetail(task);
      setMessage(
        `${changed.length} sor mentve. ${task.completedLines}/${task.lineCount} sor kész${
          task.isComplete ? ", a task teljes — letöltheted PDF-ben." : "."
        }`,
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Ismeretlen mentési hiba történt."));
      await loadDetail().catch(() => undefined);
    } finally {
      setIsSaving(false);
      onChanged();
    }
  };

  const downloadPdf = async () => {
    if (!detail) return;

    setIsDownloading(true);
    setError("");
    setMessage("");

    try {
      const fileName = await downloadSelection(
        "/api/hw-check-tasks/pdf",
        [detail.id],
        `${detail.taskCode}.pdf`,
      );
      setMessage(`${fileName} letöltve.`);
    } catch (downloadError) {
      setError(
        getErrorMessage(downloadError, "Ismeretlen letöltési hiba történt."),
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const toggleGroup = (locator: string, isOpen: boolean) => {
    setClosedGroups((current) =>
      isOpen
        ? current.filter((item) => item !== locator)
        : current.includes(locator)
          ? current
          : [...current, locator],
    );
  };

  if (isLoading) {
    return (
      <section className="saved-panel">
        <div className="record-skeleton" aria-label="Loading task">
          <i />
          <i />
          <i />
        </div>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="saved-panel">
        {error && <p className="status-message error-message">{error}</p>}
        <div className="empty-state">
          <h3>Task not found</h3>
          <p>It may have been deleted on another device.</p>
        </div>
        <div className="form-actions">
          <button className="modify-button" type="button" onClick={onClose}>
            BACK TO TASKS
          </button>
        </div>
      </section>
    );
  }

  const groups = groupByLocator(detail.lines);
  const readyLines = detail.lines.filter((line) => isLineReady(line, pending)).length;
  const pendingLines = detail.lines.filter((line) =>
    hasPendingChange(line, pending),
  ).length;
  const isComplete = readyLines === detail.lines.length && detail.lines.length > 0;
  // The PDF is built from what the server has, so unsaved answers hold it back.
  const canDownload = isComplete && pendingLines === 0;

  return (
    <section className="saved-panel task-detail">
      <div className="panel-heading">
        <div>
          <p>{taskTypeLabel(detail.taskType).toUpperCase()}</p>
          <h2>
            {detail.taskCode}
            {canDownload && <CheckMark />}
          </h2>
        </div>
        <span>
          {readyLines}/{detail.lines.length} ROWS READY
        </span>
      </div>

      <div className="task-detail-bar">
        <button className="modify-button" type="button" onClick={onClose}>
          ← TASKS
        </button>
        <span className="task-file-name">{detail.sourceFileName}</span>
        <button
          className="download-button"
          type="button"
          disabled={isDownloading || !canDownload}
          title={
            canDownload
              ? `Download ${detail.taskCode}.pdf`
              : "A PDF akkor tölthető le, ha minden sor mentve és megválaszolva."
          }
          onClick={() => void downloadPdf()}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />
          </svg>
          {isDownloading ? "BUILDING PDF…" : "DOWNLOAD PDF"}
        </button>
      </div>

      {/* Whatever the imported sheet named in H3/I3/J3, shown once here because
          the PDF repeats it on every row. Normally nobody fills these in — the
          printed sheet is signed by hand — so an empty pair is left out. */}
      <div className="seal-signers">
        {(detail.checkedBy || detail.confirmedBy) && (
          <>
            <div>
              <span>CHECKED BY</span>
              <strong>{detail.checkedBy || "—"}</strong>
            </div>
            <div>
              <span>CONFIRMED BY</span>
              <strong>{detail.confirmedBy || "—"}</strong>
            </div>
          </>
        )}
        <div>
          <span>PASS</span>
          <strong>{detail.passCount}</strong>
        </div>
        <div>
          <span>FAIL</span>
          <strong>{detail.failCount}</strong>
        </div>
      </div>

      {message && <p className="status-message success-message">{message}</p>}
      {error && <p className="status-message error-message">{error}</p>}

      <div className="locator-groups">
        {groups.map((group) => {
          const groupReady = group.items.filter((line) =>
            isLineReady(line, pending),
          ).length;
          const isGroupComplete = groupReady === group.items.length;

          return (
            <details
              key={group.locator}
              className={`locator-group ${isGroupComplete ? "is-complete" : ""}`}
              open={!closedGroups.includes(group.locator)}
              onToggle={(event) =>
                toggleGroup(group.locator, event.currentTarget.open)
              }
            >
              <summary>
                <span className="locator-label">LOCATOR</span>
                <strong className="locator-name">{group.locator}</strong>
                <span className="locator-progress">
                  {groupReady}/{group.items.length}
                </span>
                {isGroupComplete && <CheckMark />}
              </summary>

              {group.items.map((line) => {
                const current = answerOf(line, pending);
                const lineReady = isLineReady(line, pending);

                return (
                  <div
                    className={`task-line ${lineReady ? "is-ready" : ""} ${
                      current.sealResult === "fail" ? "is-failed" : ""
                    }`}
                    key={line.id}
                  >
                    <div className="line-cells">
                      <div>
                        <span>FROM SUBINV</span>
                        <strong>{line.subinvCode || "—"}</strong>
                      </div>
                      <div>
                        <span>ITEM</span>
                        <strong>{line.item}</strong>
                      </div>
                      {/* The sheet's Bar Code column: the box's serial number. */}
                      <div>
                        <span>SN</span>
                        <strong>{line.barcode || "—"}</strong>
                      </div>
                    </div>

                    <div className="line-seal">
                      <label className="field">
                        <span>SEAL LABEL INTACT</span>
                        <select
                          name={`sealResult-${line.id}`}
                          value={current.sealResult}
                          onChange={(event) =>
                            answer(line, { sealResult: event.target.value })
                          }
                        >
                          <option value="">Select</option>
                          {SEAL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field field-wide">
                        <span>REMARK</span>
                        <input
                          type="text"
                          name={`remark-${line.id}`}
                          maxLength={400}
                          placeholder="nem kötelező"
                          value={current.remark}
                          onChange={(event) =>
                            answer(line, { remark: event.target.value })
                          }
                        />
                      </label>
                    </div>

                    <p className="line-status">
                      {lineReady ? (
                        <>
                          <CheckMark />{" "}
                          {current.sealResult === "pass" ? "PASS" : "FAIL"}
                        </>
                      ) : (
                        "NOT CHECKED"
                      )}
                    </p>
                  </div>
                );
              })}
            </details>
          );
        })}
      </div>

      <div className="form-actions task-save-bar">
        <span className="pending-count">
          {pendingLines > 0
            ? `${pendingLines} sor mentésre vár`
            : canDownload
              ? "Minden sor ellenőrizve"
              : "Nincs mentendő változás"}
        </span>
        <button
          className="save-button"
          type="button"
          disabled={isSaving || pendingLines === 0}
          onClick={() => void saveAnswers()}
        >
          {isSaving ? "SAVING…" : "SAVE CHECKS"}
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m5 12 4 4L19 6" />
          </svg>
        </button>
      </div>
    </section>
  );
}
