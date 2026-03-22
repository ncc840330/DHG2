import { useState, useEffect, useRef } from "react";

const FIREBASE_URL = "https://tatai-tracker-default-rtdb.firebaseio.com";
const WAREHOUSES = ["Győr", "Komárom-Huawei", "KMRM2", "Komárom-Nokia"];
const TRAILER_NAMES = [
  "Standby Trailer 1",
  "Standby Trailer 2",
  "Standby Trailer 3",
];
const TRAILER_STATUSES = [
  "rakodásra vár",
  "rakodás alatt",
  "szedés alatt",
  "szedésre vár",
  "indulásra kész - rakodva",
  "indulásra kész - üres",
];
const TRUCK_LOAD_KEYS = ["üres", "teli"];

const HOURS = Array.from(
  { length: 19 },
  (_, i) => `${String(i + 5).padStart(2, "0")}:00`
); // 05:00–23:00
const FUVAR_COUNTS = ["1", "2", "3", "4", "5"];

const T = {
  hu: {
    appSub: "LOGISZTIKAI NYOMKÖVETŐ",
    live: "ÉLŐ",
    loading: "Betöltés...",
    overview: "📊 Áttekintés",
    route: "🗺️ Útvonal terv",
    fuvarTab: "🚚 Fuvar igény",
    noData: "Még nincs adat",
    standbyTrailers: "Standby Trailerek",
    status: "Állapot",
    location: "Helyszín",
    save: "Mentés",
    saved: "✓ Mentve",
    since: "óta",
    updatedAt: "Frissítve",
    dailyPlan: "Napi terv",
    editPlan: "✏️ Szerkesztés",
    savePlan: "💾 Mentés",
    cancel: "Mégse",
    lockStart: "🔒 Terv zárolása",
    reset: "🔄 Reset",
    todayRoute: "Mai útvonal",
    planningTitle: "Szerkesztés",
    clickWarehouses: "Kattints a raktárakra a sorrendhez:",
    futurePlan: "Ez a terv a jövő napra van előkészítve.",
    noPlan: "Még nincs útvonal tervezve erre a napra.",
    arrived: "Érkezett",
    loadingBtn: "Rakodás",
    departed: "Indult",
    revert: "↩ Visszavon",
    truckLoad: "Kamion rakodottsága",
    empty: "Üres",
    full: "Teli",
    today: "MA",
    tomorrow: "HOLNAP",
    stops: "stop",
    replaceLocation: "Csere helyszín:",
    insertBefore: "Elé szúr:",
    insertAfter: "Alá szúr:",
    insertConfirm: "✓",
    fuvarTitle: "Fuvar igények",
    fuvarCreate: "Fuvar létrehozása",
    fuvarDraftTitle: "📋 Vázlat – még nem mentve",
    fuvarSavedTitle: "Mentett fuvarok",
    fuvarSave: "💾 Véglegesítés",
    fuvarSaved: "✓ Mentve",
    fuvarUpdated: "Frissítve",
    fuvarFrom: "Honnan",
    fuvarTo: "Hova",
    fuvarUrgent: "⚡ Sürgős",
    fuvarTimeFrom: "Időablak ettől",
    fuvarTimeTo: "Időablak eddig",
    fuvarAdd: "➕ Hozzáadás",
    fuvarNoData: "Még nincs fuvar igény leadva.",
    addCargo: "📦 Rakomány",
    cargoModalTitle: "Rakomány hozzáadása",
    cargoScan: "Szkennelj vagy írj be egy tételt...",
    cargoSave: "💾 Mentés",
    cargoClear: "🗑️ Lista ürítés",
    cargoUpdated: "Frissítve",
    cargoEmpty: "Nincs rakomány rögzítve.",
    s_rakodasravar: "rakodásra vár",
    s_rakodas: "rakodás alatt",
    s_szedes: "szedés alatt",
    s_szedesvar: "szedésre vár",
    s_indulas_rakodva: "indulásra kész - rakodva",
    s_indulas_ures: "indulásra kész - üres",
    ss_varja: "várja",
    ss_erkezett: "érkezett",
    ss_rakodas: "rakodás alatt",
    ss_indult: "indult",
    ts_uton: "úton",
    ts_allomásozik: "állomásozik",
    ts_vár: "beállításra vár",
  },
  en: {
    appSub: "LOGISTICS TRACKER",
    live: "LIVE",
    loading: "Loading...",
    overview: "📊 Overview",
    route: "🗺️ Route Plan",
    fuvarTab: "🚚 Transport Request",
    standbyTrailers: "Standby Trailers",
    status: "Status",
    location: "Location",
    save: "Save",
    saved: "✓ Saved",
    since: "ago",
    updatedAt: "Updated",
    dailyPlan: "Daily plan",
    editPlan: "✏️ Edit",
    savePlan: "💾 Save",
    cancel: "Cancel",
    lockStart: "🔒 Lock plan",
    reset: "🔄 Reset",
    todayRoute: "Today's route",
    planningTitle: "Edit",
    clickWarehouses: "Click warehouses to build route:",
    futurePlan: "This plan is prepared for a future day.",
    noPlan: "No route planned for this day yet.",
    arrived: "Arrived",
    loadingBtn: "Loading",
    departed: "Departed",
    revert: "↩ Undo",
    truckLoad: "Truck load",
    empty: "Empty",
    full: "Loaded",
    today: "TODAY",
    tomorrow: "TOMORROW",
    stops: "stops",
    noData: "No data yet",
    replaceLocation: "Replace location:",
    insertBefore: "Insert before:",
    insertAfter: "Insert after:",
    insertConfirm: "✓",
    fuvarTitle: "Transport Requests",
    fuvarCreate: "New request",
    fuvarDraftTitle: "📋 Draft – not saved yet",
    fuvarSavedTitle: "Saved requests",
    fuvarSave: "💾 Save all",
    fuvarSaved: "✓ Saved",
    fuvarUpdated: "Updated",
    fuvarFrom: "From",
    fuvarTo: "To",
    fuvarUrgent: "⚡ Urgent",
    fuvarTimeFrom: "Time from",
    fuvarTimeTo: "Time to",
    fuvarAdd: "➕ Add",
    fuvarNoData: "No transport requests yet.",
    addCargo: "📦 Cargo",
    cargoModalTitle: "Add cargo",
    cargoScan: "Scan or type an item...",
    cargoSave: "💾 Save",
    cargoClear: "🗑️ Clear list",
    cargoUpdated: "Updated",
    cargoEmpty: "No cargo recorded.",
    s_rakodasravar: "waiting load",
    s_rakodas: "loading",
    s_szedes: "picking",
    s_szedesvar: "waiting pick",
    s_indulas_rakodva: "ready to go - loaded",
    s_indulas_ures: "ready to go - empty",
    ss_varja: "waiting",
    ss_erkezett: "arrived",
    ss_rakodas: "loading",
    ss_indult: "departed",
    ts_uton: "on the way",
    ts_allomásozik: "stationed",
    ts_vár: "pending setup",
  },
};

function trStatus(key, l) {
  const map = {
    "rakodásra vár": l.s_rakodasravar,
    "rakodás alatt": l.s_rakodas,
    "szedés alatt": l.s_szedes,
    "szedésre vár": l.s_szedesvar,
    "indulásra kész - rakodva": l.s_indulas_rakodva,
    "indulásra kész - üres": l.s_indulas_ures,
    várja: l.ss_varja,
    érkezett: l.ss_erkezett,
    indult: l.ss_indult,
    úton: l.ts_uton,
    állomásozik: l.ts_allomásozik,
    "beállításra vár": l.ts_vár,
    teli: l.full,
    üres: l.empty,
  };
  return map[key] || key;
}
function trStopStatus(key, l) {
  if (key === "rakodás alatt") return l.ss_rakodas;
  return trStatus(key, l);
}

function getDateKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
function formatDateLabel(k) {
  if (!k || !k.includes("-")) return "—";
  const [y, m, d] = k.split("-");
  return `${y.slice(2)}.${m}.${d}`;
}
function getTodayKey() {
  return getDateKey(0);
}

