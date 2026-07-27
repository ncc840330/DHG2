import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import {
  downloadTemplate,
  parseTaskFile,
  TEMPLATE_HEADERS,
  WAREHOUSE_CODE,
} from "./excel";
import type { ImportLine, TaskRow } from "./excel";
import HwCheckTaskPhotos from "./HwCheckTaskPhotos";
import { TASK_TYPE_OPTIONS, taskTypeLabel } from "./hw-check";
import type { HwCheckTask } from "./hw-check";
import {
  getErrorMessage,
  loadJson,
  readApiError,
  RecordCount,
  TabProps,
  toCountMap,
} from "./lib";

/**
 * A HW check task is imported, not typed: TASKS is the day's work with how far
 * each task has got, UPLOAD TASK is where a spreadsheet becomes the next task.
 */
type HwView = "tasks" | "upload";

type ImportedFile = {
  name: string;
  /** The rows as the file listed them, which is what the server is sent. */
  rows: TaskRow[];
  /** Those rows split per qty, which is what the operator will photograph. */
  lines: ImportLine[];
  skippedRows: number;
};

const PREVIEW_ROWS = 5;

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
  const [imported, setImported] = useState<ImportedFile | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<HwCheckTask | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const statusRef = useRef<HTMLParagraphElement>(null);

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

  const resetCreateForm = useCallback(() => {
    setIsCreating(false);
    setTaskType("");
    setImported(null);
  }, []);

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
      const result = await parseTaskFile(file);
      if ("error" in result) {
        setImported(null);
        setError(result.error);
        return;
      }

      setImported({
        name: file.name,
        rows: result.rows,
        lines: result.lines,
        skippedRows: result.skippedRows,
      });
      setMessage(
        `${file.name}: ${result.rows.length} sor beolvasva${
          result.lines.length !== result.rows.length
            ? `, a qty miatt ${result.lines.length} fotósor`
            : ""
        }. Ellenőrizd, majd SEND TASK.`,
      );
    } catch (parseError) {
      setImported(null);
      setError(getErrorMessage(parseError, "A fájl beolvasása sikertelen."));
    } finally {
      setIsParsing(false);
    }
  };

  const sendTask = async () => {
    if (isSending) return;

    if (!taskType) {
      setMessage("");
      setError("Válaszd ki a task típusát.");
      return;
    }
    if (!imported) {
      setMessage("");
      setError("Előbb töltsd fel az excel fájlt az IMPORT EXCEL gombbal.");
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
          fileName: imported.name,
          rows: imported.rows,
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
        `${data.task.taskCode} létrehozva, ${data.task.lineCount} sorral. Nyisd meg a TASKS alatt a képek feltöltéséhez.`,
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
      setMessage(`${task.taskCode} törölve, a képeivel együtt.`);
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
                A task egy feltöltött fájl. Nyomd meg a CREATE TASK gombot, válaszd
                ki a típusát, majd importáld hozzá az excelt.
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
                    setImported(null);
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

              {taskType === "photo-upload" && (
                <>
                  <div className="import-row">
                    <button
                      className="template-button"
                      type="button"
                      onClick={downloadTemplate}
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
                    Oszlopok: {TEMPLATE_HEADERS.join(" · ")}. A Warehouse Code
                    üresen hagyva {WAREHOUSE_CODE} lesz, és 1-nél nagyobb Qty
                    esetén minden darab külön sort kap, külön képekkel. Nem tudod
                    a formátumot? A TEMPLATE gombbal letöltöd.
                  </p>

                  {imported && (
                    <div className="import-preview">
                      <div className="import-summary">
                        <div>
                          <span>FILE</span>
                          <strong>{imported.name}</strong>
                        </div>
                        <div>
                          <span>ROWS</span>
                          <strong>{imported.rows.length}</strong>
                        </div>
                        <div>
                          <span>PHOTO LINES</span>
                          <strong>{imported.lines.length}</strong>
                        </div>
                        <div>
                          <span>LOCATORS</span>
                          <strong>
                            {
                              new Set(imported.rows.map((row) => row.locator))
                                .size
                            }
                          </strong>
                        </div>
                        <div>
                          <span>PHOTOS NEEDED</span>
                          <strong>{imported.lines.length * 2}</strong>
                        </div>
                      </div>

                      <table className="import-table">
                        <thead>
                          <tr>
                            {TEMPLATE_HEADERS.map((header) => (
                              <th key={header}>{header}</th>
                            ))}
                            <th>Piece</th>
                          </tr>
                        </thead>
                        <tbody>
                          {imported.lines.slice(0, PREVIEW_ROWS).map((line, index) => (
                            <tr key={index}>
                              <td>{line.item}</td>
                              <td>{line.sn}</td>
                              <td>{line.qty}</td>
                              <td>{line.warehouseCode}</td>
                              <td>{line.subinvCode}</td>
                              <td>{line.locator}</td>
                              <td>
                                {line.unitCount > 1
                                  ? `${line.unitIndex}/${line.unitCount}`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {imported.lines.length > PREVIEW_ROWS && (
                        <p className="import-hint">
                          …és további {imported.lines.length - PREVIEW_ROWS} sor.
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
                  disabled={isSending || !taskType || !imported}
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
                Switch to UPLOAD TASK, press CREATE TASK and import the photo
                upload file for this work date.
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
                      {task.photoCount} PHOTOS
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
          message={`${pendingDelete.taskCode} is removed for good, with all ${pendingDelete.photoCount} uploaded photos.`}
          busyLabel="DELETING…"
          isBusy={isDeleting}
          onConfirm={() => void deleteTask()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
