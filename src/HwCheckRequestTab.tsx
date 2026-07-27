import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import {
  downloadSelection,
  getErrorMessage,
  loadJson,
  makeLineId,
  PROBLEM_OPTIONS,
  readApiError,
  RecordCount,
  TabProps,
  toCountMap,
} from "./lib";
import { appendPhotoSlots, PhotoFields, usePhotoSlots } from "./photos";
import type { RecordImage } from "./photos";
import {
  CameraScanProvider,
  clearScanFields,
  describeField,
  findMissingFields,
  focusNextControl,
  readScanFields,
  ScanField,
  useScannerForm,
} from "./scan";
import { RecordRow, SavedToolbar, useSelection } from "./SavedList";

/**
 * The TASKS list is what the operator reads, UPLOAD TASK is what they fill in —
 * the same pair as ADD RECORD / SAVED RECORDS on the other worksheets, with the
 * list first because a HW check starts from the tasks already on the day.
 */
type HwView = "tasks" | "upload";

type HwCheckTask = {
  id: number;
  recordDate: string;
  lineId: string;
  sourceTaskId: string;
  systemItem: string;
  systemSn: string;
  rfid: string;
  locator: string;
  problemDescription: string;
  problemOther: string | null;
  images: RecordImage[];
};

type FormValues = Omit<
  HwCheckTask,
  "id" | "recordDate" | "lineId" | "images"
>;