const initialDayPlan = () => ({
  plannedRoute: [],
  route: [],
  routeLocked: false,
  status: "beállításra vár",
  location: "—",
  departure: null,
});
function getFuvarDays() {
  return [1, 2, 3, 4].map((i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
const initialTrailerState = () => ({
  "Standby Trailer 1": {
    status: "rakodásra vár",
    location: "Győr",
    lastUpdated: null,
  },
  "Standby Trailer 2": {
    status: "rakodásra vár",
    location: "Győr",
    lastUpdated: null,
  },
  "Standby Trailer 3": {
    status: "rakodásra vár",
    location: "Győr",
    lastUpdated: null,
  },
});
const initialFuvarDay = () => ({
  rows: WAREHOUSES.map((w) => ({
    warehouse: w,
    count: "",
    urgent: false,
    timeFrom: "",
    timeTo: "",
    savedAt: null,
  })),
});

async function fbGet(path) {
  try {
    const r = await fetch(`${FIREBASE_URL}/${path}.json`);
    return await r.json();
  } catch {
    return null;
  }
}
async function fbSet(path, data) {
  try {
    await fetch(`${FIREBASE_URL}/${path}.json`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  } catch {}
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("hu-HU", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function formatDuration(ms) {
  if (!ms || ms < 0) return "—";
  const mins = Math.floor(ms / 60000),
    h = Math.floor(mins / 60),
    m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function formatSince(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return null;
  const mins = Math.floor(ms / 60000),
    hours = Math.floor(mins / 60),
    days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

function TimeDisplay({ iso, label }) {
  if (!iso) return null;
  const d = new Date(iso);
  const time = d.toLocaleString("hu-HU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = d.toLocaleString("hu-HU", { month: "2-digit", day: "2-digit" });
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        marginRight: 14,
      }}
    >
      <span
        style={{
          color: "#6b7280",
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: "#e2e8f0",
          fontSize: 17,
          fontWeight: 700,
          lineHeight: 1.1,
        }}
      >
        {time}
      </span>
      <span style={{ color: "#6b7280", fontSize: 10 }}>{date}</span>
    </div>
  );
}

function StatusBadge({ statusKey, l }) {
  const colors = {
    teli: { bg: "#f59e0b", color: "#0f1117" },
    üres: { bg: "#2a2d3a", color: "#94a3b8" },
    "rakodásra vár": { bg: "#eab308", color: "#0f1117" },
    "rakodás alatt": { bg: "#3b82f6", color: "#fff" },
    "szedés alatt": { bg: "#8b5cf6", color: "#fff" },
    "szedésre vár": { bg: "#f97316", color: "#fff" },
    "indulásra kész - rakodva": { bg: "#10b981", color: "#fff" },
    "indulásra kész - üres": { bg: "#6b7280", color: "#fff" },
    érkezett: { bg: "#10b981", color: "#fff" },
    úton: { bg: "#3b82f6", color: "#fff" },
    állomásozik: { bg: "#10b981", color: "#fff" },
    "beállításra vár": { bg: "#374151", color: "#94a3b8" },
    indult: { bg: "#10b981", color: "#fff" },
    várja: { bg: "#374151", color: "#94a3b8" },
  };
  const s = colors[statusKey] || { bg: "#2a2d3a", color: "#94a3b8" };
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 1,
      }}
    >
      {trStatus(statusKey, l)}
    </span>
  );
}

const LABEL = {
  color: "#f59e0b",
  fontSize: 11,
  letterSpacing: 2,
  textTransform: "uppercase",
  marginBottom: 8,
  display: "block",
};

function CargoModal({ name, cargoData, onSave, onClear, onClose, l }) {
  const [items, setItems] = useState(
    cargoData?.items ? [...cargoData.items] : []
  );
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const addItem = (val) => {
    const text = val.trim();
    if (!text) return;
    if (items.some((i) => i.text === text)) {
      alert(`⚠️ Már scannelve: ${text}`);
      setInputVal("");
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    const now = new Date().toISOString();
    setItems((prev) => [...prev, { text, scannedAt: now }]);
    setInputVal("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addItem(inputVal);
    }
  };

  const removeItem = (idx) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#1a1d2e",
          border: "1px solid #f59e0b",
          borderRadius: 12,
          width: "100%",
          maxWidth: 460,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #2a2d3a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                color: "#f59e0b",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: 1,
              }}
            >
              {l.cargoModalTitle}
            </div>
            <div style={{ color: "#4a5568", fontSize: 11, marginTop: 2 }}>
              {name}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#4a5568",
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Scan input */}
        <div
          style={{ padding: "12px 16px", borderBottom: "1px solid #2a2d3a" }}
        >
          <input
            ref={inputRef}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={l.cargoScan}
            style={{
              width: "100%",
              background: "#0f1117",
              border: "1px solid #f59e0b",
              borderRadius: 8,
              padding: "10px 12px",
              color: "#e2e8f0",
              fontSize: 13,
              fontFamily: "inherit",
              boxSizing: "border-box",
              outline: "none",
            }}
          />
          <div
            style={{
              color: "#4a5568",
              fontSize: 10,
              marginTop: 6,
              textAlign: "center",
            }}
          >
            Enter = automatikus hozzáadás
          </div>
        </div>

        {/* Item list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
          {items.length === 0 ? (
            <div
              style={{
                color: "#4a5568",
                fontSize: 12,
                textAlign: "center",
                padding: "20px 0",
              }}
            >
              {l.cargoEmpty}
            </div>
          ) : (
            [...items].reverse().map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 0",
                  borderBottom: "1px solid #2a2d3a22",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#e2e8f0", fontSize: 13 }}>
                    {item.text}
                  </div>
                </div>
                <button
                  onClick={() => removeItem(items.length - 1 - idx)}
                  style={{
                    background: "#ef444422",
                    border: "1px solid #ef4444",
                    color: "#ef4444",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 6,
                  }}
                >
                  Törlés
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid #2a2d3a",
            display: "flex",
            gap: 8,
          }}
        >
          <button
            onClick={() => {
              if (window.confirm("Biztosan törlöd az összes rakományt?")) {
                onClear();
                onClose();
              }
            }}
            style={{
              background: "#1e2130",
              border: "1px solid #ef4444",
              color: "#ef4444",
              borderRadius: 8,
              padding: "9px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {l.cargoClear}
          </button>
          <button
            onClick={() => {
              const text = [...items]
                .reverse()
                .map((i) => i.text)
                .join("\n");
              navigator.clipboard.writeText(text);
            }}
            disabled={items.length === 0}
            style={{
              background: "#1e2130",
              border: "1px solid #06b6d4",
              color: items.length > 0 ? "#06b6d4" : "#2a2d3a",
              borderRadius: 8,
              padding: "9px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: items.length > 0 ? "pointer" : "not-allowed",
            }}
          >
            📋 Másolás
          </button>
          <button
            onClick={() => {
              onSave(items);
              onClose();
            }}
            style={{
              flex: 1,
              background: "#f59e0b",
              border: "none",
              color: "#0f1117",
              borderRadius: 8,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {l.cargoSave}
          </button>
        </div>
      </div>
    </div>
  );
}

function FuvarModal({ onClose, onAdd, l }) {
  const emptyForm = {
    from: "",
    to: "",
    via: [],
    urgent: false,
    timeFrom: "",
    timeTo: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [added, setAdded] = useState([]);

  const canAdd = form.from && form.to && form.from !== form.to;

  const handleAdd = () => {
    if (!canAdd) return;
    setAdded((prev) => [...prev, form]);
    setForm(emptyForm);
  };

  const handleDone = () => {
    added.forEach((item) => onAdd(item));
    onClose();
  };

  const addVia = () => setForm((p) => ({ ...p, via: [...p.via, ""] }));
  const setVia = (i, val) =>
    setForm((p) => ({
      ...p,
      via: p.via.map((v, idx) => (idx === i ? val : v)),
    }));
  const removeVia = (i) =>
    setForm((p) => ({ ...p, via: p.via.filter((_, idx) => idx !== i) }));

  const OPTIONAL = {
    color: "#e2e8f0",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  };
  const REQUIRED = {
    color: "#f59e0b",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#1a1d2e",
          border: "1px solid #f59e0b",
          borderRadius: 12,
          width: "100%",
          maxWidth: 460,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #2a2d3a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              color: "#f59e0b",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: 1,
            }}
          >
            {l.fuvarCreate}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#4a5568",
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <div
          style={{
            overflowY: "auto",
            flex: 1,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Honnan / Hova */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <div>
              <div style={REQUIRED}>{l.fuvarFrom}</div>
              <select
                className="select-dark"
                value={form.from}
                onChange={(e) =>
                  setForm((p) => ({ ...p, from: e.target.value }))
                }
              >
                <option value="">— válassz —</option>
                {WAREHOUSES.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={REQUIRED}>{l.fuvarTo}</div>
              <select
                className="select-dark"
                value={form.to}
                onChange={(e) => setForm((p) => ({ ...p, to: e.target.value }))}
              >
                <option value="">— válassz —</option>
                {WAREHOUSES.filter((w) => w !== form.from).map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Köztes megállók */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {form.via.map((v, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "flex-end", gap: 8 }}
              >
                <div style={{ flex: 1 }}>
                  {i === 0 && (
                    <div style={OPTIONAL}>Köztes megálló (opcionális)</div>
                  )}
                  <select
                    className="select-dark"
                    value={v}
                    onChange={(e) => setVia(i, e.target.value)}
                  >
                    <option value="">— válassz —</option>
                    {WAREHOUSES.filter(
                      (w) => w !== form.from && w !== form.to
                    ).map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => removeVia(i)}
                  style={{
                    background: "#ef444422",
                    border: "1px solid #ef4444",
                    color: "#ef4444",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 13,
                    cursor: "pointer",
                    marginBottom: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={addVia}
              style={{
                background: "transparent",
                border: "1px dashed #06b6d4",
                color: "#06b6d4",
                borderRadius: 6,
                padding: "7px",
                fontSize: 11,
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              + Köztes megálló hozzáadása
            </button>
          </div>

          {/* Időablak */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <div>
              <div style={OPTIONAL}>{l.fuvarTimeFrom} (opcionális)</div>
              <select
                className="select-dark"
                value={form.timeFrom}
                onChange={(e) =>
                  setForm((p) => ({ ...p, timeFrom: e.target.value }))
                }
              >
                <option value="">—</option>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={OPTIONAL}>{l.fuvarTimeTo} (opcionális)</div>
              <select
                className="select-dark"
                value={form.timeTo}
                onChange={(e) =>
                  setForm((p) => ({ ...p, timeTo: e.target.value }))
                }
              >
                <option value="">—</option>
                {HOURS.filter((h) => !form.timeFrom || h > form.timeFrom).map(
                  (h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {/* Sürgős */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={form.urgent}
              onChange={(e) =>
                setForm((p) => ({ ...p, urgent: e.target.checked }))
              }
              style={{ accentColor: "#ef4444", width: 16, height: 16 }}
            />
            <span style={{ color: "#ef4444", fontSize: 12, fontWeight: 700 }}>
              {l.fuvarUrgent} (opcionális)
            </span>
          </label>

          {/* Add gomb */}
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            style={{
              background: canAdd ? "#f59e0b" : "#2a2d3a",
              border: "none",
              color: canAdd ? "#0f1117" : "#4a5568",
              borderRadius: 8,
              padding: "10px",
              fontSize: 13,
              fontWeight: 700,
              cursor: canAdd ? "pointer" : "not-allowed",
            }}
          >
            {l.fuvarAdd}
          </button>

          {/* Hozzáadott lista */}
          {added.length > 0 && (
            <div style={{ borderTop: "1px solid #2a2d3a", paddingTop: 10 }}>
              <div
                style={{
                  color: "#4a5568",
                  fontSize: 10,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Hozzáadva ({added.length})
              </div>
              {added.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 0",
                    borderBottom: "1px solid #2a2d3a22",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        color: "#e2e8f0",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {item.from}
                      {item.via?.filter(Boolean).map((v, i) => (
                        <span key={i}>
                          {" "}
                          → <span style={{ color: "#06b6d4" }}>{v}</span>
                        </span>
                      ))}
                      {" → "}
                      {item.to}
                      {item.urgent && (
                        <span
                          style={{
                            marginLeft: 6,
                            color: "#ef4444",
                            fontSize: 10,
                          }}
                        >
                          ⚡
                        </span>
                      )}
                    </div>
                    {(item.timeFrom || item.timeTo) && (
                      <div
                        style={{ color: "#4a5568", fontSize: 11, marginTop: 2 }}
                      >
                        🕐 {item.timeFrom || "—"} – {item.timeTo || "—"}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      setAdded((prev) => prev.filter((_, i) => i !== idx))
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: 16,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #2a2d3a" }}>
          <button
            onClick={handleDone}
            disabled={added.length === 0}
            style={{
              width: "100%",
              background: added.length > 0 ? "#10b981" : "#2a2d3a",
              border: "none",
              color: added.length > 0 ? "#fff" : "#4a5568",
              borderRadius: 8,
              padding: "10px",
              fontSize: 13,
              fontWeight: 700,
              cursor: added.length > 0 ? "pointer" : "not-allowed",
            }}
          >
            Vázlathoz adás – {added.length} fuvar →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState("hu");
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [trailers, setTrailers] = useState(initialTrailerState());
  const [days, setDays] = useState({});
  const [fuvarDraft, setFuvarDraft] = useState([]); // [{from,to,urgent,timeFrom,timeTo}]
  const [fuvarSaved, setFuvarSaved] = useState([]);
  const [fuvarSavedAt, setFuvarSavedAt] = useState(null);
  const [fuvarModal, setFuvarModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(getTodayKey());
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loaded, setLoaded] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pendingTrailers, setPendingTrailers] = useState({});
  const [dirtyTrailers, setDirtyTrailers] = useState({});
  const [savedTrailers, setSavedTrailers] = useState({});
  const [tick, setTick] = useState(0);
  const [editingPlan, setEditingPlan] = useState(null);
  const [replacingStop, setReplacingStop] = useState(null);
  const [insertingStop, setInsertingStop] = useState(null); // {dateKey, index, direction:"before"|"after", pending:null}
  const [cargoModal, setCargoModal] = useState(null); // trailerName | null
  const [cargoInputs, setCargoInputs] = useState({}); // {trailerName: [{text, scannedAt}]}
  const scanInputRef = useRef(null);
  const midnightRef = useRef(null);
  const l = T[lang];

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const go = () => {
      const now = new Date(),
        tom = new Date(now);
      tom.setDate(tom.getDate() + 1);
      tom.setHours(0, 0, 0, 0);
      midnightRef.current = setTimeout(() => {
        setSelectedDay(getTodayKey());
        go();
      }, tom - now);
    };
    go();
    return () => clearTimeout(midnightRef.current);
  }, []);
  const syncNow = async () => {
    const t = await fbGet("trailers");
    if (t) setTrailers(t);
    const d = await fbGet("days");
    if (d) setDays(d);
    const tc = await fbGet("trailerCargo");
    if (tc) setCargoInputs(tc);
    const fs = await fbGet("fuvarRequests");
    if (fs) {
      setFuvarSaved(fs.items || []);
      setFuvarSavedAt(fs.savedAt || null);
    }
    setLastSync(new Date().toISOString());
  };
  useEffect(() => {
    const load = async () => {
      await syncNow();
      setLoaded(true);
    };
    load();
    const iv = setInterval(syncNow, 60000);
    return () => clearInterval(iv);
  }, []);

  const today = getTodayKey();
  const dayKeys = [0, 1, 2, 3].map((i) => getDateKey(i));
  const todayPlan = days[today] || initialDayPlan();

  const saveDayPlan = async (dk, plan) => {
    const nd = { ...days, [dk]: plan };
    setDays(nd);
    await fbSet("days", nd);
  };
  const saveTrailers = async (ns) => {
    setTrailers(ns);
    await fbSet("trailers", ns);
  };

  // Fuvar handlers
  const saveFuvarDraft = async () => {
    const now = new Date().toISOString();
    const merged = [...fuvarSaved, ...fuvarDraft];
    const sorted = merged.sort(
      (a, b) => WAREHOUSES.indexOf(a.from) - WAREHOUSES.indexOf(b.from)
    );
    const updated = { items: sorted, savedAt: now };
    setFuvarSaved(sorted);
    setFuvarSavedAt(now);
    setFuvarDraft([]);
    await fbSet("fuvarRequests", updated);
  };
  const deleteFuvarItem = async (idx) => {
    const newItems = fuvarSaved.filter((_, i) => i !== idx);
    const now = new Date().toISOString();
    setFuvarSaved(newItems);
    setFuvarSavedAt(now);
    await fbSet("fuvarRequests", { items: newItems, savedAt: now });
  };
  const editFuvarItem = (idx, updated) => {
    setFuvarSaved((prev) => prev.map((x, i) => (i === idx ? updated : x)));
  };

  const handleTrailerChange = (name, field, value) => {
    const current = trailers[name] || {
      status: TRAILER_STATUSES[0],
      location: WAREHOUSES[0],
    };
    setPendingTrailers((prev) => ({
      ...prev,
      [name]: {
        ...(prev[name] || {
          status: current.status,
          location: current.location,
        }),
        [field]: value,
      },
    }));
    setDirtyTrailers((prev) => ({ ...prev, [name]: true }));
    setSavedTrailers((prev) => ({ ...prev, [name]: false }));
  };
  const submitTrailer = async (name) => {
    const pending = pendingTrailers[name];
    if (!pending) return;
    const now = new Date().toISOString();
    const old = trailers[name] || {
      status: TRAILER_STATUSES[0],
      location: WAREHOUSES[0],
      lastUpdated: null,
    };
    await saveTrailers({
      ...trailers,
      [name]: { ...old, ...pending, lastUpdated: now },
    });
    if (pending.status && pending.status !== old.status) {
    }
    setDirtyTrailers((prev) => ({ ...prev, [name]: false }));
    setSavedTrailers((prev) => ({ ...prev, [name]: true }));
    setPendingTrailers((prev) => {
      const n = { ...prev };
      delete n[name];
      return n;
    });
  };

  const saveCargo = async (name, items) => {
    const now = new Date().toISOString();
    const updated = { ...cargoInputs, [name]: { items, savedAt: now } };
    setCargoInputs(updated);
    await fbSet("trailerCargo", updated);
  };

  const clearCargo = async (name) => {
    const updated = { ...cargoInputs, [name]: null };
    setCargoInputs(updated);
    await fbSet("trailerCargo", updated);
  };

  const startEditing = (dk) => {
    const plan = days[dk] || initialDayPlan();
    setEditingPlan({
      dateKey: dk,
      plannedRoute: [...(plan.plannedRoute || [])],
    });
  };
  const addToEditingRoute = (w) => {
    if (!editingPlan) return;
    setEditingPlan((prev) => ({
      ...prev,
      plannedRoute: [...prev.plannedRoute, w],
    }));
  };
  const removeFromEditingRoute = (i) => {
    if (!editingPlan) return;
    setEditingPlan((prev) => ({
      ...prev,
      plannedRoute: prev.plannedRoute.filter((_, idx) => idx !== i),
    }));
  };
  const saveEditingPlan = async () => {
    if (!editingPlan) return;
    const existing = days[editingPlan.dateKey] || initialDayPlan();
    if (existing.routeLocked) {
      const locked = existing.route.map((s) => s.warehouse);
      const newStops = editingPlan.plannedRoute.filter(
        (w) => !locked.includes(w)
      );
      const newRoute = [
        ...existing.route,
        ...newStops.map((w) => ({
          warehouse: w,
          stopStatus: "várja",
          arrived: null,
          loading: null,
          departed: null,
          truckLoad: null,
        })),
      ];
      await saveDayPlan(editingPlan.dateKey, {
        ...existing,
        plannedRoute: editingPlan.plannedRoute,
        route: newRoute,
      });
    } else {
      await saveDayPlan(editingPlan.dateKey, {
        ...existing,
        plannedRoute: editingPlan.plannedRoute,
      });
    }
    setEditingPlan(null);
  };
  const replaceStop = async (dk, index, newW) => {
    const plan = days[dk] || initialDayPlan();
    await saveDayPlan(dk, {
      ...plan,
      route: plan.route.map((s, i) =>
        i === index ? { ...s, warehouse: newW } : s
      ),
      plannedRoute: plan.plannedRoute.map((w, i) => (i === index ? newW : w)),
    });
    setReplacingStop(null);
  };
  const removeActiveStop = async (dk, index) => {
    const plan = days[dk] || initialDayPlan();
    await saveDayPlan(dk, {
      ...plan,
      route: plan.route.filter((_, i) => i !== index),
      plannedRoute: plan.plannedRoute.filter((_, i) => i !== index),
    });
  };
  const insertStop = async (dk, index, direction, newW) => {
    const plan = days[dk] || initialDayPlan();
    const insertAt = direction === "before" ? index : index + 1;
    const newRouteStop = {
      warehouse: newW,
      stopStatus: "v\u00e1rja",
      arrived: null,
      loading: null,
      departed: null,
      truckLoad: null,
    };
    const newRoute = [
      ...plan.route.slice(0, insertAt),
      newRouteStop,
      ...plan.route.slice(insertAt),
    ];
    const newPlanned = [
      ...plan.plannedRoute.slice(0, insertAt),
      newW,
      ...plan.plannedRoute.slice(insertAt),
    ];
    await saveDayPlan(dk, {
      ...plan,
      route: newRoute,
      plannedRoute: newPlanned,
    });
    setInsertingStop(null);
  };
  const removePlannedStop = async (dk, index) => {
    const plan = days[dk] || initialDayPlan();
    await saveDayPlan(dk, {
      ...plan,
      plannedRoute: plan.plannedRoute.filter((_, i) => i !== index),
    });
  };
  const replacePlannedStop = async (dk, index, newW) => {
    const plan = days[dk] || initialDayPlan();
    await saveDayPlan(dk, {
      ...plan,
      plannedRoute: plan.plannedRoute.map((w, i) => (i === index ? newW : w)),
    });
    setReplacingStop(null);
  };
  const insertPlannedStop = async (dk, index, direction, newW) => {
    const plan = days[dk] || initialDayPlan();
    const insertAt = direction === "before" ? index : index + 1;
    const newPlanned = [
      ...plan.plannedRoute.slice(0, insertAt),
      newW,
      ...plan.plannedRoute.slice(insertAt),
    ];
    await saveDayPlan(dk, { ...plan, plannedRoute: newPlanned });
    setInsertingStop(null);
  };
  const lockAndStart = async (dk) => {
    const plan = days[dk] || initialDayPlan();
    if (!plan.plannedRoute || plan.plannedRoute.length === 0) return;
    await saveDayPlan(dk, {
      ...plan,
      routeLocked: true,
      route: plan.plannedRoute.map((w) => ({
        warehouse: w,
        stopStatus: "várja",
        arrived: null,
        loading: null,
        departed: null,
        truckLoad: null,
      })),
      status: "beállításra vár",
    });
  };
  const updateStopStatus = async (dk, index, newSS) => {
    const plan = days[dk] || initialDayPlan(),
      now = new Date().toISOString();
    if (!plan.route || !plan.route[index]) return;
    const newRoute = plan.route.map((stop, i) => {
      if (i !== index) return stop;
      const u = { stopStatus: newSS };
      if (newSS === "érkezett" && !stop.arrived) u.arrived = now;
      if (newSS === "rakodás alatt" && !stop.loading) u.loading = now;
      if (newSS === "indult" && !stop.departed) u.departed = now;
      return { ...stop, ...u };
    });
    const warehouse = plan.route[index].warehouse;
    const isFirstStop = index === 0;
    const allPrevDeparted = plan.route
      .slice(0, index)
      .every((s) => s.stopStatus === "indult");
    const status = newSS === "indult" ? "úton" : "állomásozik";
    const location = newSS === "indult" ? plan.location : warehouse;
    await saveDayPlan(dk, { ...plan, route: newRoute, status, location });
  };
  const revertStopStatus = async (dk, index) => {
    const plan = days[dk] || initialDayPlan();
    if (!plan.route || !plan.route[index]) return;
    const stop = plan.route[index];
    if (stop.stopStatus === "várja") return;
    const prev =
      stop.stopStatus === "érkezett"
        ? "várja"
        : stop.stopStatus === "rakodás alatt"
        ? "érkezett"
        : "rakodás alatt";
    const newRoute = plan.route.map((s, i) => {
      if (i !== index) return s;
      const u = { stopStatus: prev };
      if (prev === "érkezett") {
        u.loading = null;
        u.departed = null;
        u.truckLoad = null;
      }
      if (prev === "rakodás alatt") {
        u.departed = null;
        u.truckLoad = null;
      }
      if (prev === "várja") {
        u.arrived = null;
        u.loading = null;
        u.departed = null;
        u.truckLoad = null;
      }
      return { ...s, ...u };
    });
    const status =
      prev === "várja"
        ? plan.route.some((s) => s.stopStatus === "indult")
          ? "úton"
          : "beállításra vár"
        : "állomásozik";
    const location =
      prev === "várja"
        ? index > 0
          ? plan.route[index - 1].warehouse
          : "—"
        : stop.warehouse;
    await saveDayPlan(dk, { ...plan, route: newRoute, status, location });
  };
  const resetDay = async (dk) => {
    await saveDayPlan(dk, initialDayPlan());
  };

  if (!loaded)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0f1117",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{ color: "#f59e0b", fontSize: 20, fontFamily: "monospace" }}
        >
          {l.loading}
        </div>
      </div>
    );

  const stopColors = {
    várja: "#374151",
    érkezett: "#3b82f6",
    "rakodás alatt": "#f59e0b",
    indult: "#10b981",
  };
  const stopIcons = {
    várja: "⏸",
    érkezett: "🏭",
    "rakodás alatt": "⏳",
    indult: "✅",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f1117",
        fontFamily: "'DM Mono', monospace",
      }}
      onClick={() => setShowLangMenu(false)}
    >
      {cargoModal && (
        <CargoModal
          name={cargoModal}
          cargoData={cargoInputs[cargoModal]}
          onSave={(items) => saveCargo(cargoModal, items)}
          onClear={() => clearCargo(cargoModal)}
          onClose={() => setCargoModal(null)}
          l={l}
        />
      )}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .card { background: #1a1d27; border: 1px solid #2a2d3a; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
        .btn-primary { background: #f59e0b; color: #0f1117; border: none; border-radius: 8px; padding: 10px 18px; font-weight: 700; cursor: pointer; font-family: inherit; font-size: 13px; width: 100%; }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-sm { background: transparent; border: 1px solid; border-radius: 6px; padding: 4px 10px; font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
        .select-dark { background: #0f1117; border: 1px solid #2a2d3a; color: #e2e8f0; border-radius: 8px; padding: 8px 10px; font-family: inherit; font-size: 13px; width: 100%; }
        .select-sm { background: #0f1117; border: 1px solid #2a2d3a; color: #e2e8f0; border-radius: 6px; padding: 5px 8px; font-family: inherit; font-size: 12px; }
        .tab-btn { background: transparent; border: 1px solid #2a2d3a; border-radius: 20px; padding: 5px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; font-family: inherit; color: #4a5568; transition: all 0.2s; white-space: nowrap; }
        .tab-btn.active { background: #f59e0b; color: #0f1117; border-color: #f59e0b; }
        .route-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .route-line { width: 2px; background: #2a2d3a; flex: 1; min-height: 16px; margin: 2px 0; }
        .day-btn { border-radius: 8px; padding: 7px 12px; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid #2a2d3a; background: #1a1d27; color: #4a5568; transition: all 0.2s; text-align: center; }
        .day-btn.selected { border-color: #f59e0b; background: #f59e0b; color: #0f1117; }
        .day-btn.tomorrow-style { border-color: #f59e0b; background: #f59e0b22; color: #f59e0b; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { color: #f59e0b; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; padding: 6px 8px; text-align: left; border-bottom: 1px solid #2a2d3a; }
        td { color: #e2e8f0; padding: 7px 8px; border-bottom: 1px solid #1e2130; }
        tr:last-child td { border-bottom: none; }
        .lang-menu { position: absolute; top: 36px; right: 0; background: #1a1d27; border: 1px solid #2a2d3a; border-radius: 8px; overflow: hidden; z-index: 100; min-width: 110px; }
        .lang-option { padding: 8px 16px; cursor: pointer; font-size: 12px; font-weight: 700; color: #e2e8f0; }
        .lang-option:hover { background: #2a2d3a; }
        .lang-option.active-lang { color: #f59e0b; }
        .checkbox-urgent { width: 16px; height: 16px; cursor: pointer; accent-color: #ef4444; }
        .fuvar-row { display: grid; grid-template-columns: 1fr 60px 80px 1fr; gap: 8px; align-items: center; padding: 10px 0; border-bottom: 1px solid #1e2130; }
        .fuvar-row:last-child { border-bottom: none; }
      `}</style>

      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid #2a2d3a",
          background: "#0f1117",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 26,
                color: "#f59e0b",
                letterSpacing: 2,
              }}
            >
              TATAI TRACKER
            </div>
            <div style={{ fontSize: 10, color: "#4a5568", letterSpacing: 2 }}>
              {l.appSub}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
              }}
            >
              <button
                onClick={syncNow}
                style={{
                  background: "transparent",
                  border: "1px solid #2a2d3a",
                  borderRadius: 8,
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#4a5568",
                }}
                title="Azonnali frissítés"
              >
                🔄
              </button>
              {lastSync && (
                <div
                  style={{
                    color: "#06b6d4",
                    fontSize: 9,
                    letterSpacing: 0.5,
                    whiteSpace: "nowrap",
                  }}
                >
                  {new Date(lastSync).toLocaleTimeString("hu-HU", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#10b981",
                }}
              ></div>
              <span style={{ fontSize: 11, color: "#10b981" }}>{l.live}</span>
            </div>
            <div
              style={{ position: "relative" }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowLangMenu((p) => !p)}
                style={{
                  background: "transparent",
                  border: "1px solid #2a2d3a",
                  borderRadius: 8,
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: 16,
                  color: "#e2e8f0",
                }}
              >
                🌐
              </button>
              {showLangMenu && (
                <div className="lang-menu">
                  {["hu", "en"].map((ln) => (
                    <div
                      key={ln}
                      className={`lang-option ${
                        lang === ln ? "active-lang" : ""
                      }`}
                      onClick={() => {
                        setLang(ln);
                        setShowLangMenu(false);
                      }}
                    >
                      {ln === "hu" ? "🇭🇺 Magyar" : "🇬🇧 English"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            padding: "0 16px 10px",
            display: "flex",
            gap: 8,
            overflowX: "auto",
          }}
        >
          {["dashboard", "utvonal", "fuvar"].map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "dashboard"
                ? l.overview
                : tab === "utvonal"
                ? l.route
                : l.fuvarTab}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "16px" }}>
        {/* DASHBOARD */}
        {activeTab === "dashboard" && (
          <>
            <div className="card">
              <span style={LABEL}>{l.truckStatus}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 32 }}>🚛</div>
                <div style={{ flex: 1 }}>
                  {(() => {
                    const plan = todayPlan;
                    const currentStop =
                      plan.route &&
                      plan.route.find(
                        (s) =>
                          s.stopStatus === "rakodás alatt" ||
                          s.stopStatus === "érkezett"
                      );
                    const nextStop =
                      plan.route &&
                      plan.route.find((s) => s.stopStatus === "várja");
                    const prevStop =
                      plan.route &&
                      [...plan.route]
                        .reverse()
                        .find((s) => s.stopStatus === "indult");
                    if (plan.status === "úton" && prevStop && nextStop)
                      return (
                        <>
                          <div
                            style={{
                              color: "#e2e8f0",
                              fontSize: 15,
                              fontWeight: 700,
                            }}
                          >
                            {prevStop.warehouse}{" "}
                            <span style={{ color: "#f59e0b" }}>→</span>{" "}
                            {nextStop.warehouse}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginTop: 4,
                              flexWrap: "wrap",
                            }}
                          >
                            <StatusBadge statusKey="úton" l={l} />
                            {prevStop.truckLoad && (
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#06b6d4",
                                  fontWeight: 700,
                                }}
                              >
                                📦 {trStatus(prevStop.truckLoad, l)}
                              </span>
                            )}
                          </div>
                        </>
                      );
                    if (plan.status === "állomásozik" && currentStop)
                      return (
                        <>
                          <div
                            style={{
                              color: "#e2e8f0",
                              fontSize: 15,
                              fontWeight: 700,
                            }}
                          >
                            {currentStop.warehouse}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginTop: 4,
                              flexWrap: "wrap",
                            }}
                          >
                            <StatusBadge
                              statusKey={
                                currentStop.stopStatus === "rakodás alatt"
                                  ? "rakodás alatt"
                                  : "érkezett"
                              }
                              l={l}
                            />
                            {currentStop.truckLoad && (
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#06b6d4",
                                  fontWeight: 700,
                                }}
                              >
                                📦 {trStatus(currentStop.truckLoad, l)}
                              </span>
                            )}
                          </div>
                        </>
                      );
                    return (
                      <>
                        <div
                          style={{
                            color: "#e2e8f0",
                            fontSize: 15,
                            fontWeight: 700,
                          }}
                        >
                          {plan.location}
                        </div>
                        <StatusBadge statusKey={plan.status} l={l} />
                      </>
                    );
                  })()}
                  {todayPlan.departure && (
                    <div
                      style={{ color: "#4a5568", fontSize: 11, marginTop: 4 }}
                    >
                      Indulás: {formatTime(todayPlan.departure)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <span style={LABEL}>{l.standbyTrailers}</span>
            {TRAILER_NAMES.map((name) => {
              const t = trailers[name] || {
                status: "rakodásra vár",
                location: "Győr",
              };
              const pending = pendingTrailers[name];
              const isDirty = dirtyTrailers[name],
                isSaved = savedTrailers[name];
              const currentStatus =
                pending?.status !== undefined ? pending.status : t.status;
              const currentLocation =
                pending?.location !== undefined ? pending.location : t.location;
              const icon =
                currentStatus === "rakodás alatt"
                  ? "⏳"
                  : currentStatus === "szedés alatt"
                  ? "🔄"
                  : currentStatus === "indulásra kész - rakodva"
                  ? "📦"
                  : currentStatus === "indulásra kész - üres"
                  ? "✅"
                  : currentStatus === "szedésre vár"
                  ? "⏸"
                  : "🔲";
              const cargo = cargoInputs[name];
              const cargoItems = cargo?.items || [];
              return (
                <div key={name} className="card">
                  <div style={{ marginBottom: 12 }}>
                    {/* Sor 1: név + státusz badge */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          color: "#e2e8f0",
                          fontSize: 14,
                          fontWeight: 700,
                        }}
                      >
                        {name}
                      </div>
                      <StatusBadge statusKey={t.status} l={l} />
                    </div>
                    {/* Sor 2: rakomány gomb + kuka */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                        }}
                      >
                        <button
                          onClick={() => setCargoModal(name)}
                          style={{
                            background:
                              cargoItems.length > 0 ? "#f59e0b22" : "#1e2130",
                            border: `1px solid ${
                              cargoItems.length > 0 ? "#f59e0b" : "#374151"
                            }`,
                            color:
                              cargoItems.length > 0 ? "#f59e0b" : "#4a5568",
                            borderRadius: 6,
                            padding: "3px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {l.addCargo}
                          {cargoItems.length > 0
                            ? ` (${cargoItems.length})`
                            : ""}
                        </button>
                        {cargo?.savedAt && (
                          <div style={{ color: "#f59e0b", fontSize: 10 }}>
                            {l.cargoUpdated}: {formatTime(cargo.savedAt)}
                          </div>
                        )}
                      </div>
                      {cargoItems.length > 0 && (
                        <button
                          onClick={() => {
                            if (window.confirm("Törlöd a rakománylistát?"))
                              clearCargo(name);
                          }}
                          style={{
                            background: "#ef444422",
                            border: "1px solid #ef4444",
                            color: "#ef4444",
                            cursor: "pointer",
                            fontSize: 13,
                            padding: "3px 8px",
                            borderRadius: 6,
                            fontWeight: 700,
                          }}
                          title={l.cargoClear}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                    {/* Helyszín + időbélyeg */}
                    <div style={{ color: "#06b6d4", fontSize: 12 }}>
                      📍 {t.location}
                    </div>
                    {t.lastUpdated && (
                      <div
                        style={{
                          borderTop: "1px solid #2a2d3a",
                          marginTop: 6,
                          paddingTop: 6,
                        }}
                      >
                        <div style={{ color: "#67e8f9", fontSize: 10 }}>
                          {l.updatedAt}: {formatTime(t.lastUpdated)}
                        </div>
                        <div
                          style={{
                            color: "#06b6d4",
                            fontSize: 11,
                            marginTop: 2,
                          }}
                        >
                          ⏱ {formatSince(t.lastUpdated)} {l.since}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <span style={LABEL}>{l.status}</span>
                      <select
                        className="select-dark"
                        value={currentStatus}
                        onChange={(e) =>
                          handleTrailerChange(name, "status", e.target.value)
                        }
                      >
                        {TRAILER_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {trStatus(s, l)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={LABEL}>{l.location}</span>
                      <select
                        className="select-dark"
                        value={currentLocation}
                        onChange={(e) =>
                          handleTrailerChange(name, "location", e.target.value)
                        }
                      >
                        {WAREHOUSES.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={() => submitTrailer(name)}
                    disabled={!isDirty}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: 8,
                      fontFamily: "inherit",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: isDirty ? "pointer" : "not-allowed",
                      border: `2px solid ${
                        isDirty ? "#f59e0b" : isSaved ? "#10b981" : "#374151"
                      }`,
                      background: isSaved && !isDirty ? "#10b981" : "#1e2130",
                      color:
                        isSaved && !isDirty
                          ? "#fff"
                          : isDirty
                          ? "#f59e0b"
                          : "#4a5568",
                      transition: "all 0.2s",
                    }}
                  >
                    {isSaved && !isDirty ? l.saved : l.save}
                  </button>
                </div>
              );
            })}
          </>
        )}

        {/* ÚTVONAL TERV */}
        {activeTab === "utvonal" && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
                marginBottom: 16,
              }}
            >
              {dayKeys.map((dk) => {
                const isToday = dk === today,
                  isSelected = dk === selectedDay;
                const plan = days[dk],
                  hasRoute = plan?.plannedRoute?.length > 0;
                return (
                  <div
                    key={dk}
                    className={`day-btn ${
                      isSelected ? "selected" : isToday ? "tomorrow-style" : ""
                    }`}
                    onClick={() => {
                      setSelectedDay(dk);
                      setEditingPlan(null);
                      setReplacingStop(null);
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {formatDateLabel(dk)}
                    </div>
                    <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>
                      {isToday
                        ? l.today
                        : dk === getDateKey(1)
                        ? l.tomorrow
                        : ""}
                    </div>
                    {hasRoute && (
                      <div
                        style={{
                          fontSize: 9,
                          color: isSelected ? "#0f1117" : "#10b981",
                          marginTop: 2,
                        }}
                      >
                        ● {plan.plannedRoute.length} {l.stops}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {(() => {
              const plan = days[selectedDay] || initialDayPlan();
              const isToday = selectedDay === today;
              if (editingPlan && editingPlan.dateKey === selectedDay) {
                return (
                  <div className="card">
                    <span style={LABEL}>
                      ✏️ {l.planningTitle} – {formatDateLabel(selectedDay)}
                    </span>
                    <div
                      style={{
                        color: "#4a5568",
                        fontSize: 11,
                        marginBottom: 10,
                      }}
                    >
                      {l.clickWarehouses}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        marginBottom: 14,
                      }}
                    >
                      {WAREHOUSES.map((w) => (
                        <button
                          key={w}
                          className="btn-sm"
                          onClick={() => addToEditingRoute(w)}
                          style={{ borderColor: "#06b6d4", color: "#06b6d4" }}
                        >
                          + {w}
                        </button>
                      ))}
                    </div>
                    {editingPlan.plannedRoute.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={LABEL}>{l.dailyPlan}</span>
                        {editingPlan.plannedRoute.map((w, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 6,
                            }}
                          >
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: "50%",
                                background: "#1e2130",
                                border: "1px solid #f59e0b",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 10,
                                color: "#f59e0b",
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {i + 1}
                            </div>
                            <span
                              style={{
                                color: "#06b6d4",
                                fontSize: 13,
                                flex: 1,
                              }}
                            >
                              🏭 {w}
                            </span>
                            <button
                              onClick={() => removeFromEditingRoute(i)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#ef4444",
                                cursor: "pointer",
                                fontSize: 18,
                              }}
                            >
                              −
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={saveEditingPlan}
                        style={{
                          flex: 1,
                          padding: "10px",
                          borderRadius: 8,
                          fontFamily: "inherit",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                          border: "2px solid #10b981",
                          background: "#10b981",
                          color: "#fff",
                        }}
                      >
                        {l.savePlan}
                      </button>
                      <button
                        onClick={() => setEditingPlan(null)}
                        style={{
                          flex: 1,
                          padding: "10px",
                          borderRadius: 8,
                          fontFamily: "inherit",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                          border: "2px solid #374151",
                          background: "transparent",
                          color: "#4a5568",
                        }}
                      >
                        {l.cancel}
                      </button>
                    </div>
                  </div>
                );
              }
              if (!plan.routeLocked) {
                return (
                  <div className="card">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 12,
                      }}
                    >
                      <span style={LABEL}>
                        📋 {formatDateLabel(selectedDay)} – {l.dailyPlan}
                      </span>
                      {!isToday && (
                        <button
                          className="btn-sm"
                          onClick={() => startEditing(selectedDay)}
                          style={{ borderColor: "#f59e0b", color: "#f59e0b" }}
                        >
                          {l.editPlan}
                        </button>
                      )}
                    </div>
                    {plan.plannedRoute && plan.plannedRoute.length > 0 ? (
                      <>
                        {plan.plannedRoute.map((w, i) => {
                          const isReplacingHere =
                            replacingStop &&
                            replacingStop.dateKey === selectedDay &&
                            replacingStop.index === i;
                          const isInsertingBeforeHere =
                            insertingStop &&
                            insertingStop.dateKey === selectedDay &&
                            insertingStop.index === i &&
                            insertingStop.direction === "before";
                          const isInsertingAfterHere =
                            insertingStop &&
                            insertingStop.dateKey === selectedDay &&
                            insertingStop.index === i &&
                            insertingStop.direction === "after";
                          return (
                            <div key={i} style={{ marginBottom: 8 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <div
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: "50%",
                                    background: "#1e2130",
                                    border: "1px solid #f59e0b",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 10,
                                    color: "#f59e0b",
                                    fontWeight: 700,
                                    flexShrink: 0,
                                  }}
                                >
                                  {i + 1}
                                </div>
                                <span
                                  style={{
                                    color: "#06b6d4",
                                    fontSize: 13,
                                    flex: 1,
                                  }}
                                >
                                  🏭 {w}
                                </span>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button
                                    title={l.insertBefore}
                                    onClick={() => {
                                      setReplacingStop(null);
                                      setInsertingStop(
                                        isInsertingBeforeHere
                                          ? null
                                          : {
                                              dateKey: selectedDay,
                                              index: i,
                                              direction: "before",
                                              pending: null,
                                            }
                                      );
                                    }}
                                    style={{
                                      background: isInsertingBeforeHere
                                        ? "#a78bfa"
                                        : "#1e2130",
                                      border: "1px solid #a78bfa",
                                      color: isInsertingBeforeHere
                                        ? "#0f1117"
                                        : "#a78bfa",
                                      borderRadius: 6,
                                      width: 24,
                                      height: 24,
                                      cursor: "pointer",
                                      fontSize: 10,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontWeight: 700,
                                      letterSpacing: -1,
                                    }}
                                  >
                                    +⬆
                                  </button>
                                  <button
                                    title={l.insertAfter}
                                    onClick={() => {
                                      setReplacingStop(null);
                                      setInsertingStop(
                                        isInsertingAfterHere
                                          ? null
                                          : {
                                              dateKey: selectedDay,
                                              index: i,
                                              direction: "after",
                                              pending: null,
                                            }
                                      );
                                    }}
                                    style={{
                                      background: isInsertingAfterHere
                                        ? "#a78bfa"
                                        : "#1e2130",
                                      border: "1px solid #a78bfa",
                                      color: isInsertingAfterHere
                                        ? "#0f1117"
                                        : "#a78bfa",
                                      borderRadius: 6,
                                      width: 24,
                                      height: 24,
                                      cursor: "pointer",
                                      fontSize: 10,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontWeight: 700,
                                      letterSpacing: -1,
                                    }}
                                  >
                                    +⬇
                                  </button>
                                  <button
                                    onClick={() => {
                                      setInsertingStop(null);
                                      setReplacingStop(
                                        isReplacingHere
                                          ? null
                                          : {
                                              dateKey: selectedDay,
                                              index: i,
                                              pending: null,
                                            }
                                      );
                                    }}
                                    style={{
                                      background: isReplacingHere
                                        ? "#06b6d4"
                                        : "#1e2130",
                                      border: "1px solid #06b6d4",
                                      color: isReplacingHere
                                        ? "#0f1117"
                                        : "#06b6d4",
                                      borderRadius: 6,
                                      width: 24,
                                      height: 24,
                                      cursor: "pointer",
                                      fontSize: 13,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    🔄
                                  </button>
                                  <button
                                    onClick={() =>
                                      removePlannedStop(selectedDay, i)
                                    }
                                    style={{
                                      background: "#1e2130",
                                      border: "1px solid #ef4444",
                                      color: "#ef4444",
                                      borderRadius: 6,
                                      width: 24,
                                      height: 24,
                                      cursor: "pointer",
                                      fontSize: 14,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    −
                                  </button>
                                  {isReplacingHere && replacingStop.pending && (
                                    <button
                                      onClick={() =>
                                        replacePlannedStop(
                                          selectedDay,
                                          i,
                                          replacingStop.pending
                                        )
                                      }
                                      style={{
                                        background: "#10b981",
                                        border: "none",
                                        color: "#0f1117",
                                        borderRadius: 6,
                                        width: 24,
                                        height: 24,
                                        cursor: "pointer",
                                        fontSize: 13,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontWeight: 700,
                                      }}
                                    >
                                      ✓
                                    </button>
                                  )}
                                  {(isInsertingBeforeHere ||
                                    isInsertingAfterHere) &&
                                    insertingStop.pending && (
                                      <button
                                        onClick={() =>
                                          insertPlannedStop(
                                            selectedDay,
                                            i,
                                            insertingStop.direction,
                                            insertingStop.pending
                                          )
                                        }
                                        style={{
                                          background: "#10b981",
                                          border: "none",
                                          color: "#0f1117",
                                          borderRadius: 6,
                                          width: 24,
                                          height: 24,
                                          cursor: "pointer",
                                          fontSize: 13,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontWeight: 700,
                                        }}
                                      >
                                        ✓
                                      </button>
                                    )}
                                </div>
                              </div>
                              {isReplacingHere && (
                                <div
                                  style={{
                                    marginTop: 6,
                                    background: "#0f1117",
                                    border: "1px solid #06b6d4",
                                    borderRadius: 8,
                                    padding: 8,
                                  }}
                                >
                                  <div
                                    style={{
                                      color: "#06b6d4",
                                      fontSize: 10,
                                      textTransform: "uppercase",
                                      letterSpacing: 1,
                                      marginBottom: 6,
                                    }}
                                  >
                                    {l.replaceLocation}
                                  </div>
                                  {WAREHOUSES.filter((ww) => ww !== w).map(
                                    (ww) => {
                                      const ip = replacingStop.pending === ww;
                                      return (
                                        <button
                                          key={ww}
                                          onClick={() =>
                                            setReplacingStop((prev) => ({
                                              ...prev,
                                              pending: ww,
                                            }))
                                          }
                                          style={{
                                            display: "block",
                                            width: "100%",
                                            textAlign: "left",
                                            background: ip
                                              ? "#06b6d422"
                                              : "transparent",
                                            border: "none",
                                            borderLeft: ip
                                              ? "2px solid #06b6d4"
                                              : "2px solid transparent",
                                            color: ip ? "#06b6d4" : "#4a5568",
                                            padding: "5px 8px",
                                            cursor: "pointer",
                                            fontSize: 12,
                                            fontWeight: ip ? 700 : 400,
                                          }}
                                        >
                                          🏭 {ww}
                                        </button>
                                      );
                                    }
                                  )}
                                </div>
                              )}
                              {(isInsertingBeforeHere ||
                                isInsertingAfterHere) && (
                                <div
                                  style={{
                                    marginTop: 6,
                                    background: "#0f1117",
                                    border: "1px solid #a78bfa",
                                    borderRadius: 8,
                                    padding: 8,
                                  }}
                                >
                                  <div
                                    style={{
                                      color: "#a78bfa",
                                      fontSize: 10,
                                      textTransform: "uppercase",
                                      letterSpacing: 1,
                                      marginBottom: 6,
                                    }}
                                  >
                                    {isInsertingBeforeHere
                                      ? l.insertBefore
                                      : l.insertAfter}
                                  </div>
                                  <select
                                    className="select-dark"
                                    value={insertingStop.pending || ""}
                                    onChange={(e) =>
                                      setInsertingStop((prev) => ({
                                        ...prev,
                                        pending: e.target.value || null,
                                      }))
                                    }
                                  >
                                    <option value="">
                                      — válassz helyszínt —
                                    </option>
                                    {WAREHOUSES.map((ww) => (
                                      <option key={ww} value={ww}>
                                        {ww}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {isToday && (
                          <button
                            className="btn-primary"
                            style={{ marginTop: 12 }}
                            onClick={() => lockAndStart(selectedDay)}
                          >
                            {l.lockStart}
                          </button>
                        )}
                        {!isToday && (
                          <div style={{ marginTop: 6 }}>
                            <div style={{ color: "#4a5568", fontSize: 11 }}>
                              {l.futurePlan}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ textAlign: "center", padding: 16 }}>
                        <div style={{ color: "#374151", fontSize: 12 }}>
                          {l.noPlan}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <>
                  <div className="card">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontSize: 32 }}>🚛</div>
                        <div>
                          <div
                            style={{
                              color: "#e2e8f0",
                              fontSize: 16,
                              fontWeight: 700,
                            }}
                          >
                            {plan.location}
                          </div>
                          <StatusBadge statusKey={plan.status} l={l} />
                          {plan.departure && (
                            <div
                              style={{
                                color: "#4a5568",
                                fontSize: 11,
                                marginTop: 3,
                              }}
                            >
                              Indult: {formatTime(plan.departure)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexDirection: "column",
                          alignItems: "flex-end",
                        }}
                      >
                        {isToday && (
                          <button
                            className="btn-sm"
                            onClick={() => resetDay(selectedDay)}
                            style={{ borderColor: "#4a5568", color: "#4a5568" }}
                          >
                            {l.reset}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="card">
                    <span style={LABEL}>
                      {l.todayRoute} – {formatDateLabel(selectedDay)}
                    </span>
                    {(plan.route || []).map((stop, i) => {
                      const ss = stop.stopStatus || "várja",
                        isCompleted = ss === "indult",
                        canEditStop = ss === "várja";
                      const prevOk =
                        i === 0
                          ? true
                          : plan.route[i - 1]?.stopStatus === "indult";
                      const allowed = {
                        érkezett: prevOk && ss === "várja",
                        "rakodás alatt":
                          ss === "érkezett" || ss === "rakodás alatt",
                        indult: ss === "rakodás alatt",
                      };
                      const isReplacing =
                        replacingStop &&
                        replacingStop.dateKey === selectedDay &&
                        replacingStop.index === i;
                      const isInsertingBefore =
                        insertingStop &&
                        insertingStop.dateKey === selectedDay &&
                        insertingStop.index === i &&
                        insertingStop.direction === "before";
                      const isInsertingAfter =
                        insertingStop &&
                        insertingStop.dateKey === selectedDay &&
                        insertingStop.index === i &&
                        insertingStop.direction === "after";
                      const isAnyPanel =
                        isReplacing || isInsertingBefore || isInsertingAfter;
                      const canDepart =
                        ss === "rakodás alatt" && stop.truckLoad;
                      return (
                        <div key={i} style={{ marginBottom: 16 }}>
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "flex-start",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                minWidth: 14,
                                paddingTop: 2,
                              }}
                            >
                              <div
                                className="route-dot"
                                style={{
                                  background:
                                    ss === "várja" ? "#2a2d3a" : stopColors[ss],
                                }}
                              ></div>
                              {i < plan.route.length - 1 && (
                                <div
                                  className="route-line"
                                  style={{
                                    height: isAnyPanel
                                      ? 160
                                      : ss === "rakodás alatt"
                                      ? 100
                                      : 70,
                                  }}
                                ></div>
                              )}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  marginBottom: 6,
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    color:
                                      ss === "várja" ? "#164e63" : "#06b6d4",
                                    fontSize: 14,
                                    fontWeight: 700,
                                  }}
                                >
                                  {stop.warehouse}
                                </span>
                                <span
                                  style={{
                                    fontSize: 10,
                                    padding: "2px 8px",
                                    borderRadius: 10,
                                    background: stopColors[ss] + "33",
                                    color: stopColors[ss],
                                    fontWeight: 700,
                                  }}
                                >
                                  {stopIcons[ss]} {trStopStatus(ss, l)}
                                </span>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 4,
                                    marginLeft: "auto",
                                  }}
                                >
                                  {canEditStop && (
                                    <>
                                      <button
                                        title={l.insertBefore}
                                        onClick={() => {
                                          setReplacingStop(null);
                                          setInsertingStop(
                                            isInsertingBefore
                                              ? null
                                              : {
                                                  dateKey: selectedDay,
                                                  index: i,
                                                  direction: "before",
                                                  pending: null,
                                                }
                                          );
                                        }}
                                        style={{
                                          background: isInsertingBefore
                                            ? "#a78bfa"
                                            : "#1e2130",
                                          border: "1px solid #a78bfa",
                                          color: isInsertingBefore
                                            ? "#0f1117"
                                            : "#a78bfa",
                                          borderRadius: 6,
                                          width: 24,
                                          height: 24,
                                          cursor: "pointer",
                                          fontSize: 10,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontWeight: 700,
                                          letterSpacing: -1,
                                        }}
                                      >
                                        +⬆
                                      </button>
                                      <button
                                        title={l.insertAfter}
                                        onClick={() => {
                                          setReplacingStop(null);
                                          setInsertingStop(
                                            isInsertingAfter
                                              ? null
                                              : {
                                                  dateKey: selectedDay,
                                                  index: i,
                                                  direction: "after",
                                                  pending: null,
                                                }
                                          );
                                        }}
                                        style={{
                                          background: isInsertingAfter
                                            ? "#a78bfa"
                                            : "#1e2130",
                                          border: "1px solid #a78bfa",
                                          color: isInsertingAfter
                                            ? "#0f1117"
                                            : "#a78bfa",
                                          borderRadius: 6,
                                          width: 24,
                                          height: 24,
                                          cursor: "pointer",
                                          fontSize: 10,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontWeight: 700,
                                          letterSpacing: -1,
                                        }}
                                      >
                                        +⬇
                                      </button>
                                      <button
                                        onClick={() => {
                                          setInsertingStop(null);
                                          setReplacingStop(
                                            isReplacing
                                              ? null
                                              : {
                                                  dateKey: selectedDay,
                                                  index: i,
                                                  pending: null,
                                                }
                                          );
                                        }}
                                        style={{
                                          background: isReplacing
                                            ? "#06b6d4"
                                            : "#1e2130",
                                          border: "1px solid #06b6d4",
                                          color: isReplacing
                                            ? "#0f1117"
                                            : "#06b6d4",
                                          borderRadius: 6,
                                          width: 24,
                                          height: 24,
                                          cursor: "pointer",
                                          fontSize: 13,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                        }}
                                      >
                                        🔄
                                      </button>
                                      <button
                                        onClick={() =>
                                          removeActiveStop(selectedDay, i)
                                        }
                                        style={{
                                          background: "#1e2130",
                                          border: "1px solid #ef4444",
                                          color: "#ef4444",
                                          borderRadius: 6,
                                          width: 24,
                                          height: 24,
                                          cursor: "pointer",
                                          fontSize: 14,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                        }}
                                      >
                                        −
                                      </button>
                                      {isReplacing && replacingStop.pending && (
                                        <button
                                          onClick={() =>
                                            replaceStop(
                                              selectedDay,
                                              i,
                                              replacingStop.pending
                                            )
                                          }
                                          style={{
                                            background: "#10b981",
                                            border: "1px solid #10b981",
                                            color: "#0f1117",
                                            borderRadius: 6,
                                            width: 24,
                                            height: 24,
                                            cursor: "pointer",
                                            fontSize: 13,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontWeight: 700,
                                          }}
                                        >
                                          ✓
                                        </button>
                                      )}
                                      {(isInsertingBefore ||
                                        isInsertingAfter) &&
                                        insertingStop.pending && (
                                          <button
                                            onClick={() =>
                                              insertStop(
                                                selectedDay,
                                                i,
                                                insertingStop.direction,
                                                insertingStop.pending
                                              )
                                            }
                                            style={{
                                              background: "#10b981",
                                              border: "1px solid #10b981",
                                              color: "#0f1117",
                                              borderRadius: 6,
                                              width: 24,
                                              height: 24,
                                              cursor: "pointer",
                                              fontSize: 13,
                                              display: "flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              fontWeight: 700,
                                            }}
                                          >
                                            ✓
                                          </button>
                                        )}
                                    </>
                                  )}
                                  {ss !== "várja" && (
                                    <button
                                      onClick={() =>
                                        revertStopStatus(selectedDay, i)
                                      }
                                      style={{
                                        background: "#1e2130",
                                        border: "1px solid #ef4444",
                                        color: "#ef4444",
                                        borderRadius: 6,
                                        width: 24,
                                        height: 24,
                                        cursor: "pointer",
                                        fontSize: 13,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      ↩
                                    </button>
                                  )}
                                </div>
                              </div>
                              {isReplacing && (
                                <div
                                  style={{
                                    marginBottom: 8,
                                    background: "#0f1117",
                                    border: "1px solid #06b6d4",
                                    borderRadius: 8,
                                    padding: 8,
                                  }}
                                >
                                  <div
                                    style={{
                                      color: "#06b6d4",
                                      fontSize: 10,
                                      textTransform: "uppercase",
                                      letterSpacing: 1,
                                      marginBottom: 6,
                                    }}
                                  >
                                    {l.replaceLocation}
                                  </div>
                                  {WAREHOUSES.filter(
                                    (w) => w !== stop.warehouse
                                  ).map((w) => {
                                    const isPending =
                                      replacingStop.pending === w;
                                    return (
                                      <button
                                        key={w}
                                        onClick={() =>
                                          setReplacingStop((prev) => ({
                                            ...prev,
                                            pending: w,
                                          }))
                                        }
                                        style={{
                                          display: "block",
                                          width: "100%",
                                          textAlign: "left",
                                          background: isPending
                                            ? "#06b6d422"
                                            : "transparent",
                                          border: "none",
                                          borderLeft: isPending
                                            ? "2px solid #06b6d4"
                                            : "2px solid transparent",
                                          color: isPending
                                            ? "#06b6d4"
                                            : "#4a5568",
                                          padding: "5px 8px",
                                          cursor: "pointer",
                                          fontSize: 12,
                                          fontWeight: isPending ? 700 : 400,
                                        }}
                                      >
                                        🏭 {w}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              {(isInsertingBefore || isInsertingAfter) && (
                                <div
                                  style={{
                                    marginBottom: 8,
                                    background: "#0f1117",
                                    border: "1px solid #a78bfa",
                                    borderRadius: 8,
                                    padding: 8,
                                  }}
                                >
                                  <div
                                    style={{
                                      color: "#a78bfa",
                                      fontSize: 10,
                                      textTransform: "uppercase",
                                      letterSpacing: 1,
                                      marginBottom: 6,
                                    }}
                                  >
                                    {isInsertingBefore
                                      ? l.insertBefore
                                      : l.insertAfter}
                                  </div>
                                  <select
                                    className="select-dark"
                                    value={insertingStop.pending || ""}
                                    onChange={(e) =>
                                      setInsertingStop((prev) => ({
                                        ...prev,
                                        pending: e.target.value || null,
                                      }))
                                    }
                                    style={{ marginBottom: 0 }}
                                  >
                                    <option value="">
                                      — válassz helyszínt —
                                    </option>
                                    {WAREHOUSES.map((w) => (
                                      <option key={w} value={w}>
                                        {w}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              {(stop.arrived ||
                                stop.loading ||
                                stop.departed) && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    marginBottom: 8,
                                  }}
                                >
                                  <TimeDisplay
                                    iso={stop.arrived}
                                    label={l.arrived}
                                  />
                                  {stop.loading && (
                                    <TimeDisplay
                                      iso={stop.loading}
                                      label={l.loadingBtn}
                                    />
                                  )}
                                  {stop.departed && (
                                    <TimeDisplay
                                      iso={stop.departed}
                                      label={l.departed}
                                    />
                                  )}
                                </div>
                              )}
                              {!isCompleted && (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 6,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  {["érkezett", "rakodás alatt"].map((s) => {
                                    const isActive = ss === s,
                                      isEnabled = allowed[s];
                                    return (
                                      <button
                                        key={s}
                                        className="btn-sm"
                                        onClick={() =>
                                          isEnabled &&
                                          updateStopStatus(selectedDay, i, s)
                                        }
                                        style={{
                                          borderColor: isEnabled
                                            ? stopColors[s]
                                            : "#2a2d3a",
                                          color: isActive
                                            ? "#0f1117"
                                            : isEnabled
                                            ? stopColors[s]
                                            : "#2a2d3a",
                                          background: isActive
                                            ? stopColors[s]
                                            : "transparent",
                                          cursor: isEnabled
                                            ? "pointer"
                                            : "not-allowed",
                                          opacity: isEnabled ? 1 : 0.3,
                                        }}
                                      >
                                        {s === "érkezett"
                                          ? `🏭 ${l.arrived}`
                                          : `⏳ ${l.loadingBtn}`}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              {ss === "rakodás alatt" && (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 6,
                                    marginTop: 8,
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                  }}
                                >
                                  {TRUCK_LOAD_KEYS.map((v) => {
                                    const isActive = stop.truckLoad === v;
                                    return (
                                      <button
                                        key={v}
                                        className="btn-sm"
                                        onClick={() => {
                                          const nr = plan.route.map((s2, idx) =>
                                            idx === i
                                              ? { ...s2, truckLoad: v }
                                              : s2
                                          );
                                          saveDayPlan(selectedDay, {
                                            ...plan,
                                            route: nr,
                                          });
                                        }}
                                        style={{
                                          borderColor: "#06b6d4",
                                          color: isActive
                                            ? "#0f1117"
                                            : "#06b6d4",
                                          background: isActive
                                            ? "#06b6d4"
                                            : "transparent",
                                          fontWeight: 700,
                                        }}
                                      >
                                        {v === "teli"
                                          ? `📦 ${l.full}`
                                          : `🔲 ${l.empty}`}
                                      </button>
                                    );
                                  })}
                                  <button
                                    className="btn-sm"
                                    disabled={!canDepart}
                                    onClick={() =>
                                      canDepart &&
                                      updateStopStatus(selectedDay, i, "indult")
                                    }
                                    style={{
                                      borderColor: canDepart
                                        ? stopColors["indult"]
                                        : "#2a2d3a",
                                      color: canDepart ? "#0f1117" : "#2a2d3a",
                                      background: canDepart
                                        ? stopColors["indult"]
                                        : "transparent",
                                      cursor: canDepart
                                        ? "pointer"
                                        : "not-allowed",
                                      opacity: canDepart ? 1 : 0.3,
                                    }}
                                  >
                                    🚀 {l.departed}
                                  </button>
                                </div>
                              )}
                              {isCompleted && stop.truckLoad && (
                                <div style={{ marginTop: 4 }}>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: "#06b6d4",
                                      fontWeight: 700,
                                    }}
                                  >
                                    📦 {trStatus(stop.truckLoad, l)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </>
        )}

        {/* FUVAR IGÉNY */}
        {activeTab === "fuvar" && (
          <>
            {fuvarModal && (
              <FuvarModal
                onClose={() => setFuvarModal(false)}
                onAdd={(item) => setFuvarDraft((prev) => [...prev, item])}
                l={l}
              />
            )}

            {/* Header + Létrehozás gomb */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  color: "#f59e0b",
                  fontSize: 18,
                  fontFamily: "'Bebas Neue',sans-serif",
                  letterSpacing: 2,
                }}
              >
                {l.fuvarTitle}
              </div>
              <button
                onClick={() => setFuvarModal(true)}
                style={{
                  background: "#f59e0b",
                  border: "none",
                  color: "#0f1117",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + {l.fuvarCreate}
              </button>
            </div>

            {/* Draft lista (még nem mentett) */}
            {fuvarDraft.length > 0 && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div
                  style={{
                    color: "#f59e0b",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1,
                    marginBottom: 10,
                  }}
                >
                  {l.fuvarDraftTitle} ({fuvarDraft.length})
                </div>
                {fuvarDraft.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 0",
                      borderBottom: "1px solid #2a2d3a",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          color: "#e2e8f0",
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {item.from}
                        {item.via?.filter(Boolean).map((v, i) => (
                          <span key={i}>
                            {" "}
                            → <span style={{ color: "#06b6d4" }}>{v}</span>
                          </span>
                        ))}
                        {" → "}
                        {item.to}
                        {item.urgent && (
                          <span
                            style={{
                              marginLeft: 6,
                              color: "#ef4444",
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            ⚡ SÜRGŐS
                          </span>
                        )}
                      </div>
                      {(item.timeFrom || item.timeTo) && (
                        <div
                          style={{
                            color: "#4a5568",
                            fontSize: 11,
                            marginTop: 2,
                          }}
                        >
                          🕐 {item.timeFrom || "—"} – {item.timeTo || "—"}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        setFuvarDraft((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      style={{
                        background: "#ef444422",
                        border: "1px solid #ef4444",
                        color: "#ef4444",
                        borderRadius: 6,
                        padding: "3px 8px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={saveFuvarDraft}
                  style={{
                    width: "100%",
                    marginTop: 12,
                    background: "#10b981",
                    border: "none",
                    color: "#fff",
                    borderRadius: 8,
                    padding: "10px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  💾 {l.fuvarSave} ({fuvarDraft.length} fuvar)
                </button>
              </div>
            )}

            {/* Mentett fuvarok */}
            {fuvarSaved.length === 0 && fuvarDraft.length === 0 ? (
              <div
                className="card"
                style={{
                  textAlign: "center",
                  color: "#4a5568",
                  fontSize: 12,
                  padding: 24,
                }}
              >
                {l.noData}
              </div>
            ) : (
              fuvarSaved.length > 0 && (
                <div className="card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        color: "#10b981",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 1,
                      }}
                    >
                      ✓ {l.fuvarSavedTitle} ({fuvarSaved.length})
                    </div>
                    <div style={{ color: "#67e8f9", fontSize: 10 }}>
                      {fuvarSavedAt
                        ? `${l.fuvarUpdated}: ${formatTime(fuvarSavedAt)}`
                        : ""}
                    </div>
                  </div>
                  {fuvarSaved.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 0",
                        borderBottom: "1px solid #2a2d3a",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            color: "#e2e8f0",
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          {item.from}
                          {item.via?.filter(Boolean).map((v, i) => (
                            <span key={i}>
                              {" "}
                              → <span style={{ color: "#06b6d4" }}>{v}</span>
                            </span>
                          ))}
                          {" → "}
                          {item.to}
                          {item.urgent && (
                            <span
                              style={{
                                marginLeft: 6,
                                color: "#ef4444",
                                fontSize: 10,
                                fontWeight: 700,
                              }}
                            >
                              ⚡ SÜRGŐS
                            </span>
                          )}
                        </div>
                        {(item.timeFrom || item.timeTo) && (
                          <div
                            style={{
                              color: "#4a5568",
                              fontSize: 11,
                              marginTop: 2,
                            }}
                          >
                            🕐 {item.timeFrom || "—"} – {item.timeTo || "—"}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteFuvarItem(idx)}
                        style={{
                          background: "#ef444422",
                          border: "1px solid #ef4444",
                          color: "#ef4444",
                          borderRadius: 6,
                          padding: "3px 8px",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
