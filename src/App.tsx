import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

const DAY_OFFSETS = Array.from({ length: 15 }, (_, index) => index - 14);
const PROBLEM_OPTIONS = [
  "Item Discrepancy",
  "SN Discrepancy",
  "Item not arrived",
  "Extra Item",
  "Corrosion",
  "Damaged item",
  "Burned item",
  "Not Visible SN",
  "Empty box",
  "SN upload",
  "Other",
];

type View = "add" | "saved";

type RecordCount = {
  date: string;
  count: number;
};

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

function getDate(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(date: Date) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function App() {
  const dates = useMemo(
    () => DAY_OFFSETS.map((offset) => ({ date: getDate(offset) })),
    [],
  );
  const todayKey = getDateKey(getDate());
  const firstDateKey = getDateKey(dates[0].date);
  const [view, setView] = useState<View>("add");
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [records, setRecords] = useState<DhgRecord[]>([]);
  const [formValues, setFormValues] = useState<FormValues>(EMPTY_FORM);
  const [editingRecord, setEditingRecord] = useState<DhgRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState(() => new Date());
  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const todayButtonRef = useRef<HTMLButtonElement>(null);
  const dateStripRef = useRef<HTMLDivElement>(null);

  const loadCounts = useCallback(async () => {
    const response = await fetch(
      `/api/dhg-records?from=${firstDateKey}&to=${todayKey}`,
    );
    if (!response.ok) throw new Error("A napi rekordok betöltése sikertelen.");

    const data = (await response.json()) as { counts: RecordCount[] };
    setRecordCounts(
      Object.fromEntries(data.counts.map((item) => [item.date, item.count])),
    );
  }, [firstDateKey, todayKey]);

  const loadRecords = useCallback(async (date: string) => {
    const response = await fetch(`/api/dhg-records?date=${date}`);
    if (!response.ok) throw new Error("A mentett rekordok betöltése sikertelen.");

    const data = (await response.json()) as { records: DhgRecord[] };
    setRecords(data.records);
  }, []);

  const refreshData = useCallback(async () => {
    setError("");
    try {
      await Promise.all([loadCounts(), loadRecords(selectedDate)]);
      setLastSync(new Date());
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Ismeretlen betöltési hiba történt."));
    } finally {
      setIsLoading(false);
    }
  }, [loadCounts, loadRecords, selectedDate]);

  useEffect(() => {
    const dateStrip = dateStripRef.current;
    if (dateStrip) dateStrip.scrollLeft = dateStrip.scrollWidth;
    todayButtonRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    const interval = window.setInterval(refreshData, 120_000);
    return () => window.clearInterval(interval);
  }, [refreshData]);

  useEffect(() => {
    setEditingRecord(null);
    setFormValues(EMPTY_FORM);
    setMessage("");
    setError("");
  }, [selectedDate]);

  const updateField = (field: keyof FormValues, value: string) => {
    setFormValues((current) => ({ ...current, [field]: value }));
  };

  const handleScannerEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "BUTTON") return;

    const controls = Array.from(
      formRef.current?.querySelectorAll<HTMLElement>(
        "input:not([disabled]):not([readonly]), select:not([disabled])",
      ) ?? [],
    );
    const currentIndex = controls.indexOf(target);
    if (currentIndex < 0) return;

    event.preventDefault();
    const nextControl = controls[currentIndex + 1];
    if (nextControl) {
      nextControl.focus();
      return;
    }

    formRef.current?.querySelector<HTMLButtonElement>(".save-button")?.focus();
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
      setLastSync(new Date());
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
      setLastSync(new Date());
      setView("saved");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Ismeretlen törlési hiba történt."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-kicker">DISCREPANCY HANDLING</p>
          <h1>DHG</h1>
        </div>
        <button className="sync-button" type="button" onClick={refreshData}>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M20 7v5h-5M4 17v-5h5" />
            <path d="M6.1 9a7 7 0 0 1 11.7-2.1L20 9M4 15l2.2 2.1A7 7 0 0 0 17.9 15" />
          </svg>
          <span>SYNC</span>
          <time dateTime={lastSync.toISOString()}>
            {lastSync.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </time>
        </button>
      </header>

      <section className="date-section" aria-label="Date selector">
        <div className="section-label"><span>WORK DATE</span><i /></div>
        <div className="date-strip" ref={dateStripRef}>
          {dates.map(({ date }) => {
            const dateKey = getDateKey(date);
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedDate;
            return (
              <button
                key={dateKey}
                ref={isToday ? todayButtonRef : undefined}
                className={`date-button ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""}`}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedDate(dateKey)}
              >
                <span>{formatShortDate(date)}</span>
                {(recordCounts[dateKey] ?? 0) > 0 && <b>{recordCounts[dateKey]}</b>}
              </button>
            );
          })}
        </div>
      </section>

      <nav className="view-switch" aria-label="Record views">
        <button
          className={view === "add" ? "is-active" : ""}
          type="button"
          onClick={() => setView("add")}
        >
          <span>01</span> ADD RECORD
        </button>
        <button
          className={view === "saved" ? "is-active" : ""}
          type="button"
          onClick={() => setView("saved")}
        >
          <span>02</span> SAVED RECORDS <b>{recordCounts[selectedDate] ?? 0}</b>
        </button>
      </nav>

      {message && <p className="status-message success-message">{message}</p>}
      {error && <p className="status-message error-message">{error}</p>}

      {view === "add" ? (
        <section className="form-panel">
          <div className="panel-heading">
            <div>
              <p>{editingRecord ? "MODIFY RECORD" : "NEW RECORD"}</p>
              <h2>{editingRecord?.lineId ?? "Automatic Line ID"}</h2>
            </div>
            <span>{selectedDate.split("-").join(".")}</span>
          </div>

          <form ref={formRef} onSubmit={saveRecord} onKeyDown={handleScannerEnter}>
            <label className="field field-readonly">
              <span>LINE ID</span>
              <input value={editingRecord?.lineId ?? "Assigned automatically on save"} readOnly />
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
                  <div><span>SYSTEM SN</span><strong>{record.systemSn}</strong></div>
                  <button type="button" onClick={() => editRecord(record)}>MODIFY <span>→</span></button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
