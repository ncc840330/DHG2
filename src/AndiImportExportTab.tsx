import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ANDI_MAX_BYTES,
  ANDI_MAX_ZIP_ENTRIES,
  AndiPhoto,
  baseName,
  cleanNameInput,
  compressPhoto,
  duplicateNames,
  finalName,
  formatBytes,
  numberedName,
  StagedPhoto,
} from "./andi-photos";
import ConfirmDialog from "./ConfirmDialog";
import {
  downloadSelection,
  getErrorMessage,
  loadJson,
  readApiError,
  RecordCount,
  saveBlob,
  TabProps,
  toCountMap,
} from "./lib";
import { useSelection } from "./SavedList";

/**
 * Pictures in, pictures out. Andi shoots them one at a time on the phone or picks
 * a batch out of the gallery, names them, and takes them back either as plain
 * JPEGs or as one ZIP — so the tab is a single column read top to bottom: pick,
 * name, upload, then the day's gallery to select from and download.
 */

type DownloadFormat = "jpeg" | "zip";

const SIZE_LIMIT_KB = Math.round(ANDI_MAX_BYTES / 1024);

const photoCount = (count: number) => `${count} photo${count === 1 ? "" : "s"}`;

let stagedKey = 0;

export default function AndiImportExportTab({
  isActive,
  selectedDate,
  rangeFrom,
  rangeTo,
  refreshToken,
  onCounts,
  onSynced,
}: TabProps) {
  const [photos, setPhotos] = useState<AndiPhoto[]>([]);
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const [prefix, setPrefix] = useState("");
  /** Renames typed on uploaded cards, keyed by photo id until they are saved. */
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingRenameId, setSavingRenameId] = useState<number | null>(null);
  const [format, setFormat] = useState<DownloadFormat>("jpeg");
  const [preparing, setPreparing] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");
  const [downloadProgress, setDownloadProgress] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AndiPhoto | null>(null);
  const [isDeletingSelection, setIsDeletingSelection] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const { selectedIds, allSelected, toggle, toggleAll, clear } = useSelection(photos);

  const loadCounts = useCallback(async () => {
    const data = await loadJson<{ counts: RecordCount[] }>(
      `/api/andi-photos?from=${rangeFrom}&to=${rangeTo}`,
      "The daily photo counts could not be loaded.",
    );
    onCounts(toCountMap(data.counts ?? []));
  }, [rangeFrom, rangeTo, onCounts]);

  const loadPhotos = useCallback(async (date: string) => {
    const data = await loadJson<{ photos?: AndiPhoto[] }>(
      `/api/andi-photos?date=${date}`,
      "The photos could not be loaded.",
    );
    setPhotos(data.photos ?? []);
  }, []);

  const refreshData = useCallback(async () => {
    setError("");
    let isFresh = true;
    try {
      await Promise.all([loadCounts(), loadPhotos(selectedDate)]);
    } catch (loadError) {
      isFresh = false;
      setError(getErrorMessage(loadError, "An unknown loading error occurred."));
    } finally {
      setIsLoading(false);
      onSynced(isFresh);
    }
  }, [loadCounts, loadPhotos, selectedDate, onSynced]);

  useEffect(() => {
    if (!isActive) return;
    void refreshData();
  }, [isActive, refreshData]);

  // SYNC means every worksheet, this one included even while it is hidden.
  const refreshDataRef = useRef(refreshData);
  refreshDataRef.current = refreshData;
  const initialTokenRef = useRef(refreshToken);
  useEffect(() => {
    if (refreshToken === initialTokenRef.current) return;
    void refreshDataRef.current();
  }, [refreshToken]);

  // Previews are object URLs: whatever is still staged when the tab goes away
  // has to be handed back or the browser holds the bytes for the whole session.
  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  useEffect(
    () => () => {
      stagedRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    },
    [],
  );

  const dropStaged = (key: string) => {
    setStaged((current) => {
      const item = current.find((entry) => entry.key === key);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.key !== key);
    });
  };

  const dropAllStaged = () => {
    setStaged((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  };

  /**
   * Every pick is compressed before it is shown, so the size on the card is the
   * size that will be uploaded — and a picture that cannot be squeezed under the
   * limit is refused here rather than three taps later.
   */
  const pickPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setMessage("");
    setError("");

    const prepared: StagedPhoto[] = [];
    const failures: string[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setPreparing(`${index + 1}/${files.length}`);
      const result = await compressPhoto(file);

      if (result.error) {
        failures.push(result.error);
        continue;
      }

      stagedKey += 1;
      prepared.push({
        key: `staged-${stagedKey}`,
        name: baseName(file.name) || "andi",
        file: result.file,
        originalSize: file.size,
        previewUrl: URL.createObjectURL(result.file),
      });
    }

    setPreparing("");
    if (prepared.length > 0) setStaged((current) => [...current, ...prepared]);
    if (failures.length > 0) setError(failures.join(" · "));
  };

  const renameStaged = (key: string, value: string) => {
    setStaged((current) =>
      current.map((item) =>
        item.key === key ? { ...item, name: cleanNameInput(value) } : item,
      ),
    );
  };

  /** One prefix over the whole batch, numbered in the order they were picked. */
  const applyNumbering = () => {
    setStaged((current) =>
      current.map((item, index) => ({
        ...item,
        name: numberedName(prefix, index, current.length),
      })),
    );
  };

  const uploadStaged = async () => {
    if (staged.length === 0 || uploadProgress) return;

    setMessage("");
    setError("");

    let saved = 0;
    const total = staged.length;

    try {
      // One request per picture: an upload that breaks off halfway leaves the
      // rest staged, so pressing UPLOAD again finishes the batch instead of
      // starting it over.
      for (const item of [...staged]) {
        setUploadProgress(`${saved + 1}/${total}`);

        const payload = new FormData();
        payload.set("date", selectedDate);
        payload.set("name", finalName(item.name, `andi-${selectedDate}`));
        payload.set("file", item.file, item.file.name);

        const response = await fetch("/api/andi-photos", {
          method: "POST",
          body: payload,
        });
        if (!response.ok) {
          throw new Error(
            await readApiError(response, "The photo could not be uploaded."),
          );
        }

        dropStaged(item.key);
        saved += 1;
      }

      setMessage(`${photoCount(saved)} uploaded.`);
    } catch (uploadError) {
      setError(
        `${getErrorMessage(uploadError, "An unknown upload error occurred.")}${
          saved > 0 ? ` (${photoCount(saved)} already uploaded)` : ""
        }`,
      );
    } finally {
      setUploadProgress("");
      await refreshData();
    }
  };

  const saveRename = async (photo: AndiPhoto) => {
    const draft = drafts[photo.id];
    if (draft === undefined) return;

    const next = finalName(draft, `andi-${selectedDate}`);
    if (next === baseName(photo.fileName)) {
      setDrafts((current) => {
        const rest = { ...current };
        delete rest[photo.id];
        return rest;
      });
      return;
    }

    setSavingRenameId(photo.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/andi-photos?id=${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: next }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "The rename failed."));
      }

      const data = (await response.json()) as { photo: AndiPhoto };
      setPhotos((current) =>
        current.map((item) => (item.id === photo.id ? data.photo : item)),
      );
      setDrafts((current) => {
        const rest = { ...current };
        delete rest[photo.id];
        return rest;
      });
      setMessage(`${data.photo.fileName} saved.`);
    } catch (renameError) {
      setError(getErrorMessage(renameError, "The rename failed."));
    } finally {
      setSavingRenameId(null);
    }
  };

  const deletePhoto = async (photo: AndiPhoto) => {
    setIsDeleting(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/andi-photos?id=${photo.id}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(await readApiError(response, "The photo could not be deleted."));
      }

      setPendingDelete(null);
      setMessage(`${photo.fileName} deleted.`);
      await refreshData();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "The photo could not be deleted."));
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;

    setIsDeletingSelection(true);
    setMessage("");
    setError("");

    let removed = 0;
    try {
      for (const id of selectedIds) {
        const response = await fetch(`/api/andi-photos?id=${id}`, {
          method: "DELETE",
        });
        if (!response.ok && response.status !== 404) {
          throw new Error(await readApiError(response, "The delete failed."));
        }
        removed += 1;
      }

      clear();
      setMessage(`${photoCount(removed)} deleted.`);
    } catch (deleteError) {
      setError(
        `${getErrorMessage(deleteError, "The delete failed.")}${
          removed > 0 ? ` (${photoCount(removed)} already deleted)` : ""
        }`,
      );
    } finally {
      setIsDeletingSelection(false);
      await refreshData();
    }
  };

  const downloadSelected = async () => {
    if (selectedIds.length === 0 || isDownloading) return;

    setIsDownloading(true);
    setMessage("");
    setError("");

    try {
      if (format === "zip") {
        const fileName = await downloadSelection(
          "/api/andi-photos/export",
          selectedIds,
          `Andi_${selectedDate}.zip`,
        );
        setMessage(`${fileName} downloaded (${photoCount(selectedIds.length)}).`);
      } else {
        let saved = 0;
        // Plain JPEGs go out one by one under the name each picture carries;
        // there is no archive to unpack at the other end.
        for (const id of selectedIds) {
          const photo = photos.find((item) => item.id === id);
          setDownloadProgress(`${saved + 1}/${selectedIds.length}`);

          const response = await fetch(`/api/andi-photo?id=${id}&download=1`, {
            cache: "no-store",
          });
          if (!response.ok) {
            throw new Error(
              await readApiError(response, "The photo could not be downloaded."),
            );
          }

          saveBlob(await response.blob(), photo?.fileName ?? `andi-${id}.jpg`);
          saved += 1;
        }

        setMessage(`${photoCount(saved)} downloaded as JPEG.`);
      }
    } catch (downloadError) {
      setError(
        getErrorMessage(downloadError, "An unknown download error occurred."),
      );
    } finally {
      setDownloadProgress("");
      setIsDownloading(false);
    }
  };

  const stagedDuplicates = useMemo(
    () => duplicateNames(staged.map((item) => item.name)),
    [staged],
  );
  const galleryDuplicates = useMemo(
    () => duplicateNames(photos.map((photo) => baseName(photo.fileName))),
    [photos],
  );

  const stagedBytes = staged.reduce((total, item) => total + item.file.size, 0);
  const galleryBytes = photos.reduce((total, photo) => total + photo.byteSize, 0);
  const isBusy = !!uploadProgress || !!preparing;
  const tooManyForZip =
    format === "zip" && selectedIds.length > ANDI_MAX_ZIP_ENTRIES;

  return (
    <>
      <section className="saved-panel andi-panel">
        <div className="panel-heading">
          <div>
            <p>ANDI IMPORT / EXPORT</p>
            <h2>{selectedDate.split("-").join(".")}</h2>
          </div>
          <span>
            {photos.length} PHOTO
            {photos.length > 0 && ` · ${formatBytes(galleryBytes)}`}
          </span>
        </div>

        <div className="andi-import">
          <div className="andi-pickers">
            <label className={`andi-pick ${isBusy ? "is-busy" : ""}`}>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M4 8.5h3l1.4-2h7.2L17 8.5h3v10H4zM12 16a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 12 16Z" />
              </svg>
              <b>TAKE PHOTO</b>
              <small>one at a time, as you shoot</small>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={isBusy}
                onChange={(event) => void pickPhotos(event)}
              />
            </label>

            <label className={`andi-pick ${isBusy ? "is-busy" : ""}`}>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M3 6h13v12H3zm4 12 4.5-5 3 3.4M21 4v13m-3-1.5h6" />
              </svg>
              <b>FROM GALLERY</b>
              <small>several photos at once</small>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={isBusy}
                onChange={(event) => void pickPhotos(event)}
              />
            </label>
          </div>

          <p className="andi-hint">
            Every photo is compressed to JPEG, at most {SIZE_LIMIT_KB} KB per photo.
            {preparing && <b> Compressing {preparing}…</b>}
          </p>
        </div>

        {message && <p className="status-message success-message">{message}</p>}
        {error && <p className="status-message error-message">{error}</p>}

        {staged.length > 0 && (
          <div className="andi-stage">
            <div className="andi-stage-head">
              <span>
                WAITING TO UPLOAD · {staged.length} PHOTO ·{" "}
                {formatBytes(stagedBytes)}
              </span>
              <button
                className="modify-button"
                type="button"
                disabled={isBusy}
                onClick={dropAllStaged}
              >
                DISCARD ALL
              </button>
            </div>

            <div className="andi-bulk-rename">
              <label className="andi-bulk-field">
                <span>SERIES NAME</span>
                <input
                  type="text"
                  value={prefix}
                  placeholder="e.g. rack-A"
                  onChange={(event) => setPrefix(cleanNameInput(event.target.value))}
                />
              </label>
              <button
                className="modify-button"
                type="button"
                onClick={applyNumbering}
              >
                NUMBER BATCH
              </button>
            </div>

            <ul className="andi-stage-list">
              {staged.map((item, index) => {
                const isDuplicate = stagedDuplicates.has(
                  finalName(item.name, "").toLowerCase(),
                );

                return (
                  <li className="andi-stage-item" key={item.key}>
                    <img src={item.previewUrl} alt="" />
                    <div className="andi-name-field">
                      <label className="andi-name-input">
                        <input
                          type="text"
                          value={item.name}
                          aria-label={`Name of photo ${index + 1}`}
                          onChange={(event) =>
                            renameStaged(item.key, event.target.value)
                          }
                        />
                        <span>.jpg</span>
                      </label>
                      <span className="andi-size">
                        {formatBytes(item.originalSize)} →{" "}
                        <b>{formatBytes(item.file.size)}</b>
                        {isDuplicate && (
                          <em className="andi-duplicate">same name</em>
                        )}
                      </span>
                    </div>
                    <button
                      className="photo-clear"
                      type="button"
                      disabled={isBusy}
                      onClick={() => dropStaged(item.key)}
                      title="Discard photo"
                      aria-label={`Discard photo ${index + 1}`}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="form-actions andi-actions">
              <span className="pending-count">
                {uploadProgress
                  ? `Uploading ${uploadProgress}`
                  : `${photoCount(staged.length)} waiting to upload`}
              </span>
              <button
                className="save-button"
                type="button"
                disabled={isBusy}
                onClick={() => void uploadStaged()}
              >
                {uploadProgress
                  ? `UPLOADING ${uploadProgress}…`
                  : `UPLOAD (${staged.length})`}
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <div className="andi-toolbar">
          <label className="select-all">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={photos.length === 0}
              onChange={toggleAll}
            />
            <span>SELECT ALL ({photos.length})</span>
          </label>

          <div
            className="andi-format"
            role="group"
            aria-label="Download format"
          >
            <button
              className={format === "jpeg" ? "is-active" : ""}
              type="button"
              aria-pressed={format === "jpeg"}
              onClick={() => setFormat("jpeg")}
            >
              JPEG
            </button>
            <button
              className={format === "zip" ? "is-active" : ""}
              type="button"
              aria-pressed={format === "zip"}
              onClick={() => setFormat("zip")}
            >
              ZIP
            </button>
          </div>

          <button
            className="download-button"
            type="button"
            disabled={selectedIds.length === 0 || isDownloading || tooManyForZip}
            onClick={() => void downloadSelected()}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />
            </svg>
            {isDownloading
              ? format === "zip"
                ? "BUILDING ZIP…"
                : `DOWNLOADING ${downloadProgress}…`
              : `DOWNLOAD${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
          </button>
        </div>

        {selectedIds.length > 0 && (
          <div className="andi-selection-bar">
            <span>
              {photoCount(selectedIds.length)} selected ·{" "}
              {format === "zip"
                ? `in one ZIP file, at most ${ANDI_MAX_ZIP_ENTRIES} photos`
                : "as separate JPEG files"}
              {tooManyForZip && " — select fewer"}
            </span>
            <button
              className="row-delete"
              type="button"
              disabled={isDeletingSelection}
              onClick={() => void deleteSelected()}
              title="Delete selected"
              aria-label="Delete selected photos"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M5 8h14M10 8V5.5h4V8m-7 0 .9 11.5h8.2L17 8M10.6 11v5.6m2.8-5.6v5.6" />
              </svg>
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="record-skeleton" aria-label="Loading photos">
            <i />
            <i />
            <i />
          </div>
        ) : photos.length === 0 ? (
          <div className="empty-state">
            <h3>No photos on this date</h3>
            <p>
              Take a photo with the camera or pick a batch from the gallery,
              rename them, and upload — then take them away as separate JPEGs or
              in one ZIP.
            </p>
          </div>
        ) : (
          <div className="andi-grid">
            {photos.map((photo, index) => {
              const isSelected = selectedIds.includes(photo.id);
              const draft = drafts[photo.id] ?? baseName(photo.fileName);
              const isDirty = draft !== baseName(photo.fileName);
              const isDuplicate = galleryDuplicates.has(
                baseName(photo.fileName).toLowerCase(),
              );

              return (
                <article
                  className={`andi-card ${isSelected ? "is-selected" : ""}`}
                  key={photo.id}
                >
                  <label className="andi-card-select">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(photo.id)}
                    />
                    <span className="visually-hidden">
                      Select {photo.fileName}
                    </span>
                  </label>

                  <button
                    className="andi-thumb"
                    type="button"
                    onClick={() => toggle(photo.id)}
                    aria-label={`Select ${photo.fileName}`}
                  >
                    <img
                      src={`/api/andi-photo?id=${photo.id}`}
                      alt=""
                      loading="lazy"
                    />
                    <b>{index + 1}</b>
                  </button>

                  <div className="andi-name-field">
                    <label className="andi-name-input">
                      <input
                        type="text"
                        value={draft}
                        aria-label={`Rename ${photo.fileName}`}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [photo.id]: cleanNameInput(event.target.value),
                          }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void saveRename(photo);
                          }
                        }}
                        onBlur={() => void saveRename(photo)}
                      />
                      <span>.{photo.fileName.split(".").pop()}</span>
                    </label>
                    <span className="andi-size">
                      {formatBytes(photo.byteSize)}
                      {isDirty && <em className="andi-dirty">not saved</em>}
                      {!isDirty && isDuplicate && (
                        <em className="andi-duplicate">same name</em>
                      )}
                    </span>
                  </div>

                  <div className="andi-card-actions">
                    <button
                      className="modify-button"
                      type="button"
                      disabled={savingRenameId === photo.id}
                      onClick={() => void saveRename(photo)}
                    >
                      {savingRenameId === photo.id
                        ? "SAVING…"
                        : isDirty
                          ? "RENAME"
                          : "NAME OK"}
                    </button>
                    <button
                      className="row-delete"
                      type="button"
                      onClick={() => setPendingDelete(photo)}
                      title={`Delete ${photo.fileName}`}
                      aria-label={`Delete ${photo.fileName}`}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d="M5 8h14M10 8V5.5h4V8m-7 0 .9 11.5h8.2L17 8M10.6 11v5.6m2.8-5.6v5.6" />
                      </svg>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {pendingDelete && (
        <ConfirmDialog
          title="Are you sure you want to delete?"
          message={`${pendingDelete.fileName} is removed for good.`}
          busyLabel="DELETING…"
          isBusy={isDeleting}
          onConfirm={() => void deletePhoto(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
