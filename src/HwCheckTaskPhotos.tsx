import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { groupByLocator } from "./excel";
import { PHOTOS_PER_LINE, taskTypeLabel } from "./hw-check";
import type { TaskDetail, TaskLine } from "./hw-check";
import { downloadSelection, getErrorMessage, loadJson, readApiError } from "./lib";
import { preparePhotoUpload } from "./photos";

/**
 * Photo entry for one task. The rows are worked location by location — the
 * operator stands in front of a locator and shoots everything filed there — so
 * that is how they are grouped, and every row keeps its own two-photo state so a
 * half-done task still shows what is already in.
 */

type PendingSlot = { kind: "new"; file: File } | { kind: "removed" };

/** Keyed by line and slot: `12-1` is the first photo of task line 12. */
type PendingMap = Record<string, PendingSlot>;

const SLOTS = [1, 2];

const slotKey = (lineId: number, slot: number) => `${lineId}-${slot}`;

function savedImage(line: TaskLine, slot: number) {
  return line.images.find((image) => image.slot === slot);
}

/** What a slot holds once the unsaved picks are laid over the saved photos. */
function slotState(line: TaskLine, slot: number, pending: PendingMap) {
  const change = pending[slotKey(line.id, slot)];
  if (change?.kind === "new") {
    return { kind: "new" as const, fileName: change.file.name, imageId: null };
  }

  const image = savedImage(line, slot);
  if (change?.kind === "removed" || !image) {
    return { kind: "empty" as const, fileName: "", imageId: null };
  }

  return {
    kind: "saved" as const,
    fileName: image.fileName,
    imageId: image.id,
  };
}

function filledSlots(line: TaskLine, pending: PendingMap) {
  return SLOTS.filter((slot) => slotState(line, slot, pending).kind !== "empty")
    .length;
}

function isLineReady(line: TaskLine, pending: PendingMap) {
  return filledSlots(line, pending) >= PHOTOS_PER_LINE;
}

function hasPendingChange(line: TaskLine, pending: PendingMap) {
  return SLOTS.some((slot) => pending[slotKey(line.id, slot)]);
}

