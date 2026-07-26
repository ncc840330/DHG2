import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ConfirmDialog from "./ConfirmDialog";
import {
  downloadSelection,
  focusNextControl,
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
import { RecordRow, SavedToolbar, useSelection } from "./SavedList";

type DeletionRequest = {
  id: number;
  recordDate: string;
  lineId: string;
  sourceTaskId: string;
  systemItem: string;
  systemSn: string;
  rfid: string;
  problemDescription: string;
  problemOther: string | null;
  images: RecordImage[];
};

type FormValues = {
  sourceTaskId: string;
  systemItem: string;
  systemSn: string;
  rfid: string;
  problemDescription: string;
  problemOther: string | null;
};

const EMPTY_FORM: FormValues = {
  sourceTaskId: "",
  systemItem: "",
  systemSn: "",
  rfid: "",
  problemDescription: "",
  problemOther: null,
};

export default function DeletionRequestTab({
  isActive,
  selectedDate,
  rangeFrom,
  rangeTo,
  refreshToken,
  onCounts,
  onSynced,
}: TabProps) {
  const [view, setView] = useState<View>("add");
  const [records, setRecords] = useState<DeletionRequest[]>([]);
  const [nextLineId, setNextLineId] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [formValues, setFormValues] = useState<FormValues>(EMPTY_FORM);
  const [editingRecord, setEditingRecord] = useState<DeletionRequest | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeletionRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const { photoSlots, resetPhotos, loadPhotos, pickPhoto, clearPhoto } =
    usePhotoSlots(setError);
  const selection = useSelection(records);

  const loadCounts = useCallback(async () => {
    const response = await fetch(
      `/api/deletion-requests?from=${rangeFrom}&to=${rangeTo}`,
    );
    if (!response.ok) throw new Error("A napi kérelmek betöltése sikertelen.");

    const data = (await response.json()) as { counts: RecordCount[] };
    onCounts(toCountMap(data.counts));
  }, [rangeFrom, rangeTo, onCounts]);

  const loadRecords = useCallback(async (date: string) => {
    const response = await fetch(`/api/deletion-requests?date=${date}`);
    if (!response.ok) throw new Error("A mentett kérelmek betöltése sikertelen.");

    const data = (await response.json()) as {
      records: DeletionRequest[];
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

  const handleScannerEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    focusNextControl(formRef.current, event);
  };

  const saveRecord = async (event: FormEvent) => {
    event.preventDefault();
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
        editingRecord
          ? `/api/deletion-requests?id=${editingRecord.id}`
          : "/api/deletion-requests",
        { method: editingRecord ? "PUT" : "POST", body: payload },
      );

      if (!response.ok) throw new Error("A kérelem mentése sikertelen.");
      const data = (await response.json()) as { record: DeletionRequest };

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

  const editRecord = (record: DeletionRequest) => {
    setEditingRecord(record);
    setFormValues({
      sourceTaskId: record.sourceTaskId,
      systemItem: record.systemItem,
      systemSn: record.systemSn,
      rfid: record.rfid,
      problemDescription: record.problemDescription,
      problemOther: record.problemOther,
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
      const response = await fetch(`/api/deletion-requests?id=${record.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("A kérelem törlése sikertelen.");

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
        "/api/deletion-requests/export",
        selection.selectedIds,
        `DeletionRequest_${selectedDate}.xlsx`,
      );
      setMessage(
        `${fileName} letöltve (${selection.selectedIds.length} kérelem).`,
      );
    } catch (downloadError) {
      setError(getErrorMessage(downloadError, "Ismeretlen letöltési hiba történt."));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <nav className="view-switch" aria-label="Deletion request views">
        <button
          className={view === "add" ? "is-active" : ""}
          type="button"
          onClick={() => setView("add")}
        >
          ADD REQUEST
        </button>
        <button
          className={view === "saved" ? "is-active" : ""}
          type="button"
          onClick={() => setView("saved")}
        >
          SAVED REQUESTS <b>{savedCount}</b>
        </button>
      </nav>

      {message && <p className="status-message success-message">{message}</p>}
      {error && <p className="status-message error-message">{error}</p>}

      {view === "add" ? (
        <section className="form-panel">
          <div className="panel-heading">
            <div>
              <p>{editingRecord ? "MODIFY REQUEST" : "NEW DELETION REQUEST"}</p>
              <h2>{editingRecord?.lineId ?? nextLineId}</h2>
            </div>
            <span>{selectedDate.split("-").join(".")}</span>
          </div>

          <form ref={formRef} onSubmit={saveRecord} onKeyDown={handleScannerEnter}>
            <label className="field field-readonly">
              <span>LINE ID</span>
              <input value={editingRecord?.lineId ?? nextLineId} readOnly />
            </label>
            <label className="field">
              <span>SOURCE TASK ID</span>
              <input ref={firstFieldRef} required value={formValues.sourceTaskId} onChange={(event) => updateField("sourceTaskId", event.target.value)} />
            </label>
            <label className="field">
              <span>SYSTEM ITEM</span>
              <input required value={formValues.systemItem} onChange={(event) => updateField("systemItem", event.target.value)} />
            </label>
            <label className="field">
              <span>SYSTEM SN <small>SCAN OR TYPE</small></span>
              <input required autoComplete="off" value={formValues.systemSn} onChange={(event) => updateField("systemSn", event.target.value)} />
            </label>
            <label className="field">
              <span>RFID <small>SCAN OR TYPE</small></span>
              <input required autoComplete="off" value={formValues.rfid} onChange={(event) => updateField("rfid", event.target.value)} />
            </label>
            <label className="field">
              <span>PROBLEM DESCRIPTION</span>
              <select required value={formValues.problemDescription} onChange={(event) => updateField("problemDescription", event.target.value)}>
                <option value="" disabled>Select a problem</option>
                {PROBLEM_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            {formValues.problemDescription === "Other" && (
              <label className="field field-other">
                <span>OTHER PROBLEM DESCRIPTION</span>
                <input required value={formValues.problemOther ?? ""} onChange={(event) => updateField("problemOther", event.target.value)} />
              </label>
            )}

            <PhotoFields
              slots={photoSlots}
              onPick={(index, event) => void pickPhoto(index, event)}
              onClear={clearPhoto}
            />

            <div className="form-actions">
              {editingRecord && (
                <button className="delete-button" type="button" disabled={isSaving} onClick={() => setPendingDelete(editingRecord)}>DELETE</button>
              )}
              <button className="save-button" type="submit" disabled={isSaving}>
                {isSaving ? "SAVING…" : editingRecord ? "SAVE CHANGES" : "SAVE REQUEST"}
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="saved-panel">
          <div className="panel-heading">
            <div><p>DELETION REQUESTS</p><h2>{selectedDate.split("-").join(".")}</h2></div>
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
            <div className="record-skeleton" aria-label="Loading requests"><i /><i /><i /></div>
          ) : records.length === 0 ? (
            <div className="empty-state">
              <svg aria-hidden="true" viewBox="0 0 48 48"><path d="M14 8h20v32H14zM19 17h10M19 24h10M19 31h6" /></svg>
              <h3>No deletion requests</h3>
              <p>Switch to ADD REQUEST to create the first deletion request for this work date.</p>
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
