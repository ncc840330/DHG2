import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { downloadTaskTemplate, expandRows, parseImportFile } from "./excel";
import HwCheckManualRows from "./HwCheckManualRows";
import HwCheckTaskPhotos from "./HwCheckTaskPhotos";
import HwCheckTaskSeals from "./HwCheckTaskSeals";
import { TASK_TYPE_OPTIONS, taskTypeLabel } from "./hw-check";
import type { HwCheckTask } from "./hw-check";
import { taskForm } from "./task-forms";
import type { RowValues } from "./task-forms";
import {
  getErrorMessage,
  loadJson,
  readApiError,
  RecordCount,
  TabProps,
  toCountMap,
} from "./lib";

/**
 * A HW check task is imported or typed in: TASKS is the day's work with how far
 * each task has got, UPLOAD TASK is where a spreadsheet — or a hand-typed row —
 * becomes the next task. What the rows have to say is the task type's business,
 * so both the manual fields and the preview table are built from its form spec.
 */
type HwView = "tasks" | "upload";

const PREVIEW_ROWS = 20;

const MANUAL_SOURCE = "Kézi rögzítés";

export default function HwCheckRequestTab({
  isActive,
  selectedDate,
  rangeFrom,
  rangeTo,
  refreshToken,
  onCounts,
  onSynced,
}: TabProps) {
  const [view, setView] = useState<HwView>("tasks");
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<HwCheckTask[]>([]);
  const [nextTaskCodes, setNextTaskCodes] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [taskType, setTaskType] = useState("");
  const [rows, setRows] = useState<RowValues[]>([]);
  // Only the export needs these — nobody fills them in here. They come from the
  // imported sheet's H3/I3/J3 if it has them, and the PDF prints them per row.
  const [header, setHeader] = useState<RowValues>({});
  const [fileName, setFileName] = useState("");
  const [manualCount, setManualCount] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<HwCheckTask | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const statusRef = useRef<HTMLParagraphElement>(null);

  const spec = taskForm(taskType);
  const lines = useMemo(() => expandRows(taskType, rows), [taskType, rows]);

  const loadCounts = useCallback(async () => {
    const data = await loadJson<{ counts: RecordCount[] }>(
      `/api/hw-check-tasks?from=${rangeFrom}&to=${rangeTo}`,
      "A napi HW check taskok betöltése sikertelen.",
    );
    onCounts(toCountMap(data.counts ?? []));
  }, [rangeFrom, rangeTo, onCounts]);

  const loadTasks = useCallback(async (date: string) => {
    const data = await loadJson<{
      tasks?: HwCheckTask[];
      nextTaskCodes?: Record<string, string>;
    }>(
      `/api/hw-check-tasks?date=${date}`,
      "A HW check taskok betöltése sikertelen.",
    );
    setTasks(data.tasks ?? []);
    setNextTaskCodes(data.nextTaskCodes ?? {});
  }, []);

  const refreshData = useCallback(async () => {
    setError("");
    let isFresh = true;
    try {
      await Promise.all([loadCounts(), loadTasks(selectedDate)]);
    } catch (loadError) {
      isFresh = false;
      setError(getErrorMessage(loadError, "Ismeretlen betöltési hiba történt."));
    } finally {
      setIsLoading(false);
      // Reported either way, so a failed refresh cannot leave the SYNC button
      // spinning for the rest of the shift.
      onSynced(isFresh);
    }
  }, [loadCounts, loadTasks, selectedDate, onSynced]);

  useEffect(() => {
    if (!isActive) return;
    void refreshData();
  }, [isActive, refreshData]);

  // SYNC means every worksheet, the hidden ones included: the count on the sheet
  // the operator is not looking at is part of what they pressed the button for.
  const refreshDataRef = useRef(refreshData);
  refreshDataRef.current = refreshData;
  const initialTokenRef = useRef(refreshToken);
  useEffect(() => {
    if (refreshToken === initialTokenRef.current) return;
    void refreshDataRef.current();
  }, [refreshToken]);

  useEffect(() => {
    if (!isActive) return undefined;
    const interval = window.setInterval(refreshData, 120_000);
    return () => window.clearInterval(interval);
  }, [isActive, refreshData]);

  const clearRows = useCallback(() => {
    setRows([]);
    setHeader({});
    setFileName("");
    setManualCount(0);
  }, []);

  const resetCreateForm = useCallback(() => {
    setIsCreating(false);
    setTaskType("");
    clearRows();
  }, [clearRows]);

  useEffect(() => {
    setOpenTaskId(null);
    setPendingDelete(null);
    resetCreateForm();
    setMessage("");
    setError("");
  }, [selectedDate, resetCreateForm]);

  useEffect(() => {
    if (!message && !error) return;
    statusRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [message, error]);

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsParsing(true);
    setMessage("");
    setError("");

    try {
      const result = await parseImportFile(taskType, file);
      if ("error" in result) {
        setError(result.error);
        return;
      }

      // An import speaks for the whole task, so it replaces what was typed in.
      setRows(result.rows);
      setFileName(file.name);
      setManualCount(0);
      setHeader(result.header);
      setMessage(
        `${file.name}: ${result.rows.length} sor beolvasva${
          result.lines.length !== result.rows.length
            ? `, a qty miatt ${result.lines.length} sor`
            : ""
        }. Ellenőrizd, majd SEND TASK.`,
      );
    } catch (parseError) {
      setError(getErrorMessage(parseError, "A fájl beolvasása sikertelen."));
    } finally {
      setIsParsing(false);
    }
  };

  const addManualRow = (row: RowValues) => {
    setRows((current) => [...current, row]);
    setManualCount((current) => current + 1);
    setMessage("Sor hozzáadva. Adj még hozzá, vagy nyomd meg a SEND TASK gombot.");
    setError("");
  };

  const removeRow = (index: number) => {
    setRows((current) => current.filter((_, position) => position !== index));
    setManualCount((current) => Math.max(0, current - 1));
  };

  const sourceName =
    fileName && manualCount > 0
      ? `${fileName} + ${manualCount} kézi sor`
      : fileName || MANUAL_SOURCE;

  const sendTask = async () => {
    if (isSending) return;

    if (!taskType) {
      setMessage("");
      setError("Válaszd ki a task típusát.");
      return;
    }
    if (rows.length === 0) {
      setMessage("");
      setError("Adj hozzá egy kézi sort, vagy importáld az excel fájlt.");
      return;
    }

    setIsSending(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/hw-check-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordDate: selectedDate,
          taskType,
          fileName: sourceName,
          rows,
          checkedBy: header.checkedBy ?? "",
          confirmedBy: header.confirmedBy ?? "",
          signature: header.signature ?? "",
        }),
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "A task létrehozása sikertelen."),
        );
      }
      const data = (await response.json()) as { task: HwCheckTask };

      resetCreateForm();
      setMessage(
        `${data.task.taskCode} létrehozva, ${data.task.lineCount} sorral. Nyisd meg a TASKS alatt.`,
      );
      setView("tasks");
      await Promise.all([loadCounts(), loadTasks(selectedDate)]);
      onSynced();
    } catch (sendError) {
      setError(getErrorMessage(sendError, "Ismeretlen hiba történt."));
    } finally {
      setIsSending(false);
    }
  };

  const deleteTask = async () => {
    const task = pendingDelete;
    if (!task) return;

    setIsDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/hw-check-tasks?id=${task.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("A task törlése sikertelen.");

      setPendingDelete(null);
      if (openTaskId === task.id) setOpenTaskId(null);
      setMessage(`${task.taskCode} törölve.`);
      await Promise.all([loadCounts(), loadTasks(selectedDate)]);
      onSynced();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Ismeretlen törlési hiba történt."));
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const showTasks = () => {
    setOpenTaskId(null);
    setView("tasks");
  };

  const nextCode = nextTaskCodes[taskType];
  const openTask = tasks.find((task) => task.id === openTaskId) ?? null;
  const locatorCount = new Set(rows.map((row) => row.locator ?? "")).size;

  return (
    <>
      <nav className="view-switch" aria-label="HW check request views">
        <button
          className={view === "tasks" ? "is-active" : ""}
          type="button"
          onClick={showTasks}
        >
          TASKS <b>{tasks.length}</b>
        </button>
        <button
          className={view === "upload" ? "is-active" : ""}
          type="button"
          onClick={() => {
            setOpenTaskId(null);
            setView("upload");
          }}
        >
          UPLOAD TASK
        </button>
      </nav>

      {message && (
        <p ref={statusRef} className="status-message success-message">
          {message}
        </p>
      )}
      {error && (
        <p ref={statusRef} className="status-message error-message">
          {error}
        </p>
      )}

      {view === "upload" ? (
        <section className="form-panel">
          <div className="panel-heading">
            <div>
              <p>NEW HW CHECK TASK</p>
              <h2>{nextCode ?? "CREATE TASK"}</h2>
            </div>
            <span>{selectedDate.split("-").join(".")}</span>
          </div>

          {!isCreating ? (
            <div className="create-task-intro">
              <p>
                A task egy feltöltött fájl vagy néhány kézzel felvitt sor. Nyomd meg
                a CREATE TASK gombot, válaszd ki a típusát, majd írd be a sorokat
                vagy importáld az excelt.
              </p>
              <button
                className="create-task-button"
                type="button"
                onClick={() => {
                  setIsCreating(true);
                  setMessage("");
                  setError("");
                }}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                CREATE TASK
              </button>
            </div>
          ) : (
            <div className="create-task-form">
              <label className="field field-wide">
                <span>TASK TYPE</span>
                <select
                  name="taskType"
                  required
                  value={taskType}
                  onChange={(event) => {
                    setTaskType(event.target.value);
                    clearRows();
                    setMessage("");
                    setError("");
                  }}
                >
                  <option value="" disabled>
                    Select a task type
                  </option>
                  {TASK_TYPE_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={!option.isActive}
                    >
                      {option.isActive
                        ? option.label
                        : `${option.label} — coming soon`}
                    </option>
                  ))}
                </select>
              </label>

              {spec && (
                <>
                  <HwCheckManualRows
                    spec={spec}
                    onAdd={addManualRow}
                    onError={(text) => {
                      setMessage("");
                      setError(text);
                    }}
                  />

                  <div className="import-row">
                    <button
                      className="template-button"
                      type="button"
                      onClick={() => downloadTaskTemplate(taskType)}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />
                      </svg>
                      TEMPLATE
                    </button>
                    <label className="import-button">
                      <span>{isParsing ? "READING…" : "IMPORT EXCEL"}</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                        onChange={(event) => void importFile(event)}
                      />
                    </label>
                  </div>

                  <p className="import-hint">
                    Oszlopok: {spec.fields.map((field) => field.label).join(" · ")}.{" "}
                    {spec.hint} Nem tudod a formátumot? A TEMPLATE gombbal letöltöd.
                  </p>

                  {rows.length > 0 && (
                    <div className="import-preview">
                      <div className="import-summary">
                        <div>
                          <span>SOURCE</span>
                          <strong>{sourceName}</strong>
                        </div>
                        <div>
                          <span>ROWS</span>
                          <strong>{rows.length}</strong>
                        </div>
                        <div>
                          <span>LOCATORS</span>
                          <strong>{locatorCount}</strong>
                        </div>
                        {taskType === "photo-upload" ? (
                          <>
                            <div>
                              <span>PHOTO LINES</span>
                              <strong>{lines.length}</strong>
                            </div>
                            <div>
                              <span>PHOTOS NEEDED</span>
                              <strong>{lines.length * 2}</strong>
                            </div>
                          </>
                        ) : (
                          <div>
                            <span>SEAL CHECKS</span>
                            <strong>{lines.length}</strong>
                          </div>
                        )}
                        {/* Only worth a tile if the sheet named someone: it is
                            the one place the export-only signers are visible. */}
                        {header.checkedBy && (
                          <div>
                            <span>CHECKED BY</span>
                            <strong>{header.checkedBy}</strong>
                          </div>
                        )}
                      </div>

                      <table className="import-table">
                        <thead>
                          <tr>
                            {spec.fields.map((field) => (
                              <th key={field.key}>{field.label}</th>
                            ))}
                            <th aria-label="Remove row" />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                            <tr key={index}>
                              {spec.fields.map((field) => (
                                <td key={field.key}>{row[field.key] || "—"}</td>
                              ))}
                              <td>
                                <button
                                  className="row-delete"
                                  type="button"
                                  onClick={() => removeRow(index)}
                                  title="Remove row"
                                  aria-label={`Remove row ${index + 1}`}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {rows.length > PREVIEW_ROWS && (
                        <p className="import-hint">
                          …és további {rows.length - PREVIEW_ROWS} sor.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="form-actions">
                <button
                  className="delete-button"
                  type="button"
                  disabled={isSending}
                  onClick={() => {
                    resetCreateForm();
                    setMessage("");
                    setError("");
                  }}
                >
                  CANCEL
                </button>
                <button
                  className="save-button"
                  type="button"
                  disabled={isSending || !taskType || rows.length === 0}
                  onClick={() => void sendTask()}
                >
                  {isSending ? "SENDING…" : "SEND TASK"}
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </section>
      ) : openTaskId && openTask?.taskType === "yellow-seal" ? (
        <HwCheckTaskSeals
          taskId={openTaskId}
          onClose={showTasks}
          onChanged={() => {
            void loadCounts().catch(() => undefined);
            void loadTasks(selectedDate).catch(() => undefined);
          }}
        />
      ) : openTaskId ? (
        <HwCheckTaskPhotos
          taskId={openTaskId}
          onClose={showTasks}
          onChanged={() => {
            void loadCounts().catch(() => undefined);
            void loadTasks(selectedDate).catch(() => undefined);
          }}
        />
      ) : (
        <section className="saved-panel">
          <div className="panel-heading">
            <div>
              <p>HW CHECK REQUEST TASKS</p>
              <h2>{selectedDate.split("-").join(".")}</h2>
            </div>
            <span>{tasks.length} TASK</span>
          </div>

          {isLoading ? (
            <div className="record-skeleton" aria-label="Loading tasks">
              <i />
              <i />
              <i />
            </div>
          ) : tasks.length === 0 ? (
            <div className="empty-state">
              <svg aria-hidden="true" viewBox="0 0 48 48">
                <path d="M14 8h20v32H14zM19 17h10M19 24h10M19 31h6" />
              </svg>
              <h3>No HW check tasks</h3>
              <p>
                Switch to UPLOAD TASK, press CREATE TASK and either type the rows
                in or import the file for this work date.
              </p>
            </div>
          ) : (
            <div className="task-list">
              {tasks.map((task) => (
                <article
                  className={`task-card ${task.isComplete ? "is-complete" : ""}`}
                  key={task.id}
                >
                  <button
                    className="task-open"
                    type="button"
                    onClick={() => setOpenTaskId(task.id)}
                  >
                    <span className="task-code">
                      {task.taskCode}
                      {task.isComplete && (
                        <svg className="ready-check" aria-hidden="true" viewBox="0 0 24 24">
                          <path d="m5 12 4 4L19 6" />
                        </svg>
                      )}
                    </span>
                    <span className="task-meta">
                      {taskTypeLabel(task.taskType)} · {task.sourceFileName}
                    </span>
                    <span className="task-bar" aria-hidden="true">
                      <i
                        style={{
                          width: `${
                            task.lineCount
                              ? Math.round(
                                  (task.completedLines / task.lineCount) * 100,
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </span>
                    <span className="task-counts">
                      {task.completedLines}/{task.lineCount} ROWS READY ·{" "}
                      {task.taskType === "yellow-seal"
                        ? `${task.passCount} PASS · ${task.failCount} FAIL`
                        : `${task.photoCount} PHOTOS`}
                    </span>
                  </button>

                  <div className="task-actions">
                    <button
                      className="modify-button"
                      type="button"
                      onClick={() => setOpenTaskId(task.id)}
                    >
                      OPEN
                    </button>
                    <button
                      className="row-delete"
                      type="button"
                      onClick={() => setPendingDelete(task)}
                      title={`Delete ${task.taskCode}`}
                      aria-label={`Delete ${task.taskCode}`}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d="M5 8h14M10 8V5.5h4V8m-7 0 .9 11.5h8.2L17 8M10.6 11v5.6m2.8-5.6v5.6" />
                      </svg>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Are you sure you want to delete?"
          message={`${pendingDelete.taskCode} is removed for good, with all ${
            pendingDelete.taskType === "yellow-seal"
              ? `${pendingDelete.lineCount} checked rows`
              : `${pendingDelete.photoCount} uploaded photos`
          }.`}
          busyLabel="DELETING…"
          isBusy={isDeleting}
          onConfirm={() => void deleteTask()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