function CheckMark() {
  return (
    <svg className="ready-check" aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export default function HwCheckTaskPhotos({
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
  const [savingProgress, setSavingProgress] = useState("");
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
        // Locations that are already finished start folded away, so what is left
        // to do is what the operator sees on opening a part-done task.
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

  const pickPhoto = async (
    lineId: number,
    slot: number,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const prepared = await preparePhotoUpload(file);
    if (prepared.error) {
      setError(prepared.error);
      return;
    }

    setError("");
    setPending((current) => ({
      ...current,
      [slotKey(lineId, slot)]: { kind: "new", file: prepared.file },
    }));
  };

  const clearPhoto = (line: TaskLine, slot: number) => {
    const key = slotKey(line.id, slot);
    setPending((current) => {
      const next = { ...current };
      // Dropping an unsaved pick just forgets it; dropping a stored photo has to
      // be remembered until SAVE tells the server to let go of it.
      if (next[key]?.kind === "new" && !savedImage(line, slot)) delete next[key];
      else if (next[key]?.kind === "new") next[key] = { kind: "removed" };
      else if (savedImage(line, slot)) next[key] = { kind: "removed" };
      else delete next[key];
      return next;
    });
  };

  const savePhotos = async () => {
    if (!detail || savingProgress) return;

    const changed = detail.lines.filter((line) => hasPendingChange(line, pending));
    if (changed.length === 0) {
      setMessage("");
      setError("Nincs mentendő új kép.");
      return;
    }

    setError("");
    setMessage("");

    let saved = 0;
    try {
      for (const line of changed) {
        setSavingProgress(`${saved + 1}/${changed.length}`);

        const payload = new FormData();
        SLOTS.forEach((slot) => {
          const change = pending[slotKey(line.id, slot)];
          const field = `image${slot}`;
          if (change?.kind === "new") {
            payload.set(`${field}Action`, "replace");
            payload.set(field, change.file, change.file.name);
            return;
          }
          if (change?.kind === "removed") {
            payload.set(`${field}Action`, "empty");
            return;
          }
          payload.set(
            `${field}Action`,
            savedImage(line, slot) ? "keep" : "empty",
          );
        });

        const response = await fetch(
          `/api/hw-check-task-photos?lineId=${line.id}`,
          { method: "POST", body: payload },
        );
        if (!response.ok) {
          throw new Error(
            await readApiError(response, "A képek mentése sikertelen."),
          );
        }

        // Cleared row by row: a save that breaks off halfway keeps the picks the
        // server has not seen yet, so pressing SAVE again finishes the job.
        setPending((current) => {
          const next = { ...current };
          SLOTS.forEach((slot) => delete next[slotKey(line.id, slot)]);
          return next;
        });
        saved += 1;
      }

      const task = await loadDetail();
      setMessage(
        `${saved} sor mentve. ${task.completedLines}/${task.lineCount} sor kész${
          task.isComplete ? ", a task teljes." : "."
        }`,
      );
    } catch (saveError) {
      setError(
        `${getErrorMessage(saveError, "Ismeretlen mentési hiba történt.")}${
          saved > 0 ? ` (${saved} sor már elmentve)` : ""
        }`,
      );
      await loadDetail().catch(() => undefined);
    } finally {
      setSavingProgress("");
      onChanged();
    }
  };

  const downloadTask = async () => {
    if (!detail) return;

    setIsDownloading(true);
    setError("");
    setMessage("");

    try {
      const fileName = await downloadSelection(
        "/api/hw-check-tasks/export",
        [detail.id],
        `${detail.taskCode}.xlsx`,
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
  const isComplete = readyLines === detail.lines.length && pendingLines === 0;

  return (
    <section className="saved-panel task-detail">
      <div className="panel-heading">
        <div>
          <p>{taskTypeLabel(detail.taskType).toUpperCase()}</p>
          <h2>
            {detail.taskCode}
            {isComplete && <CheckMark />}
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
          disabled={isDownloading}
          onClick={() => void downloadTask()}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />
          </svg>
          {isDownloading ? "BUILDING EXCEL…" : "DOWNLOAD"}
        </button>
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
                const lineReady = isLineReady(line, pending);

                return (
                  <div
                    className={`task-line ${lineReady ? "is-ready" : ""}`}
                    key={line.id}
                  >
                    <div className="line-cells">
                      <div>
                        <span>ITEM</span>
                        <strong>{line.item}</strong>
                      </div>
                      <div>
                        <span>SN</span>
                        <strong>{line.sn}</strong>
                      </div>
                      <div>
                        <span>SUBINV CODE</span>
                        <strong>{line.subinvCode || "—"}</strong>
                      </div>
                      <div>
                        <span>QTY</span>
                        <strong>{line.qty}</strong>
                      </div>
                    </div>

                    <div className="line-photos">
                      {SLOTS.map((slot) => {
                        const state = slotState(line, slot, pending);

                        return (
                          <div className="photo-field" key={slot}>
                            <label
                              className={`photo-input ${
                                state.kind === "new" ? "is-pending" : ""
                              }`}
                            >
                              {state.imageId ? (
                                <img
                                  className="photo-thumb"
                                  src={`/api/hw-check-task-image?id=${state.imageId}`}
                                  alt=""
                                  loading="lazy"
                                />
                              ) : null}
                              <span
                                className={
                                  state.kind === "empty"
                                    ? "photo-placeholder"
                                    : "photo-name"
                                }
                              >
                                {state.kind === "empty"
                                  ? `photo ${slot}`
                                  : state.fileName}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(event) =>
                                  void pickPhoto(line.id, slot, event)
                                }
                              />
                            </label>
                            {state.kind !== "empty" && (
                              <button
                                className="photo-clear"
                                type="button"
                                onClick={() => clearPhoto(line, slot)}
                                title={`Remove photo ${slot}`}
                                aria-label={`Remove photo ${slot} of ${line.item}`}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <p className="line-status">
                      {lineReady ? (
                        <>
                          <CheckMark /> READY
                        </>
                      ) : (
                        `${filledSlots(line, pending)}/${PHOTOS_PER_LINE} PHOTO`
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
            : isComplete
              ? "Minden kép feltöltve"
              : "Nincs mentendő változás"}
        </span>
        <button
          className="save-button"
          type="button"
          disabled={!!savingProgress || pendingLines === 0}
          onClick={() => void savePhotos()}
        >
          {savingProgress ? `SAVING ${savingProgress}…` : "SAVE PHOTOS"}
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m5 12 4 4L19 6" />
          </svg>
        </button>
      </div>
    </section>
  );
}
