import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

type RequestImage = {
  id: number;
  slot: number;
  fileName: string;
  contentType: string;
  byteSize: number;
};

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
  images: RequestImage[];
};

type FormValues = {
  sourceTaskId: string;
  systemItem: string;
  systemSn: string;
  rfid: string;
  problemDescription: string;
  problemOther: string | null;
};

type PhotoSlot =
  | { kind: "empty" }
  | { kind: "existing"; imageId: number; fileName: string }
  | { kind: "new"; file: File; previewUrl: string };

const SLOTS = [0, 1];
const MAX_IMAGE_EDGE = 1600;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const RECOMPRESS_ABOVE_BYTES = 400 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const EMPTY_FORM: FormValues = {
  sourceTaskId: "",
  systemItem: "",
  systemSn: "",
  rfid: "",
  problemDescription: "",
  problemOther: null,
};

const EMPTY_SLOTS: PhotoSlot[] = [{ kind: "empty" }, { kind: "empty" }];

/**
 * Photos come straight off a phone camera, so they are scaled down before
 * upload — the archive stays small enough to download over the warehouse wifi.
 */
async function prepareImage(file: File) {
  if (file.size <= RECOMPRESS_ABOVE_BYTES && ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.78),
    );
    if (!blob) throw new Error("Encoding failed.");

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function readFileName(header: string | null) {
  if (!header) return null;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // Fall back to the plain filename below.
    }
  }

  const plain = /filename="([^"]+)"/i.exec(header);
  return plain ? plain[1] : null;
}