const EMPTY_FORM: FormValues = {
  sourceTaskId: "",
  systemItem: "",
  systemSn: "",
  rfid: "",
  locator: "",
  problemDescription: "",
  problemOther: null,
};

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
  const [records, setRecords] = useState<HwCheckTask[]>([]);
  const [nextLineId, setNextLineId] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [formValues, setFormValues] = useState<FormValues>(EMPTY_FORM);
  const [editingRecord, setEditingRecord] = useState<HwCheckTask | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HwCheckTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  const { photoSlots, resetPhotos, loadPhotos, pickPhoto, clearPhoto } =
    usePhotoSlots(setError);
  const selection = useSelection(records);

  const loadCounts = useCallback(async () => {
    const data = await loadJson<{ counts: RecordCount[] }>(
      `/api/hw-check-tasks?from=${rangeFrom}&to=${rangeTo}`,
      "A napi HW check taskok betöltése sikertelen.",
    );
    onCounts(toCountMap(data.counts));
  }, [rangeFrom, rangeTo, onCounts]);

  const loadRecords = useCallback(async (date: string) => {
    const data = await loadJson<{
      records: HwCheckTask[];
      nextLineId?: string;
    }>(
      `/api/hw-check-tasks?date=${date}`,
      "A mentett HW check taskok betöltése sikertelen.",
    );
    setRecords(data.records);
    setSavedCount(data.records.length);
    setNextLineId(data.nextLineId ?? makeLineId(date, data.records.length + 1));
  }, []);

  const refreshData = useCallback(async () => {
    setError("");
    let isFresh = true;
    try {
      await Promise.all([loadCounts(), loadRecords(selectedDate)]);
    } catch (loadError) {
      isFresh = false;
      setError(getErrorMessage(loadError, "Ismeretlen betöltési hiba történt."));
    } finally {
      setIsLoading(false);
      // Reported either way, so a failed refresh cannot leave the SYNC button
      // spinning for the rest of the shift.
      onSynced(isFresh);
    }
  }, [loadCounts, loadRecords, selectedDate, onSynced]);

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

  const resetForm = useCallback(() => {
    setFormValues(EMPTY_FORM);
    resetPhotos();
    // The state reset alone is not enough: React leaves a controlled input
    // untouched when its value prop did not change, and a barcode the scanner
    // wrote straight into the DOM never reached state to begin with.
    clearScanFields(formRef.current);
  }, [resetPhotos]);

  useEffect(() => {
    setEditingRecord(null);
    setPendingDelete(null);
    resetForm();
    setNextLineId("");
    setMessage("");
    setError("");
  }, [selectedDate, resetForm]);

  // The SAVE button is at the bottom of a long form, so the line that says
  // whether the task was saved would otherwise be off the top of the screen.
  useEffect(() => {
    if (!message && !error) return;
    statusRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [message, error]);

  const updateField = (field: keyof FormValues, value: string) => {
    setFormValues((current) => ({ ...current, [field]: value }));
  };

  const setScannedValue = useCallback((field: string, value: string) => {
    setFormValues((current) =>
      current[field as keyof FormValues] === value
        ? current
        : { ...current, [field]: value },
    );
  }, []);

  const scanner = useScannerForm({
    formRef,
    onValue: setScannedValue,
    isEnabled: isActive && view === "upload" && !pendingDelete,
  });

  const saveRecord = async () => {
    if (isSaving) return;

    // The API answers an incomplete task with one flat 400, and a PDA WebView
    // shows the browser's own validation bubble for a blink at most — so the
    // form names what is missing itself instead of appearing to do nothing.
    const missing = findMissingFields(formRef.current);
    if (missing.length > 0) {
      setMessage("");
      setError(
        `A task nem lett elmentve, hiányzó adat: ${missing
          .map(describeField)
          .join(", ")}.`,
      );
      missing[0].focus();
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = new FormData();
      // Whatever is on screen is what gets saved. A value the scanner driver
      // wrote into the input without firing an event is not in state yet, and
      // saving state alone would drop the barcode the operator can see.
      const live = readScanFields(formRef.current);
      Object.entries(formValues).forEach(([field, value]) => {
        payload.set(field, live[field] ?? value ?? "");
      });
      appendPhotoSlots(payload, photoSlots);
      if (!editingRecord) payload.set("recordDate", selectedDate);

      const response = await fetch(
        editingRecord
          ? `/api/hw-check-tasks?id=${editingRecord.id}`
          : "/api/hw-check-tasks",
        { method: editingRecord ? "PUT" : "POST", body: payload },
      );

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "A task mentése sikertelen."),
        );
      }
      const data = (await response.json()) as { record: HwCheckTask };

      setMessage(
        editingRecord
          ? `${data.record.lineId} sikeresen módosítva.`
          : `${data.record.lineId} sikeresen elmentve.`,
      );
      setEditingRecord(null);
      resetForm();
      await Promise.all([loadCounts(), loadRecords(selectedDate)]);
      onSynced();
      window.requestAnimationFrame(() => firstFieldRef.current?.focus());
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Ismeretlen mentési hiba történt."));
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Nothing but the SAVE button's own handler saves this form. A scanner's
   * trailing Enter still reaches the form on PDAs that report an unnamed key
   * code, and that has to walk down the fields, not submit half a task.
   */
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    focusNextControl(formRef.current, document.activeElement as HTMLElement);
  };

  const editRecord = (record: HwCheckTask) => {
    setEditingRecord(record);
    setFormValues({
      sourceTaskId: record.sourceTaskId,
      systemItem: record.systemItem,
      systemSn: record.systemSn,
      rfid: record.rfid,
      locator: record.locator,
      problemDescription: record.problemDescription,
      problemOther: record.problemOther,
    });
    loadPhotos(record.images);
    setView("upload");
    setMessage("");
    setError("");
    window.requestAnimationFrame(() => firstFieldRef.current?.focus());
  };

  const deleteRecord = async () => {
    const record = pendingDelete;
    if (!record) return;

    setIsDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/hw-check-tasks?id=${record.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("A task törlése sikertelen.");

      setPendingDelete(null);
      if (editingRecord?.id === record.id) {
        setEditingRecord(null);
        resetForm();
        setView("tasks");
      }
      setMessage(
        `${record.lineId} törölve. A felszabadult Line ID ismét kiosztható.`,
      );
      await Promise.all([loadCounts(), loadRecords(selectedDate)]);
      onSynced();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Ismeretlen törlési hiba történt."));
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const downloadSelected = async () => {
    if (selection.selectedIds.length === 0) return;

    setIsDownloading(true);
    setError("");
    setMessage("");

    try {
      const fileName = await downloadSelection(
        "/api/hw-check-tasks/export",
        selection.selectedIds,
        `HWCheckRequest_${selectedDate}.xlsx`,
      );
      setMessage(`${fileName} letöltve (${selection.selectedIds.length} task).`);
    } catch (downloadError) {
      setError(getErrorMessage(downloadError, "Ismeretlen letöltési hiba történt."));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <nav className="view-switch" aria-label="HW check request views">
        <button
          className={view === "tasks" ? "is-active" : ""}
          type="button"
          onClick={() => setView("tasks")}
        >
          TASKS <b>{savedCount}</b>
        </button>
        <button
          className={view === "upload" ? "is-active" : ""}
          type="button"
          onClick={() => setView("upload")}
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
              <p>{editingRecord ? "MODIFY TASK" : "NEW HW CHECK TASK"}</p>
              <h2>{editingRecord?.lineId ?? nextLineId}</h2>
            </div>
            <span>{selectedDate.split("-").join(".")}</span>
          </div>

          <CameraScanProvider formRef={formRef} onValue={setScannedValue}>
            <form ref={formRef} onSubmit={handleSubmit} onKeyDown={scanner.onKeyDown}>
              <label className="field field-readonly">
                <span>LINE ID</span>
                <input value={editingRecord?.lineId ?? nextLineId} readOnly />
              </label>
              <ScanField
                label="SOURCE TASK ID"
                hint="SCAN OR TYPE"
                name="sourceTaskId"
                value={formValues.sourceTaskId}
                onValue={setScannedValue}
                inputRef={firstFieldRef}
                required
              />
              <ScanField
                label="SYSTEM ITEM"
                name="systemItem"
                value={formValues.systemItem}
                onValue={setScannedValue}
                required
              />
              <ScanField
                label="SYSTEM SN"
                hint="SCAN OR TYPE"
                name="systemSn"
                value={formValues.systemSn}
                onValue={setScannedValue}
                required
              />
              <ScanField
                label="RFID"
                hint="SCAN OR TYPE"
                name="rfid"
                value={formValues.rfid}
                onValue={setScannedValue}
                required
              />
              <label className="field">
                <span>PROBLEM DESCRIPTION</span>
                <select
                  name="problemDescription"
                  required
                  value={formValues.problemDescription}
                  onChange={(event) =>
                    updateField("problemDescription", event.target.value)
                  }
                >
                  <option value="" disabled>
                    Select a problem
                  </option>
                  {PROBLEM_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              {formValues.problemDescription === "Other" && (
                <ScanField
                  label="OTHER PROBLEM DESCRIPTION"
                  className="field-other"
                  name="problemOther"
                  value={formValues.problemOther ?? ""}
                  onValue={setScannedValue}
                  required
                />
              )}
              <ScanField
                label="LOCATOR"
                hint="SCAN OR TYPE"
                name="locator"
                value={formValues.locator}
                onValue={setScannedValue}
                required
              />

              <PhotoFields
                slots={photoSlots}
                onPick={(index, event) => void pickPhoto(index, event)}
                onClear={clearPhoto}
              />

              <div className="form-actions">
                {editingRecord && (
                  <button
                    className="delete-button"
                    type="button"
                    disabled={isSaving}
                    onClick={() => setPendingDelete(editingRecord)}
                  >
                    DELETE
                  </button>
                )}
                <button
                  className="save-button"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveRecord()}
                >
                  {isSaving
                    ? "SAVING…"
                    : editingRecord
                      ? "SAVE CHANGES"
                      : "SAVE TASK"}
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </button>
              </div>
            </form>
          </CameraScanProvider>
        </section>
      ) : (
        <section className="saved-panel">
          <div className="panel-heading">
            <div>
              <p>HW CHECK TASKS</p>
              <h2>{selectedDate.split("-").join(".")}</h2>
            </div>
            <span>{records.length} SAVED</span>
          </div>

          {records.length > 0 && (
            <SavedToolbar
              selectedCount={selection.selectedIds.length}
              allSelected={selection.allSelected}
              isDownloading={isDownloading}
              onToggleAll={selection.toggleAll}
              onDownload={downloadSelected}
            />
          )}

          {isLoading ? (
            <div className="record-skeleton" aria-label="Loading tasks">
              <i />
              <i />
              <i />
            </div>
          ) : records.length === 0 ? (
            <div className="empty-state">
              <svg aria-hidden="true" viewBox="0 0 48 48">
                <path d="M14 8h20v32H14zM19 17h10M19 24h10M19 31h6" />
              </svg>
              <h3>No HW check tasks</h3>
              <p>
                Switch to UPLOAD TASK to create the first hardware check request
                for this work date.
              </p>
            </div>
          ) : (
            <div className="record-list">
              {records.map((record) => (
                <RecordRow
                  key={record.id}
                  lineId={record.lineId}
                  isSelected={selection.selectedIds.includes(record.id)}
                  onToggle={() => selection.toggle(record.id)}
                  onModify={() => editRecord(record)}
                  onDelete={() => setPendingDelete(record)}
                  cells={[
                    { label: "LINE ID", value: record.lineId },
                    { label: "SOURCE TASK ID", value: record.sourceTaskId },
                    { label: "SYSTEM ITEM", value: record.systemItem },
                    { label: "SYSTEM SN", value: record.systemSn },
                    { label: "RFID", value: record.rfid },
                    { label: "LOCATOR", value: record.locator },
                    { label: "PHOTOS", value: `${record.images.length}/2` },
                  ]}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Are you sure you want to delete?"
          message={`${pendingDelete.lineId} is removed for good, photos included. Its Line ID becomes available again.`}
          busyLabel="DELETING…"
          isBusy={isDeleting}
          onConfirm={() => void deleteRecord()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
