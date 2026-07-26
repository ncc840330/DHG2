import { useCallback, useEffect, useRef, useState } from "react";
import "./styles.css";

const TABS = ["Add DHG", "Export DHG", "Deletion request", "Export"];
const DAY_OFFSETS = Array.from({ length: 15 }, (_, index) => index - 14);

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

function formatDate(date: Date) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function getDayCaption(offset: number) {
  if (offset === 0) return "TODAY";
  return new Intl.DateTimeFormat("en-US", { weekday: "short" })
    .format(getDate(offset))
    .toUpperCase();
}

export default function App() {
  const [syncRevision, setSyncRevision] = useState(0);
  const [lastSync, setLastSync] = useState(() => new Date());
  const dates = DAY_OFFSETS.map((offset) => ({
    offset,
    date: getDate(offset),
  }));
  const todayKey = getDateKey(getDate());
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const todayButtonRef = useRef<HTMLButtonElement>(null);
  const dateStripRef = useRef<HTMLDivElement>(null);

  const syncNow = useCallback(() => {
    setLastSync(new Date());
    setSyncRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    const dateStrip = dateStripRef.current;
    if (!dateStrip) return;

    dateStrip.scrollLeft = dateStrip.scrollWidth;
    todayButtonRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const syncInterval = window.setInterval(syncNow, 120_000);
    return () => window.clearInterval(syncInterval);
  }, [syncNow]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-kicker">DISCREPANCY HANDLING</p>
          <h1>DHG</h1>
        </div>
        <div className="header-actions">
          <div className="sync-control">
            <button
              className="sync-button"
              type="button"
              aria-label="Sync now"
              title="Sync now"
              onClick={syncNow}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M20 7v5h-5M4 17v-5h5" />
                <path d="M6.1 9a7 7 0 0 1 11.7-2.1L20 9M4 15l2.2 2.1A7 7 0 0 0 17.9 15" />
              </svg>
            </button>
            <time key={syncRevision} className="sync-time" dateTime={lastSync.toISOString()}>
              {lastSync.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </time>
          </div>
          <div className="live-status" aria-label="Live status">
            <span className="live-dot" />
            LIVE
          </div>
        </div>
      </header>

      <nav className="tab-bar" aria-label="Main sections">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`tab-button ${activeTab === tab ? "is-active" : ""}`}
            type="button"
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <section className="date-section" aria-label="Date selector">
        <div className="date-heading">
          <span>DATE</span>
          <span className="date-heading-line" />
        </div>

        <div className="date-strip" ref={dateStripRef}>
          {dates.map(({ date, offset }) => {
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
                <span className="date-value">{formatDate(date)}</span>
                <span className="date-caption">{getDayCaption(offset)}</span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
