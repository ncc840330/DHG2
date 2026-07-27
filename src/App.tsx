import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeletionRequestTab from "./DeletionRequestTab";
import DhgTab from "./DhgTab";
import { DAY_OFFSETS, formatShortDate, getDate, getDateKey } from "./lib";
import "./styles.css";

type Sheet = "dhg" | "deletion";

const SHEETS: { id: Sheet; label: string }[] = [
  { id: "dhg", label: "ADD DHG" },
  { id: "deletion", label: "DELETION REQUEST" },
];

export default function App() {
  const dates = useMemo(
    () => DAY_OFFSETS.map((offset) => ({ date: getDate(offset) })),
    [],
  );
  const todayKey = getDateKey(getDate());
  const firstDateKey = getDateKey(dates[0].date);
  const [activeSheet, setActiveSheet] = useState<Sheet>("dhg");
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [counts, setCounts] = useState<Record<Sheet, Record<string, number>>>({
    dhg: {},
    deletion: {},
  });
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastSync, setLastSync] = useState(() => new Date());
  /** Worksheets still fetching after a SYNC press, so the button can say so. */
  const [pendingSheets, setPendingSheets] = useState(0);
  const todayButtonRef = useRef<HTMLButtonElement>(null);
  const dateStripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dateStrip = dateStripRef.current;
    if (dateStrip) dateStrip.scrollLeft = dateStrip.scrollWidth;
    todayButtonRef.current?.focus({ preventScroll: true });
  }, []);

  const handleDhgCounts = useCallback((next: Record<string, number>) => {
    setCounts((current) => ({ ...current, dhg: next }));
  }, []);

  const handleDeletionCounts = useCallback((next: Record<string, number>) => {
    setCounts((current) => ({ ...current, deletion: next }));
  }, []);

  const handleSynced = useCallback((isFresh = true) => {
    // A refresh that failed leaves the data as stale as it was, so the
    // timestamp must not move — but the button has to come back either way.
    if (isFresh) setLastSync(new Date());
    setPendingSheets((count) => Math.max(0, count - 1));
  }, []);

  const syncNow = useCallback(() => {
    setPendingSheets(SHEETS.length);
    setRefreshToken((token) => token + 1);
  }, []);

  const isSyncing = pendingSheets > 0;

  const activeCounts = counts[activeSheet];

  const tabProps = {
    selectedDate,
    rangeFrom: firstDateKey,
    rangeTo: todayKey,
    refreshToken,
    onSynced: handleSynced,
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="app-kicker">DISCREPANCY HANDLING</p>
        <button
          className={isSyncing ? "sync-button is-syncing" : "sync-button"}
          type="button"
          aria-busy={isSyncing}
          onClick={syncNow}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M20 7v5h-5M4 17v-5h5" />
            <path d="M6.1 9a7 7 0 0 1 11.7-2.1L20 9M4 15l2.2 2.1A7 7 0 0 0 17.9 15" />
          </svg>
          <span>{isSyncing ? "SYNCING…" : "SYNC"}</span>
          <time dateTime={lastSync.toISOString()}>
            {lastSync.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </time>
        </button>
      </header>

      <section className="date-section" aria-label="Date selector">
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
                {(activeCounts[dateKey] ?? 0) > 0 && <b>{activeCounts[dateKey]}</b>}
              </button>
            );
          })}
        </div>
      </section>

      <div className="workbook">
        <div className="workbook-tabs" role="tablist" aria-label="Worksheets">
          {SHEETS.map((sheet) => (
            <button
              key={sheet.id}
              id={`tab-${sheet.id}`}
              className={activeSheet === sheet.id ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={activeSheet === sheet.id}
              aria-controls={`sheet-${sheet.id}`}
              onClick={() => setActiveSheet(sheet.id)}
            >
              {sheet.label}
              {(counts[sheet.id][selectedDate] ?? 0) > 0 && (
                <b>{counts[sheet.id][selectedDate]}</b>
              )}
            </button>
          ))}
        </div>

        <div
          className="workbook-sheet"
          id="sheet-dhg"
          role="tabpanel"
          aria-labelledby="tab-dhg"
          hidden={activeSheet !== "dhg"}
        >
          <DhgTab
            {...tabProps}
            isActive={activeSheet === "dhg"}
            onCounts={handleDhgCounts}
          />
        </div>

        <div
          className="workbook-sheet"
          id="sheet-deletion"
          role="tabpanel"
          aria-labelledby="tab-deletion"
          hidden={activeSheet !== "deletion"}
        >
          <DeletionRequestTab
            {...tabProps}
            isActive={activeSheet === "deletion"}
            onCounts={handleDeletionCounts}
          />
        </div>
      </div>
    </main>
  );
}
