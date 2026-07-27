import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import {
  downloadSelection,
  getErrorMessage,
  makeLineId,
  PROBLEM_OPTIONS,
  RecordCount,
  TabProps,
  toCountMap,
  View,
} from "./lib";
import {
  appendPhotoSlots,
  PhotoFields,
  usePhotoSlots,
} from "./photos";
import type { RecordImage } from "./photos";
import { focusNextControl, ScanField, useScannerForm } from "./scan";
import { RecordRow, SavedToolbar, useSelection } from "./SavedList";

type DhgRecord = {
  id: number;
  recordDate: string;
  lineId: string;
  systemItem: string;
  systemSn: string;
  physicalItem: string;
  physicalSn: string;
  rfid: string;
  problemDescription: string;
  problemOther: string | null;
  locator: string;
  county: string;
  sourceTaskId: string;
  images: RecordImage[];
};

type FormValues = Omit<
  DhgRecord,
  "id" | "recordDate" | "lineId" | "images"
>;

const EMPTY_FORM: FormValues = {
  systemItem: "",
  systemSn: "",
  physicalItem: "",
  physicalSn: "",
  rfid: "",
  problemDescription: "",
  problemOther: null,
  locator: "",
  county: "",
  sourceTaskId: "",
};

export default function DhgTab({
  isActive,
  selectedDate,
  rangeFrom,
  rangeTo,
  refreshToken,
  onCounts,
  onSynced,
}: TabProps) {
  const [view, setView] = useState<View>("add");
  const [records, setRecords] = useState<DhgRecord[]>([]);
  const [nextLineId, setNextLineId] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [formValues, setFormValues] = useState<FormValues>(EMPTY_FORM);
  const [editingRecord, setEditingRecord] = useState<DhgRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DhgRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const saveIntentRef = useRef(false);

  const { photoSlots, resetPhotos, loadPhotos, pickPhoto, clearPhoto } =
    usePhotoSlots(setError);
  const selection = useSelection(records);

  const loadCounts = useCallback(async () => {
    const response = await fetch(
      `/api/dhg-records?from=${rangeFrom}&to=${rangeTo}`,
    );
    if (!response.ok) throw new Error("A napi rekordok betöltése sikertelen.");

    const data = (await response.json()) as { counts: RecordCount[] };
    onCounts(toCountMap(data.counts));
  }, [rangeFrom, rangeTo, onCounts]);

  const loadRecords = useCallback(async (date: string) => {
    const response = await fetch(`/api/dhg-records?date=${date}`);
    if (!response.ok) throw new Error("A mentett rekordok betöltése sikertelen.");

    const data = (await response.json()) as {
      records: DhgRecord[];
      nextLineId?: string;
    };
    setRecords(data.records);
    setSavedCount(data.records.length);
    setNextLineId(data.nextLineId ?? makeLineId(date, data.records.length + 1));
  }, []);

  const refreshData = useCallback(async () => {
    setError("");
    try {
      await Promise.all([loadCounts(), loadRecords(selectedDate)]);
      onSynced();
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Ismeretlen betöltési hiba történt."));
    } finally {
      setIsLoading(false);
    }
  }, [loadCounts, loadRecords, selectedDate, onSynced]);

  useEffect(() => {
    if (!isActive) return;
    void refreshData();
  }, [isActive, refreshData, refreshToken]);

  useEffect(() => {
    if (!isActive) return undefined;
    const interval = window.setInterval(refreshData, 120_000);
    return () => window.clearInterval(interval);
  }, [isActive, refreshData]);

  useEffect(() => {
    setEditingRecord(null);
    setPendingDelete(null);
    setFormValues(EMPTY_FORM);
    resetPhotos();
    setNextLineId("");
    setMessage("");
    setError("");
  }, [selectedDate, resetPhotos]);

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
    isEnabled: isActive && view === "add" && !pendingDelete,
  });

  const saveRecord = async (event: FormEvent) => {
    event.preventDefault();

    // A scanner's trailing Enter can still reach the form on PDAs that report
    // an unnamed key code, so only the SAVE button is allowed to submit.
    const wasRequested = saveIntentRef.current;
    saveIntentRef.current = false;
    if (!wasRequested) {
      focusNextControl(formRef.current, document.activeElement as HTMLElement);
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = new FormData();
      Object.entries(formValues).forEach(([field, value]) => {
        payload.set(field, value ?? "");
      });
      appendPhotoSlots(payload, photoSlots);
      if (!editingRecord) payload.set("recordDate", selectedDate);

      const response = await fetch(
        editingRecord ? `/api/dhg-records?id=${editingRecord.id}` : "/api/dhg-records",
        { method: editingRecord ? "PUT" : "POST", body: payload },
      );

      if (!response.ok) throw new Error("A rekord mentése sikertelen.");
      const data = (await response.json()) as { record: DhgRecord };

      setMessage(
        editingRecord
          ? `${data.record.lineId} sikeresen módosítva.`
          : `${data.record.lineId} sikeresen elmentve.`,
      );
      setEditingRecord(null);
      setFormValues(EMPTY_FORM);
      resetPhotos();
      await Promise.all([loadCounts(), loadRecords(selectedDate)]);
      onSynced();
      window.requestAnimationFrame(() => firstFieldRef.current?.focus());
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Ismeretlen mentési hiba történt."));
    } finally {
      setIsSaving(false);
    }
  };

  const editRecord = (record: DhgRecord) => {
    setEditingRecord(record);
    setFormValues({
      systemItem: record.systemItem,
      systemSn: record.systemSn,
      physicalItem: record.physicalItem,
      physicalSn: record.physicalSn,
      rfid: record.rfid,
      problemDescription: record.problemDescription,
      problemOther: record.problemOther,
      locator: record.locator,
      county: record.county,
      sourceTaskId: record.sourceTaskId,
    });
    loadPhotos(record.images);
    setView("add");
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
      const response = await fetch(`/api/dhg-records?id=${record.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("A rekord törlése sikertelen.");

      setPendingDelete(null);
      if (editingRecord?.id === record.id) {
        setEditingRecord(null);
        setFormValues(EMPTY_FORM);
        resetPhotos();
        setView("saved");
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
        "/api/dhg-records/export",
        selection.selectedIds,
        `DHG_${selectedDate}.xlsx`,
      );
      setMessage(
        `${fileName} letöltve (${selection.selectedIds.length} rekord).`,
      );
    } catch (downloadError) {
      setError(getErrorMessage(downloadError, "Ismeretlen letöltési hiba történt."));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <nav className="view-switch" aria-label="DHG record views">
        <button
          className={view === "add" ? "is-active" : ""}
          type="button"
          onClick={() => setView("add")}
        >
          ADD RECORD
        </button>
        <button
          className={view === "saved" ? "is-active" : ""}
          type="button"
          onClick={() => setView("saved")}
        >
          SAVED RECORDS <b>{savedCount}</b>
        </button>
      </nav>

      {message && <p className="status-message success-message">{message}</p>}
      {error && <p className="status-message error-message">{error}</p>}

      {view === "add" ? (
        <section className="form-panel">
          <div className="panel-heading">
            <div>
              <p>{editingRecord ? "MODIFY RECORD" : "NEW RECORD"}</p>
              <h2>{editingRecord?.lineId ?? nextLineId}</h2>
            </div>
            <span>{selectedDate.split("-").join(".")}</span>
          </div>

          <form ref={formRef} onSubmit={saveRecord} onKeyDown={scanner.onKeyDown}>
            <label className="field field-readonly">
              <span>LINE ID</span>
              <input value={editingRecord?.lineId ?? nextLineId} readOnly />
            </label>
            <ScanField
              label="SYSTEM ITEM"
              name="systemItem"
              value={formValues.systemItem}
              onValue={setScannedValue}
              inputRef={firstFieldRef}
              required
            />
            <ScanField
              label="SYSTEM SN"
              hint="SCAN OR SELECT"
              name="systemSn"
              value={formValues.systemSn}
              onValue={setScannedValue}
              options={["Item attribute", "Not available"]}
              required
            />
            <ScanField
              label="PHYSICAL ITEM"
              name="physicalItem"
              value={formValues.physicalItem}
              onValue={setScannedValue}
              required
            />
            <ScanField
              label="PHYSICAL SN"
              hint="SCAN OR TYPE"
              name="physicalSn"
              value={formValues.physicalSn}
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
            <label className="field field-wide">
              <span>PROBLEM DESCRIPTION</span>
              <select name="problemDescription" required value={formValues.problemDescription} onChange={(event) => updateField("problemDescription", event.target.value)}>
                <option value="" disabled>Select a problem</option>
                {PROBLEM_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            {formValues.problemDescription === "Other" && (
              <ScanField
                label="OTHER PROBLEM DESCRIPTION"
                className="field-wide field-other"
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
            <ScanField
              label="COUNTY"
              name="county"
              value={formValues.county}
              onValue={setScannedValue}
              required
            />
            <ScanField
              label="SOURCE TASK ID"
              className="field-wide"
              hint="SCAN OR TYPE"
              name="sourceTaskId"
              value={formValues.sourceTaskId}
              onValue={setScannedValue}
              required
            />

            <PhotoFields
              slots={photoSlots}
              onPick={(index, event) => void pickPhoto(index, event)}
              onClear={clearPhoto}
            />

            <div className="form-actions field-wide">
              {editingRecord && (
                <button className="delete-button" type="button" disabled={isSaving} onClick={() => setPendingDelete(editingRecord)}>DELETE</button>
              )}
              <button
                className="save-button"
                type="submit"
                disabled={isSaving}
                onClick={() => {
                  saveIntentRef.current = true;
                }}
              >
                {isSaving ? "SAVING…" : editingRecord ? "SAVE CHANGES" : "SAVE RECORD"}
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="saved-panel">
          <div className="panel-heading">
            <div><p>DAILY RECORDS</p><h2>{selectedDate.split("-").join(".")}</h2></div>
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
            <div className="record-skeleton" aria-label="Loading records"><i /><i /><i /></div>
          ) : records.length === 0 ? (
            <div className="empty-state">
              <svg aria-hidden="true" viewBox="0 0 48 48"><path d="M14 8h20v32H14zM19 17h10M19 24h10M19 31h6" /></svg>
              <h3>No saved records</h3>
              <p>Create the first discrepancy record for this work date.</p>
              <button type="button" onClick={() => setView("add")}>ADD RECORD</button>
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
                    { label: "PHYSICAL SN", value: record.physicalSn },
                    { label: "RFID", value: record.rfid },
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
          message={`${pendingDelete.lineId} is removed for good. Its Line ID becomes available again.`}
          busyLabel="DELETING…"
          isBusy={isDeleting}
          onConfirm={() => void deleteRecord()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
