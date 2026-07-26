import { useCallback, useMemo, useState } from "react";
import DeletionRequestTab from "./DeletionRequestTab";
import DhgTab from "./DhgTab";
import { getDate, getDateKey } from "./lib";
import "./styles.css";

type Sheet = "dhg" | "deletion";

const SHEETS: { id: Sheet; label: string }[] = [
  { id: "dhg", label: "ADD DHG" },
  { id: "deletion", label: "CREATE DELETION REQUEST" },
];

export default function App() {
  // Everything is filed against today; there is no work date to pick anymore.
  const workDate = useMemo(() => getDateKey(getDate()), []);
  const [activeSheet, setActiveSheet] = useState<Sheet>("dhg");
  const [counts, setCounts] = useState<Record<Sheet, number>>({
    dhg: 0,
    deletion: 0,
  });
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastSync, setLastSync] = useState(() => new Date());

  const handleDhgCount = useCallback((count: number) => {
    setCounts((current) => ({ ...current, dhg: count }));
  }, []);

  const handleDeletionCount = useCallback((count: number) => {
    setCounts((current) => ({ ...current, deletion: count }));
  }, []);

  const handleSynced = useCallback(() => setLastSync(new Date()), []);

  const tabProps = { workDate, refreshToken, onSynced: handleSynced };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-kicker">DISCREPANCY HANDLING</p>
          <h1>DHG</h1>
        </div>
        <button
          className="sync-button"
          type="button"
          onClick={() => setRefreshToken((token) => token + 1)}
        >
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
              {counts[sheet.id] > 0 && <b>{counts[sheet.id]}</b>}
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
            onCount={handleDhgCount}
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
            onCount={handleDeletionCount}
          />
        </div>
      </div>
    </main>
  );
}
