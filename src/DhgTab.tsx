import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  focusNextControl,
  getErrorMessage,
  makeLineId,
  PROBLEM_OPTIONS,
  RecordCount,
  TabProps,
  toCountMap,
  View,
} from "./lib";

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
};

type FormValues = Omit<DhgRecord, "id" | "recordDate" | "lineId">;

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

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
    setFormValues(EMPTY_FORM);
    setNextLineId("");
    setMessage("");
    setError("");
  }, [selectedDate]);

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
      const response = await fetch(
        editingRecord ? `/api/dhg-records?id=${editingRecord.id}` : "/api/dhg-records",
        {
          method: editingRecord ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordDate: selectedDate, ...formValues }),
        },
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
    setView("add");
    setMessage("");
    setError("");
    window.requestAnimationFrame(() => firstFieldRef.current?.focus());
  };

  const deleteRecord = async () => {
    if (!editingRecord) return;
    if (!window.confirm(`Biztosan törlöd ezt a rekordot: ${editingRecord.lineId}?`)) return;

    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/dhg-records?id=${editingRecord.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("A rekord törlése sikertelen.");

      setEditingRecord(null);
      setFormValues(EMPTY_FORM);
      setMessage("A rekord törölve. A felszabadult Line ID ismét kiosztható.");
      await Promise.all([loadCounts(), loadRecords(selectedDate)]);
      onSynced();
      setView("saved");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Ismeretlen törlési hiba történt."));
    } finally {
      setIsSaving(false);
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

          <form ref={formRef} onSubmit={saveRecord} onKeyDown={handleScannerEnter}>
            <label className="field field-readonly">
              <span>LINE ID</span>
              <input value={editingRecord?.lineId ?? nextLineId} readOnly />
            </label>
            <label className="field">
              <span>SYSTEM ITEM</span>
              <input ref={firstFieldRef} required value={formValues.systemItem} onChange={(event) => updateField("systemItem", event.target.value)} />
            </label>
            <label className="field">
              <span>SYSTEM SN <small>SCAN OR SELECT</small></span>
              <input required list="system-sn-options" autoComplete="off" value={formValues.systemSn} onChange={(event) => updateField("systemSn", event.target.value)} />
              <datalist id="system-sn-options">
                <option value="Item attribute" />
                <option value="Not available" />
              </datalist>
            </label>
            <label className="field">
              <span>PHYSICAL ITEM</span>
              <input required value={formValues.physicalItem} onChange={(event) => updateField("physicalItem", event.target.value)} />
            </label>
            <label className="field">
              <span>PHYSICAL SN</span>
              <input required value={formValues.physicalSn} onChange={(event) => updateField("physicalSn", event.target.value)} />
            </label>
            <label className="field">
              <span>RFID</span>
              <input required value={formValues.rfid} onChange={(event) => updateField("rfid", event.target.value)} />
            </label>
            <label className="field field-wide">
              <span>PROBLEM DESCRIPTION</span>
              <select required value={formValues.problemDescription} onChange={(event) => updateField("problemDescription", event.target.value)}>
                <option value="" disabled>Select a problem</option>
                {PROBLEM_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            {formValues.problemDescription === "Other" && (
              <label className="field field-wide field-other">
                <span>OTHER PROBLEM DESCRIPTION</span>
                <input required value={formValues.problemOther ?? ""} onChange={(event) => updateField("problemOther", event.target.value)} />
              </label>
            )}
            <label className="field">
              <span>LOCATOR</span>
              <input required value={formValues.locator} onChange={(event) => updateField("locator", event.target.value)} />
            </label>
            <label className="field">
              <span>COUNTY</span>
              <input required value={formValues.county} onChange={(event) => updateField("county", event.target.value)} />
            </label>
            <label className="field field-wide">
              <span>SOURCE TASK ID</span>
              <input required value={formValues.sourceTaskId} onChange={(event) => updateField("sourceTaskId", event.target.value)} />
            </label>

            <div className="form-actions field-wide">
              {editingRecord && (
                <button className="delete-button" type="button" disabled={isSaving} onClick={deleteRecord}>DELETE</button>
              )}
              <button className="save-button" type="submit" disabled={isSaving}>
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
                <article className="record-row" key={record.id}>
                  <div><span>LINE ID</span><strong>{record.lineId}</strong></div>
                  <div><span>SYSTEM ITEM</span><strong>{record.systemItem}</strong></div>
                  <div><span>SYSTEM SN</span><strong>{record.systemSn}</strong></div>
                  <button type="button" onClick={() => editRecord(record)}>MODIFY <span>→</span></button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