function slotPreview(slot: PhotoSlot) {
  if (slot.kind === "new") return slot.previewUrl;
  if (slot.kind === "existing") return `/api/deletion-request-image?id=${slot.imageId}`;
  return null;
}

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
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>(EMPTY_SLOTS);
  const [editingRecord, setEditingRecord] = useState<DeletionRequest | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const previewUrls = useRef<string[]>([]);

  const trackPreview = useCallback((url: string) => {
    previewUrls.current.push(url);
    return url;
  }, []);

  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current = [];
    },
    [],
  );

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
    setSelectedIds((current) =>
      current.filter((id) => data.records.some((record) => record.id === id)),
    );
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
    setPhotoSlots(EMPTY_SLOTS);
    setNextLineId("");
    setSelectedIds([]);
    setMessage("");
    setError("");
  }, [selectedDate]);

  const allSelected = records.length > 0 && selectedIds.length === records.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedIds.length > 0 && !allSelected;
    }
  }, [selectedIds, allSelected]);

  const updateField = (field: keyof FormValues, value: string) => {
    setFormValues((current) => ({ ...current, [field]: value }));
  };

  const handleScannerEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    focusNextControl(formRef.current, event);
  };

  const pickPhoto = async (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    const prepared = await prepareImage(file);

    if (!ALLOWED_IMAGE_TYPES.includes(prepared.type)) {
      setError("Csak JPEG, PNG vagy WEBP kép tölthető fel.");
      return;
    }
    if (prepared.size > MAX_IMAGE_BYTES) {
      setError("A kép túl nagy, legfeljebb 6 MB tölthető fel.");
      return;
    }

    const previewUrl = trackPreview(URL.createObjectURL(prepared));
    setPhotoSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { kind: "new", file: prepared, previewUrl } : slot,
      ),
    );
  };

  const clearPhoto = (index: number) => {
    setPhotoSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { kind: "empty" } : slot,
      ),
    );
  };

  const buildPayload = () => {
    const payload = new FormData();
    payload.set("sourceTaskId", formValues.sourceTaskId);
    payload.set("systemItem", formValues.systemItem);
    payload.set("systemSn", formValues.systemSn);
    payload.set("rfid", formValues.rfid);
    payload.set("problemDescription", formValues.problemDescription);
    payload.set("problemOther", formValues.problemOther ?? "");

    photoSlots.forEach((slot, index) => {
      const field = `image${index + 1}`;
      if (slot.kind === "new") {
        payload.set(`${field}Action`, "replace");
        payload.set(field, slot.file, slot.file.name);
      } else {
        payload.set(`${field}Action`, slot.kind === "existing" ? "keep" : "empty");
      }
    });

    return payload;
  };

  const saveRecord = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = buildPayload();
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
      setPhotoSlots(EMPTY_SLOTS);
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
    setPhotoSlots(
      SLOTS.map((index) => {
        const image = record.images.find((item) => item.slot === index + 1);
        return image
          ? ({ kind: "existing", imageId: image.id, fileName: image.fileName } as PhotoSlot)
          : ({ kind: "empty" } as PhotoSlot);
      }),
    );
    setView("add");
    setMessage("");
    setError("");
    window.requestAnimationFrame(() => firstFieldRef.current?.focus());
  };

  const deleteRecord = async () => {
    if (!editingRecord) return;
    if (!window.confirm(`Biztosan törlöd ezt a kérelmet: ${editingRecord.lineId}?`)) return;

    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/deletion-requests?id=${editingRecord.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("A kérelem törlése sikertelen.");

      setEditingRecord(null);
      setFormValues(EMPTY_FORM);
      setPhotoSlots(EMPTY_SLOTS);
      setMessage("A kérelem törölve. A felszabadult Line ID ismét kiosztható.");
      await Promise.all([loadCounts(), loadRecords(selectedDate)]);
      onSynced();
      setView("saved");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Ismeretlen törlési hiba történt."));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : records.map((record) => record.id));
  };

  const selectedTaskCount = useMemo(() => {
    const tasks = records
      .filter((record) => selectedIds.includes(record.id))
      .map((record) => record.sourceTaskId);
    return new Set(tasks).size;
  }, [records, selectedIds]);

  const downloadSelected = async () => {
    if (selectedIds.length === 0) return;

    setIsDownloading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/deletion-requests/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) throw new Error("A letöltés sikertelen.");

      const archive = await response.blob();
      const fileName =
        readFileName(response.headers.get("Content-Disposition")) ??
        "deletion-requests.zip";

      const url = URL.createObjectURL(archive);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setMessage(`${fileName} letöltve (${selectedIds.length} kérelem).`);
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

            <div className="field">
              <span>PHOTOS <small>MAX 2 PER LINE ID</small></span>
              <div className="photo-grid">
                {photoSlots.map((slot, index) => {
                  const preview = slotPreview(slot);
                  return (
                    <div className="photo-slot" key={index}>
                      {preview ? (
                        <img src={preview} alt={`Photo ${index + 1}`} />
                      ) : (
                        <div className="photo-empty">
                          <svg aria-hidden="true" viewBox="0 0 24 24">
                            <path d="M4 7h4l2-2h4l2 2h4v12H4zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
                          </svg>
                          <b>PHOTO {index + 1}</b>
                        </div>
                      )}
                      <div className="photo-actions">
                        <label className="photo-pick">
                          {slot.kind === "empty" ? "ADD" : "REPLACE"}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => void pickPhoto(index, event)}
                          />
                        </label>
                        {slot.kind !== "empty" && (
                          <button type="button" onClick={() => clearPhoto(index)}>REMOVE</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="form-actions">
              {editingRecord && (
                <button className="delete-button" type="button" disabled={isSaving} onClick={deleteRecord}>DELETE</button>
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
            <div className="saved-toolbar">
              <label className="select-all">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
                <span>SELECT ALL</span>
              </label>
              <button
                className="download-button"
                type="button"
                disabled={selectedIds.length === 0 || isDownloading}
                onClick={downloadSelected}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />
                </svg>
                {isDownloading
                  ? "BUILDING ZIP…"
                  : `DOWNLOAD ${selectedIds.length ? `(${selectedIds.length})` : ""}`}
              </button>
            </div>
          )}

          {selectedTaskCount > 1 && (
            <p className="toolbar-hint">
              {selectedTaskCount} source task ID selected — each one gets its own ZIP inside the download.
            </p>
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
                <article
                  className={`request-row ${selectedIds.includes(record.id) ? "is-selected" : ""}`}
                  key={record.id}
                >
                  <label className="row-select">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(record.id)}
                      onChange={() => toggleSelected(record.id)}
                    />
                    <span className="visually-hidden">Select {record.lineId}</span>
                  </label>
                  <div className="cell-line"><span>LINE ID</span><strong>{record.lineId}</strong></div>
                  <div className="cell-task"><span>SOURCE TASK ID</span><strong>{record.sourceTaskId}</strong></div>
                  <div className="cell-item"><span>SYSTEM ITEM</span><strong>{record.systemItem}</strong></div>
                  <div className="cell-sn"><span>SYSTEM SN</span><strong>{record.systemSn}</strong></div>
                  <div className="cell-rfid"><span>RFID</span><strong>{record.rfid}</strong></div>
                  <div className="row-photos">
                    <span>PHOTOS</span>
                    <strong>{record.images.length}/2</strong>
                  </div>
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
