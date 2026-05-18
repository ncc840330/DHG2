import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

const FIREBASE_URL = "https://tatai-tracker-default-rtdb.firebaseio.com";
const WAREHOUSES = ["Győr", "Komárom-Huawei", "KMRM2", "Komárom-Nokia"];
const TRUCK_LOAD_KEYS = ["üres", "teli"];
const HOURS = Array.from({ length: 19 }, (_, i) => `${String(i + 5).padStart(2, "0")}:00`);
const VAPID_PUBLIC_KEY = 'BCeKAwDGjkhR2z5YDE_9-ET7dVsPIF_McU9FlfKW3lYze3NfU5pf8vx1gJsj9YUAEFJopn-md6GZl_64Id648Q0';

const TRANSFER_ROUTES = [
  { from: "Győr", to: "Komárom-Huawei" },
  { from: "Győr", to: "KMRM2" },
  { from: "Komárom-Huawei", to: "Győr" },
  { from: "Komárom-Huawei", to: "KMRM2" },
  { from: "KMRM2", to: "Győr" },
  { from: "KMRM2", to: "Komárom-Huawei" },
];
const TRANSFER_CATEGORIES = ["China-repacking", "Inbound", "Kiszedett lista", "Repackingolt lista", "RC-PD contract", "Egyéb"];
const HUAWEI_ZONES = ["B1", "B4"];
const PALLET_FULL_LOAD = 33;
const transferRouteKey = (r: { from: string; to: string }) => `${r.from}__${r.to}`;
const palletPercent = (count: number) =>
  Math.max(0, Math.min(100, Math.round(((count || 0) / PALLET_FULL_LOAD) * 100)));
const palletColor = (pct: number) =>
  pct >= 90 ? "#10b981" : pct >= 60 ? "#a3e635" : pct >= 30 ? "#f59e0b" : "#ef4444";

type ThemeName = "dark" | "light";

const buildColors = (mode: ThemeName) => {
  if (mode === "light") {
    return {
      mode,
      bg: "#f4f5f8",
      bgInput: "#ffffff",
      surface: "#ffffff",
      surfaceAlt: "#eef0f5",
      surfaceMuted: "#f9fafc",
      border: "#d8dce4",
      borderStrong: "#bfc4cf",
      borderSubtle: "#e2e6ec",
      text: "#1f2937",
      textInverse: "#ffffff",
      muted: "#4b5563",
      subtle: "#6b7280",
      ghost: "#9ca3af",
      veryDim: "#cbd1da",
      dimAccent: "#9ec5e6",
      accent: "#d97706",
      accentText: "#ffffff",
      accentSurface: "#fff7ed",
      cyan: "#0891b2",
      cyanLight: "#0e7490",
      cyanGhost: "#9ec5e6",
      purple: "#7c3aed",
      green: "#059669",
      greenStrong: "#10b981",
      red: "#dc2626",
      blue: "#2563eb",
      yellow: "#ca8a04",
      orange2: "#ea580c",
      violet: "#7c3aed",
      modalOverlay: "rgba(15,17,23,0.45)",
      shadow: "0 1px 3px rgba(15,17,23,0.06), 0 4px 12px rgba(15,17,23,0.05)",
      dotIdle: "#cbd1da",
      stopIdle: "#9ca3af",
      pillBg: "#eef0f5",
      headerSubtle: "#9ca3af",
    };
  }
  return {
    mode,
    bg: "#0f1117",
    bgInput: "#0f1117",
    surface: "#1a1d27",
    surfaceAlt: "#1e2130",
    surfaceMuted: "#1a1d2e",
    border: "#2a2d3a",
    borderStrong: "#374151",
    borderSubtle: "#2a2d3a",
    text: "#e2e8f0",
    textInverse: "#0f1117",
    muted: "#94a3b8",
    subtle: "#4a5568",
    ghost: "#374151",
    veryDim: "#1e2130",
    dimAccent: "#164e63",
    accent: "#f59e0b",
    accentText: "#0f1117",
    accentSurface: "#1a1d2e",
    cyan: "#06b6d4",
    cyanLight: "#67e8f9",
    cyanGhost: "#164e63",
    purple: "#a78bfa",
    green: "#10b981",
    greenStrong: "#10b981",
    red: "#ef4444",
    blue: "#3b82f6",
    yellow: "#eab308",
    orange2: "#f97316",
    violet: "#8b5cf6",
    modalOverlay: "rgba(0,0,0,0.75)",
    shadow: "none",
    dotIdle: "#2a2d3a",
    stopIdle: "#374151",
    pillBg: "#2a2d3a",
    headerSubtle: "#4a5568",
  };
};

type Colors = ReturnType<typeof buildColors>;

const T = {
  hu: {
    appSub: "LOGISZTIKAI NYOMKÖVETŐ", live: "ÉLŐ", loading: "Betöltés...",
    route: "🗺️ Útvonal terv", transferTab: "🔁 Transzfer", fuvarTab: "🚚 Fuvar igény",
    noData: "Még nincs adat",
    save: "Mentés", saved: "✓ Mentve",
    since: "óta", updatedAt: "Frissítve", dailyPlan: "Napi terv",
    editPlan: "✏️ Szerkesztés", savePlan: "💾 Mentés", cancel: "Mégse",
    lockStart: "🔒 Terv zárolása", reset: "🔄 Reset", todayRoute: "Mai útvonal",
    planningTitle: "Szerkesztés", clickWarehouses: "Kattints a raktárakra a sorrendhez:",
    futurePlan: "Ez a terv a jövő napra van előkészítve.",
    noPlan: "Még nincs útvonal tervezve erre a napra.",
    arrived: "Érkezett", loadingBtn: "Rakodás", departed: "Indult",
    truckLoad: "Kamion rakodottsága", truckStatus: "Kamion állapota",
    empty: "Üres", full: "Teli", today: "MA", tomorrow: "HOLNAP", stops: "stop",
    replaceLocation: "Csere helyszín:", insertBefore: "Elé szúr:", insertAfter: "Alá szúr:",
    fuvarTitle: "Fuvar igények", fuvarCreate: "Fuvar létrehozása",
    fuvarDraftTitle: "📋 Vázlat – még nem mentve", fuvarSavedTitle: "Mentett fuvarok",
    fuvarSave: "💾 Véglegesítés", fuvarSaved: "✓ Mentve", fuvarUpdated: "Frissítve",
    fuvarFrom: "Honnan", fuvarTo: "Hova", fuvarUrgent: "⚡ Sürgős",
    fuvarTimeFrom: "Időablak ettől", fuvarTimeTo: "Időablak eddig", fuvarAdd: "➕ Hozzáadás",
    addCargo: "📦 Rakomány", cargoModalTitle: "Rakomány hozzáadása",
    cargoScan: "Szkennelj vagy írj be egy tételt...", cargoSave: "💾 Mentés",
    cargoClear: "🗑️ Lista ürítés", cargoUpdated: "Frissítve", cargoEmpty: "Nincs rakomány rögzítve.",
    transferTitle: "Rakomány transzferek", transferRound: "forduló", transferAddRound: "➕ Új forduló",
    transferNoRounds: "Nincs forduló rögzítve.", transferLastUpdated: "Utolsó frissítés",
    transferCategory: "Csoport", transferPickCategory: "Válassz csoportot a szkenneléshez:",
    transferAddGroup: "➕ Csoport hozzáadása", transferGroupSaved: "Csoport hozzáadva",
    transferZone: "Zóna (Komárom-Huawei)", transferPickZone: "Kötelező: B1 vagy B4",
    transferDeleteRound: "Forduló törlése", transferRoundSummary: "tétel",
    transferCopy: "📋 Másolás Excelbe", transferCopied: "✓ Vágólapra másolva", transferCopyEmpty: "Nincs másolható tétel",
    palletTitle: "Paletta szám", palletHint: `Hány palettát adsz hozzá most? (${PALLET_FULL_LOAD} = 100%)`,
    palletLoad: "Rakomány töltöttség", palletRequired: "Add meg a paletta számot a mentéshez",
    palletStored: "Jelenleg eltárolva", palletNew: "Hozzáadás most", palletTotal: "Új összesen",
    note: "Megjegyzés", notePlaceholder: "Pár mondatos megjegyzés (opcionális)…",
    arrivedRound: "Érkezett",
    s_rakodasravar: "rakodásra vár", s_rakodas: "rakodás alatt", s_szedes: "szedés alatt",
    s_szedesvar: "szedésre vár", s_indulas_rakodva: "indulásra kész - rakodva",
    s_indulas_ures: "indulásra kész - üres", ss_varja: "várja", ss_erkezett: "érkezett",
    ss_rakodas: "rakodás alatt", ss_indult: "indult", ts_uton: "úton",
    ts_allomásozik: "állomásozik", ts_vár: "beállításra vár",
    exportTab: "📤 Export", exportTitle: "Adatok exportálása",
    exportCargo: "📦 Export rakomány", exportRoutePlan: "🗺️ Export útvonalterv",
    exportCargoDesc: "Rakomány adatok exportálása Excel fájlba (dátum, csoport, rakomány, honnan, hova)",
    exportRoutePlanDesc: "Útvonalterv adatok exportálása Excel fájlba (dátum, állomások időrendben, érkezési idők)",
    exportNoData: "Nincs exportálható adat.",
    exportSuccess: "Exportálás sikeres!",
  },
  en: {
    appSub: "LOGISTICS TRACKER", live: "LIVE", loading: "Loading...",
    route: "🗺️ Route Plan", transferTab: "🔁 Transfer", fuvarTab: "🚚 Transport Request",
    noData: "No data yet",
    save: "Save", saved: "✓ Saved",
    since: "ago", updatedAt: "Updated", dailyPlan: "Daily plan",
    editPlan: "✏️ Edit", savePlan: "💾 Save", cancel: "Cancel",
    lockStart: "🔒 Lock plan", reset: "🔄 Reset", todayRoute: "Today's route",
    planningTitle: "Edit", clickWarehouses: "Click warehouses to build route:",
    futurePlan: "This plan is prepared for a future day.",
    noPlan: "No route planned for this day yet.",
    arrived: "Arrived", loadingBtn: "Loading", departed: "Departed",
    truckLoad: "Truck load", truckStatus: "Truck status",
    empty: "Empty", full: "Loaded", today: "TODAY", tomorrow: "TOMORROW", stops: "stops",
    replaceLocation: "Replace location:", insertBefore: "Insert before:", insertAfter: "Insert after:",
    fuvarTitle: "Transport Requests", fuvarCreate: "New request",
    fuvarDraftTitle: "📋 Draft – not saved yet", fuvarSavedTitle: "Saved requests",
    fuvarSave: "💾 Save all", fuvarSaved: "✓ Saved", fuvarUpdated: "Updated",
    fuvarFrom: "From", fuvarTo: "To", fuvarUrgent: "⚡ Urgent",
    fuvarTimeFrom: "Time from", fuvarTimeTo: "Time to", fuvarAdd: "➕ Add",
    addCargo: "📦 Cargo", cargoModalTitle: "Add cargo",
    cargoScan: "Scan or type an item...", cargoSave: "💾 Save",
    cargoClear: "🗑️ Clear list", cargoUpdated: "Updated", cargoEmpty: "No cargo recorded.",
    transferTitle: "Cargo transfers", transferRound: "round", transferAddRound: "➕ New round",
    transferNoRounds: "No round recorded.", transferLastUpdated: "Last update",
    transferCategory: "Group", transferPickCategory: "Pick a group to scan:",
    transferAddGroup: "➕ Add group", transferGroupSaved: "Group added",
    transferZone: "Zone (Komárom-Huawei)", transferPickZone: "Required: B1 or B4",
    transferDeleteRound: "Delete round", transferRoundSummary: "items",
    transferCopy: "📋 Copy to Excel", transferCopied: "✓ Copied to clipboard", transferCopyEmpty: "Nothing to copy",
    palletTitle: "Pallet count", palletHint: `How many pallets are you adding now? (${PALLET_FULL_LOAD} = 100%)`,
    palletLoad: "Load level", palletRequired: "Pallet count required to save",
    palletStored: "Currently stored", palletNew: "Adding now", palletTotal: "New total",
    note: "Note", notePlaceholder: "A short note (optional)…",
    arrivedRound: "Arrived",
    s_rakodasravar: "waiting load", s_rakodas: "loading", s_szedes: "picking",
    s_szedesvar: "waiting pick", s_indulas_rakodva: "ready to go - loaded",
    s_indulas_ures: "ready to go - empty", ss_varja: "waiting", ss_erkezett: "arrived",
    ss_rakodas: "loading", ss_indult: "departed", ts_uton: "on the way",
    ts_allomásozik: "stationed", ts_vár: "pending setup",
    exportTab: "📤 Export", exportTitle: "Export data",
    exportCargo: "📦 Export cargo", exportRoutePlan: "🗺️ Export route plan",
    exportCargoDesc: "Export cargo data to Excel file (date, group, cargo, from, to)",
    exportRoutePlanDesc: "Export route plan data to Excel file (date, stations in order, arrival times)",
    exportNoData: "No data to export.",
    exportSuccess: "Export successful!",
  },
};

function trStatus(key: string, l: any) {
  const map: any = {
    "rakodásra vár": l.s_rakodasravar, "rakodás alatt": l.s_rakodas,
    "szedés alatt": l.s_szedes, "szedésre vár": l.s_szedesvar,
    "indulásra kész - rakodva": l.s_indulas_rakodva, "indulásra kész - üres": l.s_indulas_ures,
    várja: l.ss_varja, érkezett: l.ss_erkezett, indult: l.ss_indult,
    úton: l.ts_uton, állomásozik: l.ts_allomásozik, "beállításra vár": l.ts_vár,
    teli: l.full, üres: l.empty,
  };
  return map[key] || key;
}
function trStopStatus(key: string, l: any) {
  if (key === "rakodás alatt") return l.ss_rakodas;
  return trStatus(key, l);
}
function getDateKey(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDateLabel(k: string) {
  if (!k || !k.includes("-")) return "—";
  const [y, m, d] = k.split("-"); return `${y.slice(2)}.${m}.${d}`;
}
function getTodayKey() { return getDateKey(0); }
const initialDayPlan = () => ({ plannedRoute: [], route: [], routeLocked: false, status: "beállításra vár", location: "—", departure: null });
async function fbGet(path) {
  try { const r = await fetch(`${FIREBASE_URL}/${path}.json`); return await r.json(); } catch { return null; }
}
async function fbSet(path, data) {
  try { await fetch(`${FIREBASE_URL}/${path}.json`, { method: "PUT", body: JSON.stringify(data) }); } catch {}
}
function formatTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function formatSince(iso: string) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return null;
  const mins = Math.floor(ms / 60000), hours = Math.floor(mins / 60), days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData.split('').map((char: string) => char.charCodeAt(0)));
}
async function subscribeToPush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub) return sub;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    return sub;
  } catch (e) { console.error('Push subscription error:', e); return null; }
}

function TimeDisplay({ iso, label, c }: { iso: string, label: string, c: Colors }) {
  if (!iso) return null;
  const d = new Date(iso);
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", marginRight: 14 }}>
      <span style={{ color: c.subtle, fontSize: 9, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
      <span style={{ color: c.text, fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>{d.toLocaleString("hu-HU", { hour: "2-digit", minute: "2-digit" })}</span>
      <span style={{ color: c.subtle, fontSize: 10 }}>{d.toLocaleString("hu-HU", { month: "2-digit", day: "2-digit" })}</span>
    </div>
  );
}

function StatusBadge({ statusKey, l, c }: { statusKey: string, l: any, c: Colors }) {
  const colors: any = {
    teli: { bg: c.accent, color: c.accentText }, üres: { bg: c.surfaceAlt, color: c.muted },
    "rakodásra vár": { bg: c.yellow, color: c.accentText }, "rakodás alatt": { bg: c.blue, color: "#fff" },
    "szedés alatt": { bg: c.violet, color: "#fff" }, "szedésre vár": { bg: c.orange2, color: "#fff" },
    "indulásra kész - rakodva": { bg: c.green, color: "#fff" }, "indulásra kész - üres": { bg: c.subtle, color: "#fff" },
    érkezett: { bg: c.green, color: "#fff" }, úton: { bg: c.blue, color: "#fff" },
    állomásozik: { bg: c.green, color: "#fff" }, "beállításra vár": { bg: c.borderStrong, color: c.muted },
    indult: { bg: c.green, color: "#fff" }, várja: { bg: c.borderStrong, color: c.muted },
  };
  const s = colors[statusKey] || { bg: c.surfaceAlt, color: c.muted };
  return <span style={{ background: s.bg, color: s.color, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{trStatus(statusKey, l)}</span>;
}

const labelStyle = (c: Colors): any => ({ color: c.accent, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, display: "block" });

function CopyRoundButton({ round, l, c }: { round: any; l: any; c: any }) {
  const [copied, setCopied] = useState(false);
  const totalItems = (round?.groups || []).reduce((s: number, g: any) => s + (g.items?.length || 0), 0);
  const disabled = totalItems === 0;
  const handleCopy = async () => {
    if (disabled) return;
    const lines: string[] = [];
    (round.groups || []).forEach((g: any) => {
      (g.items || []).forEach((it: any) => {
        const cat = String(g.category ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
        const txt = String(it.text ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
        lines.push(`${cat}\t${txt}`);
      });
    });
    const tsv = lines.join("\r\n");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tsv);
      } else {
        const ta = document.createElement("textarea");
        ta.value = tsv;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(l.transferCopy);
    }
  };
  return (
    <button onClick={handleCopy} disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: copied ? c.green : "transparent",
        border: `1px solid ${copied ? c.green : c.cyan}`,
        color: copied ? "#fff" : c.cyan,
        borderRadius: 14, padding: "3px 10px",
        fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontFamily: "inherit",
      }}
      title={disabled ? l.transferCopyEmpty : l.transferCopy}
    >
      {copied ? l.transferCopied : `${l.transferCopy}${totalItems > 0 ? ` (${totalItems})` : ""}`}
    </button>
  );
}

function TransferModal({ route, roundIndex, round, onSave, onClose, l, c }: any) {
  const requiresZone = route.to === "Komárom-Huawei";
  const [groups, setGroups] = useState<any[]>(round?.groups ? round.groups.map((g: any) => ({ ...g, items: [...(g.items || [])] })) : []);
  const [zone, setZone] = useState<string | null>(round?.zone || null);
  const storedPallets = typeof round?.palletCount === "number" ? round.palletCount : 0;
  const [palletAdd, setPalletAdd] = useState<number | "">(storedPallets > 0 ? "" : "");
  const [note, setNote] = useState<string>(round?.note || "");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeItems, setActiveItems] = useState<any[]>([]);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<any>(null);

  useEffect(() => { if (activeCategory) setTimeout(() => inputRef.current?.focus(), 80); }, [activeCategory]);

  const flatItemsCount = groups.reduce((sum, g) => sum + (g.items?.length || 0), 0) + activeItems.length;
  const allTexts = [
    ...groups.flatMap((g) => g.items?.map((i: any) => i.text) || []),
    ...activeItems.map((i) => i.text),
  ];

  const addItem = (val: string) => {
    const text = val.trim(); if (!text) return;
    if (allTexts.includes(text)) { alert(`⚠️ Már scannelve: ${text}`); setInputVal(""); setTimeout(() => inputRef.current?.focus(), 50); return; }
    setActiveItems((prev) => [...prev, { text, scannedAt: new Date().toISOString() }]);
    setInputVal(""); setTimeout(() => inputRef.current?.focus(), 50);
  };
  const handleKeyDown = (e: any) => { if (e.key === "Enter") { e.preventDefault(); addItem(inputVal); } };
  const removeActiveItem = (idx: number) => setActiveItems((prev) => prev.filter((_, i) => i !== idx));
  const removeGroupItem = (gIdx: number, iIdx: number) =>
    setGroups((prev) => prev.map((g, i) => i === gIdx ? { ...g, items: g.items.filter((_: any, j: number) => j !== iIdx) } : g).filter((g) => g.items.length > 0));
  const removeGroup = (gIdx: number) => setGroups((prev) => prev.filter((_, i) => i !== gIdx));

  const commitGroup = () => {
    if (!activeCategory || activeItems.length === 0) return;
    setGroups((prev) => {
      const existingIdx = prev.findIndex((g) => g.category === activeCategory);
      if (existingIdx >= 0) {
        return prev.map((g, i) => i === existingIdx ? { ...g, items: [...g.items, ...activeItems] } : g);
      }
      return [...prev, { category: activeCategory, items: activeItems }];
    });
    setActiveItems([]); setActiveCategory(null); setInputVal("");
  };

  const palletAddNum = typeof palletAdd === "number" ? palletAdd : 0;
  const palletTotal = storedPallets + palletAddNum;
  const palletPct = palletPercent(palletTotal);
  const palletBarColor = palletColor(palletPct);
  const hasPallet = palletTotal > 0;
  const canSave = (groups.length > 0 || activeItems.length > 0) && (!requiresZone || !!zone) && hasPallet;

  const handleSave = () => {
    let finalGroups = groups;
    if (activeCategory && activeItems.length > 0) {
      const existingIdx = finalGroups.findIndex((g) => g.category === activeCategory);
      if (existingIdx >= 0) {
        finalGroups = finalGroups.map((g, i) => i === existingIdx ? { ...g, items: [...g.items, ...activeItems] } : g);
      } else {
        finalGroups = [...finalGroups, { category: activeCategory, items: activeItems }];
      }
    }
    const trimmedNote = (note || "").trim();
    const preserved: any = {};
    if (round?.arrivedAt) preserved.arrivedAt = round.arrivedAt;
    onSave({ groups: finalGroups, zone: requiresZone ? zone : null, palletCount: palletTotal, note: trimmedNote, savedAt: new Date().toISOString(), ...preserved });
    onClose();
  };

  const titleSuffix = roundIndex != null ? ` ${roundIndex + 1}. ${l.transferRound}` : ` ${l.transferRound}`;
  const isLight = c.mode === "light";

  return (
    <div style={{ position: "fixed", inset: 0, background: c.modalOverlay, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: c.surfaceMuted, border: `1px solid ${c.accent}`, borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: c.shadow }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: c.accent, fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>{l.cargoModalTitle}</div>
            <div style={{ color: c.cyan, fontSize: 11, marginTop: 2, fontWeight: 700 }}>{route.from} → {route.to}{titleSuffix}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: c.subtle, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {requiresZone && (
            <div style={{ background: c.bgInput, border: `1px solid ${zone ? c.green : c.red}`, borderRadius: 8, padding: 10 }}>
              <div style={{ color: zone ? c.green : c.red, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, fontWeight: 700 }}>{l.transferZone} – {l.transferPickZone}</div>
              <div style={{ display: "flex", gap: 8 }}>
                {HUAWEI_ZONES.map((z) => (
                  <button key={z} onClick={() => setZone(z)}
                    style={{ flex: 1, background: zone === z ? c.accent : "transparent", border: `1px solid ${zone === z ? c.accent : c.borderStrong}`, color: zone === z ? c.accentText : c.text, borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{z}</button>
                ))}
              </div>
            </div>
          )}

          {groups.length > 0 && (
            <div>
              <div style={{ color: c.subtle, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Mentett csoportok</div>
              {groups.map((g, gIdx) => (
                <div key={gIdx} style={{ background: c.bgInput, border: `1px solid ${c.border}`, borderRadius: 8, padding: 8, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ color: c.purple, fontSize: 12, fontWeight: 700 }}>📂 {g.category} <span style={{ color: c.subtle, fontWeight: 400 }}>({g.items.length})</span></div>
                    <button onClick={() => removeGroup(gIdx)} style={{ background: isLight ? "#fee2e2" : "#ef444422", border: `1px solid ${c.red}`, color: c.red, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Törlés</button>
                  </div>
                  {g.items.map((it: any, iIdx: number) => (
                    <div key={iIdx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                      <div style={{ flex: 1, color: c.text, fontSize: 12 }}>{it.text}</div>
                      <button onClick={() => removeGroupItem(gIdx, iIdx)} style={{ background: "transparent", border: "none", color: c.red, cursor: "pointer", fontSize: 13 }}>×</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div style={{ background: c.bgInput, border: `1px solid ${c.border}`, borderRadius: 8, padding: 10 }}>
            {!activeCategory ? (
              <>
                <div style={{ color: c.accent, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, fontWeight: 700 }}>{l.transferPickCategory}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {TRANSFER_CATEGORIES.map((cat) => (
                    <button key={cat} onClick={() => setActiveCategory(cat)}
                      style={{ background: "transparent", border: `1px solid ${c.purple}`, color: c.purple, borderRadius: 6, padding: "8px 6px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{cat}</button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ color: c.purple, fontSize: 12, fontWeight: 700 }}>📂 {activeCategory}</div>
                  <button onClick={() => { setActiveCategory(null); setActiveItems([]); setInputVal(""); }} style={{ background: "transparent", border: `1px solid ${c.subtle}`, color: c.subtle, borderRadius: 6, padding: "2px 8px", fontSize: 10, cursor: "pointer" }}>Mégse</button>
                </div>
                <input ref={inputRef} value={inputVal} onChange={(e) => setInputVal(e.target.value)} onKeyDown={handleKeyDown} placeholder={l.cargoScan}
                  style={{ width: "100%", background: c.bgInput, border: `1px solid ${c.accent}`, borderRadius: 8, padding: "10px 12px", color: c.text, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
                <div style={{ color: c.subtle, fontSize: 10, marginTop: 6, textAlign: "center" }}>Enter = automatikus hozzáadás</div>
                {activeItems.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {[...activeItems].reverse().map((item, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${c.borderSubtle}` }}>
                        <div style={{ flex: 1, color: c.text, fontSize: 12 }}>{item.text}</div>
                        <button onClick={() => removeActiveItem(activeItems.length - 1 - idx)} style={{ background: isLight ? "#fee2e2" : "#ef444422", border: `1px solid ${c.red}`, color: c.red, cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6 }}>Törlés</button>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={commitGroup} disabled={activeItems.length === 0}
                  style={{ marginTop: 10, width: "100%", background: activeItems.length > 0 ? c.green : c.surfaceAlt, border: "none", color: activeItems.length > 0 ? "#fff" : c.subtle, borderRadius: 8, padding: "9px", fontSize: 12, fontWeight: 700, cursor: activeItems.length > 0 ? "pointer" : "not-allowed" }}>{l.transferAddGroup} ({activeItems.length})</button>
              </>
            )}
          </div>

          {flatItemsCount === 0 && groups.length === 0 && (
            <div style={{ color: c.subtle, fontSize: 12, textAlign: "center", padding: "8px 0" }}>{l.cargoEmpty}</div>
          )}

          <div style={{ background: c.bgInput, border: `1px solid ${hasPallet ? palletBarColor : c.red}`, borderRadius: 8, padding: 10 }}>
            <div style={{ color: hasPallet ? palletBarColor : c.red, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, fontWeight: 700 }}>
              {l.palletTitle} {hasPallet ? "" : `– ${l.palletRequired}`}
            </div>

            {storedPallets > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, background: c.surfaceAlt, border: `1px solid ${c.cyan}`, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ color: c.cyan, fontSize: 11, fontWeight: 700, flex: 1 }}>{l.palletStored}:</div>
                <div style={{ color: c.text, fontSize: 16, fontWeight: 700 }}>{storedPallets}</div>
              </div>
            )}

            <div style={{ color: c.subtle, fontSize: 11, marginBottom: 8 }}>{l.palletHint}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button onClick={() => setPalletAdd((p) => Math.max(0, (typeof p === "number" ? p : 0) - 1))}
                style={{ background: c.surfaceAlt, border: `1px solid ${c.borderStrong}`, color: c.text, borderRadius: 8, padding: "8px 14px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>−</button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={palletAdd}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") { setPalletAdd(""); return; }
                  const n = parseInt(v, 10);
                  if (!isNaN(n)) setPalletAdd(Math.max(0, n));
                }}
                placeholder="0"
                style={{ flex: 1, background: c.bgInput, border: `1px solid ${c.green}`, borderRadius: 8, padding: "10px 12px", color: c.text, fontSize: 16, fontFamily: "inherit", textAlign: "center", fontWeight: 700, boxSizing: "border-box", outline: "none" }}
              />
              <button onClick={() => setPalletAdd((p) => (typeof p === "number" ? p : 0) + 1)}
                style={{ background: c.surfaceAlt, border: `1px solid ${c.borderStrong}`, color: c.text, borderRadius: 8, padding: "8px 14px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>+</button>
            </div>

            {storedPallets > 0 && palletAddNum > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, background: c.surfaceAlt, border: `1px solid ${c.green}`, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ color: c.green, fontSize: 11, fontWeight: 700, flex: 1 }}>{l.palletTotal}:</div>
                <div style={{ color: c.green, fontSize: 16, fontWeight: 700 }}>{storedPallets} + {palletAddNum} = {palletTotal}</div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ color: c.muted, fontSize: 11, fontWeight: 700 }}>{l.palletLoad}</div>
              <div style={{ color: palletBarColor, fontSize: 13, fontWeight: 700 }}>{palletTotal} / {PALLET_FULL_LOAD} · {palletPct}%</div>
            </div>
            <div style={{ width: "100%", height: 14, background: c.surfaceAlt, borderRadius: 7, overflow: "hidden", border: `1px solid ${c.border}` }}>
              <div style={{ width: `${palletPct}%`, height: "100%", background: palletBarColor, transition: "width 0.25s ease, background 0.25s ease" }} />
            </div>
          </div>

          <div style={{ background: c.bgInput, border: `1px solid ${c.border}`, borderRadius: 8, padding: 10 }}>
            <div style={{ color: c.cyan, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, fontWeight: 700 }}>📝 {l.note}</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={l.notePlaceholder}
              rows={2}
              style={{ width: "100%", background: c.bgInput, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 10px", color: c.text, fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", minHeight: 50 }}
            />
          </div>
        </div>

        <div style={{ padding: "12px 16px", borderTop: `1px solid ${c.border}`, display: "flex", gap: 8 }}>
          <button onClick={() => { if (window.confirm("Biztosan törlöd a teljes fordulót?")) { onSave(null); onClose(); } }}
            style={{ background: c.surfaceAlt, border: `1px solid ${c.red}`, color: c.red, borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{l.cargoClear}</button>
          <button onClick={handleSave} disabled={!canSave}
            style={{ flex: 1, background: canSave ? c.accent : c.surfaceAlt, border: "none", color: canSave ? c.accentText : c.subtle, borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: canSave ? "pointer" : "not-allowed" }}>{l.cargoSave}{flatItemsCount > 0 ? ` (${flatItemsCount})` : ""}</button>
        </div>
      </div>
    </div>
  );
}

function FuvarModal({ onClose, onAdd, l, c }: any) {
  const emptyForm = { from: "", to: "", via: [], urgent: false, timeFrom: "", timeTo: "" };
  const [form, setForm] = useState(emptyForm);
  const [added, setAdded] = useState([]);
  const canAdd = form.from && form.to && form.from !== form.to;
  const handleAdd = () => { if (!canAdd) return; setAdded((prev) => [...prev, form]); setForm(emptyForm); };
  const handleDone = () => { added.forEach((item) => onAdd(item)); onClose(); };
  const addVia = () => setForm((p) => ({ ...p, via: [...p.via, ""] }));
  const setVia = (i, val) => setForm((p) => ({ ...p, via: p.via.map((v, idx) => (idx === i ? val : v)) }));
  const removeVia = (i) => setForm((p) => ({ ...p, via: p.via.filter((_, idx) => idx !== i) }));
  const OPTIONAL: any = { color: c.text, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 };
  const REQUIRED: any = { color: c.accent, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 };
  return (
    <div style={{ position: "fixed", inset: 0, background: c.modalOverlay, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: c.surfaceMuted, border: `1px solid ${c.accent}`, borderRadius: 12, width: "100%", maxWidth: 460, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: c.shadow }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ color: c.accent, fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>{l.fuvarCreate}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: c.subtle, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><div style={REQUIRED}>{l.fuvarFrom}</div>
              <select className="select-dark" value={form.from} onChange={(e) => setForm((p) => ({ ...p, from: e.target.value }))}>
                <option value="">— válassz —</option>{WAREHOUSES.map((w) => <option key={w} value={w}>{w}</option>)}
              </select></div>
            <div><div style={REQUIRED}>{l.fuvarTo}</div>
              <select className="select-dark" value={form.to} onChange={(e) => setForm((p) => ({ ...p, to: e.target.value }))}>
                <option value="">— válassz —</option>{WAREHOUSES.filter((w) => w !== form.from).map((w) => <option key={w} value={w}>{w}</option>)}
              </select></div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {form.via.map((v, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  {i === 0 && <div style={OPTIONAL}>Köztes megálló (opcionális)</div>}
                  <select className="select-dark" value={v} onChange={(e) => setVia(i, e.target.value)}>
                    <option value="">— válassz —</option>{WAREHOUSES.filter((w) => w !== form.from && w !== form.to).map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <button onClick={() => removeVia(i)} style={{ background: c.mode === "light" ? "#fee2e2" : "#ef444422", border: `1px solid ${c.red}`, color: c.red, borderRadius: 6, padding: "8px 10px", fontSize: 13, cursor: "pointer", marginBottom: 1 }}>×</button>
              </div>
            ))}
            <button onClick={addVia} style={{ background: "transparent", border: `1px dashed ${c.cyan}`, color: c.cyan, borderRadius: 6, padding: "7px", fontSize: 11, cursor: "pointer", textAlign: "center" }}>+ Köztes megálló hozzáadása</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><div style={OPTIONAL}>{l.fuvarTimeFrom} (opcionális)</div>
              <select className="select-dark" value={form.timeFrom} onChange={(e) => setForm((p) => ({ ...p, timeFrom: e.target.value }))}>
                <option value="">—</option>{HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select></div>
            <div><div style={OPTIONAL}>{l.fuvarTimeTo} (opcionális)</div>
              <select className="select-dark" value={form.timeTo} onChange={(e) => setForm((p) => ({ ...p, timeTo: e.target.value }))}>
                <option value="">—</option>{HOURS.filter((h) => !form.timeFrom || h > form.timeFrom).map((h) => <option key={h} value={h}>{h}</option>)}
              </select></div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={form.urgent} onChange={(e) => setForm((p) => ({ ...p, urgent: e.target.checked }))} style={{ accentColor: c.red, width: 16, height: 16 }} />
            <span style={{ color: c.red, fontSize: 12, fontWeight: 700 }}>{l.fuvarUrgent} (opcionális)</span>
          </label>
          <button onClick={handleAdd} disabled={!canAdd} style={{ background: canAdd ? c.accent : c.surfaceAlt, border: "none", color: canAdd ? c.accentText : c.subtle, borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: canAdd ? "pointer" : "not-allowed" }}>{l.fuvarAdd}</button>
          {added.length > 0 && (
            <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
              <div style={{ color: c.subtle, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Hozzáadva ({added.length})</div>
              {added.map((item: any, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: c.text, fontSize: 13, fontWeight: 700 }}>
                      {item.from}{item.via?.filter(Boolean).map((v, i) => <span key={i}> → <span style={{ color: c.cyan }}>{v}</span></span>)}{" → "}{item.to}
                      {item.urgent && <span style={{ marginLeft: 6, color: c.red, fontSize: 10 }}>⚡</span>}
                    </div>
                    {(item.timeFrom || item.timeTo) && <div style={{ color: c.subtle, fontSize: 11, marginTop: 2 }}>🕐 {item.timeFrom || "—"} – {item.timeTo || "—"}</div>}
                  </div>
                  <button onClick={() => setAdded((prev) => prev.filter((_, i) => i !== idx))} style={{ background: "transparent", border: "none", color: c.red, cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${c.border}` }}>
          <button onClick={handleDone} disabled={added.length === 0} style={{ width: "100%", background: added.length > 0 ? c.green : c.surfaceAlt, border: "none", color: added.length > 0 ? "#fff" : c.subtle, borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: added.length > 0 ? "pointer" : "not-allowed" }}>
            Vázlathoz adás – {added.length} fuvar →
          </button>
        </div>
      </div>
    </div>
  );
}

function PaintBucketIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 11l-8.5 8.5a2.121 2.121 0 0 1-3 0L3 15a2.121 2.121 0 0 1 0-3L11.5 3.5a2.121 2.121 0 0 1 3 0L19 8" />
      <path d="M5 13l7 7" />
      <path d="M21 14s-2 2-2 4a2 2 0 0 0 4 0c0-2-2-4-2-4z" fill={color} />
    </svg>
  );
}

export default function App() {
  const PIN = "12345";
  const [authed, setAuthed] = useState(() => localStorage.getItem("tt_auth") === PIN);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const [theme, setTheme] = useState<ThemeName>(() => {
    const saved = localStorage.getItem("tt_theme");
    return saved === "light" ? "light" : "dark";
  });
  const c = buildColors(theme);
  const toggleTheme = () => setTheme((t) => {
    const next: ThemeName = t === "dark" ? "light" : "dark";
    localStorage.setItem("tt_theme", next);
    return next;
  });
  const [lang, setLang] = useState("hu");
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [days, setDays] = useState({});
  const [fuvarDay, setFuvarDay] = useState(getTodayKey());
  const [fuvarDraftMap, setFuvarDraftMap] = useState<{ [dk: string]: any[] }>({});
  const [fuvarSavedMap, setFuvarSavedMap] = useState<{ [dk: string]: { items: any[]; savedAt: string } }>({});
  const [fuvarModal, setFuvarModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(getTodayKey());
  const [transferDay, setTransferDay] = useState(getTodayKey());
  const [activeTab, setActiveTab] = useState("utvonal");
  const [loaded, setLoaded] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState(null);
  const [replacingStop, setReplacingStop] = useState(null);
  const [insertingStop, setInsertingStop] = useState(null);
  const [transfers, setTransfers] = useState<any>({});
  const [transferModal, setTransferModal] = useState<{ routeIdx: number; roundIdx: number | null } | null>(null);
  const pushSubRef = useRef<any>(null);
  const midnightRef = useRef<any>(null);
  const todayBtnRef = useRef<HTMLDivElement>(null);
  const l = T[lang];

  const syncNow = async () => {
    const d = await fbGet("days"); if (d) setDays(d);
    const fs = await fbGet("fuvarRequests");
    if (fs) {
      if (Array.isArray(fs.items)) {
        const today = getTodayKey();
        setFuvarSavedMap({ [today]: { items: fs.items, savedAt: fs.savedAt || new Date().toISOString() } });
      } else if (typeof fs === "object") {
        const cleaned: any = {};
        Object.keys(fs).forEach((k) => {
          const v: any = (fs as any)[k];
          if (v && Array.isArray(v.items)) cleaned[k] = { items: v.items, savedAt: v.savedAt || null };
        });
        setFuvarSavedMap(cleaned);
      }
    }
    const tr = await fbGet("transfers"); if (tr) setTransfers(tr);
    setLastSync(new Date().toISOString());
  };

  useEffect(() => {
    if (!authed) return;
    subscribeToPush().then(sub => {
      if (sub) { pushSubRef.current = sub; console.log('✅ Push subscription OK'); }
      else { console.warn('⚠️ Push subscription failed or denied'); }
    });
  }, [authed]);

  const sendPush = async (title: string, body: string) => {
    let sub = pushSubRef.current;
    if (!sub) { sub = await subscribeToPush(); if (sub) pushSubRef.current = sub; }
    if (!sub) { console.warn('No push subscription'); return; }
    try {
      const res = await fetch('/.netlify/functions/send-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub, title, body }) });
      console.log('Push sent:', res.status);
    } catch (e) { console.error('Push error:', e); }
  };

  useEffect(() => { if (!authed) return; const t = setInterval(() => {}, 60000); return () => clearInterval(t); }, [authed]);
  useEffect(() => { if (!authed || !loaded) return; setTimeout(() => todayBtnRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }), 300); }, [activeTab, authed, loaded]);
  useEffect(() => {
    if (!authed) return;
    const go = () => {
      const now = new Date(), tom = new Date(now);
      tom.setDate(tom.getDate() + 1); tom.setHours(0, 0, 0, 0);
      midnightRef.current = setTimeout(() => { setSelectedDay(getTodayKey()); go(); }, tom.getTime() - now.getTime());
    };
    go(); return () => clearTimeout(midnightRef.current);
  }, [authed]);
  useEffect(() => {
    if (!authed) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const t = getTodayKey();
      setSelectedDay(t);
      setTransferDay(t);
      setFuvarDay(t);
      setTimeout(() => todayBtnRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }), 300);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const load = async () => { await syncNow(); setLoaded(true); };
    load();
    const iv = setInterval(syncNow, 60000);
    return () => clearInterval(iv);
  }, [authed]);

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: c.surfaceMuted, border: `1px solid ${c.accent}`, borderRadius: 16, padding: 32, width: "100%", maxWidth: 340, textAlign: "center", boxShadow: c.shadow }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: c.accent, letterSpacing: 4, marginBottom: 4 }}>TATAI TRACKER</div>
          <div style={{ color: c.subtle, fontSize: 11, letterSpacing: 2, marginBottom: 32 }}>RAKTÁRI LOGISZTIKA</div>
          <div style={{ color: c.text, fontSize: 13, marginBottom: 12 }}>Add meg a belépési kódot</div>
          <input type="password" value={pinInput} onChange={e => { setPinInput(e.target.value); setPinError(false); }}
            onKeyDown={e => { if (e.key === "Enter") { if (pinInput === PIN) { localStorage.setItem("tt_auth", PIN); setAuthed(true); } else { setPinError(true); setPinInput(""); } } }}
            placeholder="••••••" autoFocus
            style={{ width: "100%", background: c.bgInput, border: `1px solid ${pinError ? c.red : c.accent}`, borderRadius: 8, padding: "12px", color: c.text, fontSize: 20, textAlign: "center", fontFamily: "inherit", boxSizing: "border-box" as any, outline: "none", letterSpacing: 6, marginBottom: 8 }} />
          {pinError && <div style={{ color: c.red, fontSize: 12, marginBottom: 8 }}>Helytelen kód</div>}
          <button onClick={() => { if (pinInput === PIN) { localStorage.setItem("tt_auth", PIN); setAuthed(true); } else { setPinError(true); setPinInput(""); } }}
            style={{ width: "100%", background: c.accent, border: "none", color: c.accentText, borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>Belépés</button>
        </div>
      </div>
    );
  }

  const today = getTodayKey();
  const dayKeys = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3].map((i) => getDateKey(i));
  const transferDayKeys = [-3, -2, -1, 0, 1, 2, 3].map((i) => getDateKey(i));
  const fuvarDayKeys = [-3, -2, -1, 0, 1, 2, 3].map((i) => getDateKey(i));

  const saveDayPlan = async (dk, plan) => { const nd = { ...days, [dk]: plan }; setDays(nd); await fbSet("days", nd); };

  const saveTransferRound = async (dk: string, routeIdx: number, roundIdx: number | null, roundData: any) => {
    const route = TRANSFER_ROUTES[routeIdx];
    const rk = transferRouteKey(route);
    const now = new Date().toISOString();
    const dayData = transfers[dk] || {};
    const routeData = dayData[rk] || { rounds: [], lastUpdated: null };
    let rounds = routeData.rounds ? [...routeData.rounds] : [];
    if (roundData === null) {
      if (roundIdx != null) rounds = rounds.filter((_, i) => i !== roundIdx);
    } else if (roundIdx == null) {
      rounds = [...rounds, { ...roundData, lastUpdated: now }];
    } else {
      rounds = rounds.map((r, i) => i === roundIdx ? { ...roundData, lastUpdated: now } : r);
    }
    const newRouteData = { rounds, lastUpdated: now };
    const newDayData = { ...dayData, [rk]: newRouteData };
    const newTransfers = { ...transfers, [dk]: newDayData };
    setTransfers(newTransfers);
    await fbSet("transfers", newTransfers);
  };

  const markRoundArrived = async (dk: string, routeIdx: number, roundIdx: number) => {
    const route = TRANSFER_ROUTES[routeIdx];
    const rk = transferRouteKey(route);
    const dayData = transfers[dk] || {};
    const routeData = dayData[rk];
    const round = routeData?.rounds?.[roundIdx];
    if (!round || round.arrivedAt) return;
    const now = new Date().toISOString();
    await saveTransferRound(dk, routeIdx, roundIdx, { ...round, arrivedAt: now });
  };

  const fuvarDraftFor = (dk: string) => fuvarDraftMap[dk] || [];
  const fuvarSavedFor = (dk: string) => fuvarSavedMap[dk]?.items || [];
  const fuvarSavedAtFor = (dk: string) => fuvarSavedMap[dk]?.savedAt || null;

  const addFuvarDraft = (dk: string, item: any) =>
    setFuvarDraftMap((prev) => ({ ...prev, [dk]: [...(prev[dk] || []), item] }));
  const removeFuvarDraftItem = (dk: string, idx: number) =>
    setFuvarDraftMap((prev) => ({ ...prev, [dk]: (prev[dk] || []).filter((_, i) => i !== idx) }));

  const saveFuvarDraft = async (dk: string) => {
    const draft = fuvarDraftMap[dk] || [];
    if (draft.length === 0) return;
    const existing = fuvarSavedMap[dk]?.items || [];
    const merged = [...existing, ...draft].sort((a, b) => WAREHOUSES.indexOf(a.from) - WAREHOUSES.indexOf(b.from));
    const now = new Date().toISOString();
    const next = { ...fuvarSavedMap, [dk]: { items: merged, savedAt: now } };
    setFuvarSavedMap(next);
    setFuvarDraftMap((prev) => ({ ...prev, [dk]: [] }));
    await fbSet("fuvarRequests", next);
  };
  const deleteFuvarItem = async (dk: string, idx: number) => {
    const existing = fuvarSavedMap[dk]?.items || [];
    const newItems = existing.filter((_, i) => i !== idx);
    const now = new Date().toISOString();
    const next = { ...fuvarSavedMap, [dk]: { items: newItems, savedAt: now } };
    setFuvarSavedMap(next);
    await fbSet("fuvarRequests", next);
  };

  const startEditing = (dk) => { const plan = days[dk] || initialDayPlan(); setEditingPlan({ dateKey: dk, plannedRoute: [...(plan.plannedRoute || [])] }); };
  const addToEditingRoute = (w) => { if (!editingPlan) return; setEditingPlan((prev) => ({ ...prev, plannedRoute: [...prev.plannedRoute, w] })); };
  const removeFromEditingRoute = (i) => { if (!editingPlan) return; setEditingPlan((prev) => ({ ...prev, plannedRoute: prev.plannedRoute.filter((_, idx) => idx !== i) })); };
  const saveEditingPlan = async () => {
    if (!editingPlan) return;
    const existing = days[editingPlan.dateKey] || initialDayPlan();
    if (existing.routeLocked) {
      const locked = existing.route.map((s) => s.warehouse);
      const newStops = editingPlan.plannedRoute.filter((w) => !locked.includes(w));
      const newRoute = [...existing.route, ...newStops.map((w) => ({ warehouse: w, stopStatus: "várja", arrived: null, loading: null, departed: null, truckLoad: null }))];
      await saveDayPlan(editingPlan.dateKey, { ...existing, plannedRoute: editingPlan.plannedRoute, route: newRoute });
    } else {
      await saveDayPlan(editingPlan.dateKey, { ...existing, plannedRoute: editingPlan.plannedRoute });
    }
    setEditingPlan(null);
  };

  const replaceStop = async (dk, index, newW) => {
    const plan = days[dk] || initialDayPlan();
    await saveDayPlan(dk, { ...plan, route: plan.route.map((s, i) => i === index ? { ...s, warehouse: newW } : s), plannedRoute: plan.plannedRoute.map((w, i) => i === index ? newW : w) });
    setReplacingStop(null);
  };
  const removeActiveStop = async (dk, index) => {
    const plan = days[dk] || initialDayPlan();
    await saveDayPlan(dk, { ...plan, route: plan.route.filter((_, i) => i !== index), plannedRoute: plan.plannedRoute.filter((_, i) => i !== index) });
  };
  const insertStop = async (dk, index, direction, newW) => {
    const plan = days[dk] || initialDayPlan();
    const insertAt = direction === "before" ? index : index + 1;
    const newRouteStop = { warehouse: newW, stopStatus: "várja", arrived: null, loading: null, departed: null, truckLoad: null };
    await saveDayPlan(dk, { ...plan, route: [...plan.route.slice(0, insertAt), newRouteStop, ...plan.route.slice(insertAt)], plannedRoute: [...plan.plannedRoute.slice(0, insertAt), newW, ...plan.plannedRoute.slice(insertAt)] });
    setInsertingStop(null);
  };
  const removePlannedStop = async (dk, index) => { const plan = days[dk] || initialDayPlan(); await saveDayPlan(dk, { ...plan, plannedRoute: plan.plannedRoute.filter((_, i) => i !== index) }); };
  const replacePlannedStop = async (dk, index, newW) => { const plan = days[dk] || initialDayPlan(); await saveDayPlan(dk, { ...plan, plannedRoute: plan.plannedRoute.map((w, i) => i === index ? newW : w) }); setReplacingStop(null); };
  const insertPlannedStop = async (dk, index, direction, newW) => {
    const plan = days[dk] || initialDayPlan();
    const insertAt = direction === "before" ? index : index + 1;
    await saveDayPlan(dk, { ...plan, plannedRoute: [...plan.plannedRoute.slice(0, insertAt), newW, ...plan.plannedRoute.slice(insertAt)] });
    setInsertingStop(null);
  };
  const lockAndStart = async (dk) => {
    const plan = days[dk] || initialDayPlan();
    if (!plan.plannedRoute || plan.plannedRoute.length === 0) return;
    await saveDayPlan(dk, { ...plan, routeLocked: true, route: plan.plannedRoute.map((w) => ({ warehouse: w, stopStatus: "várja", arrived: null, loading: null, departed: null, truckLoad: null })), status: "beállításra vár" });
    await sendPush(`📋 Napi terv feltöltve`, `${formatDateLabel(dk)} – ${plan.plannedRoute.length} helyszín`);
  };
  const updateStopStatus = async (dk, index, newSS) => {
    const plan = days[dk] || initialDayPlan(), now = new Date().toISOString();
    if (!plan.route || !plan.route[index]) return;
    const newRoute = plan.route.map((stop, i) => {
      if (i !== index) return stop;
      const u: any = { stopStatus: newSS };
      if (newSS === "érkezett" && !stop.arrived) u.arrived = now;
      if (newSS === "rakodás alatt" && !stop.loading) u.loading = now;
      if (newSS === "indult" && !stop.departed) u.departed = now;
      return { ...stop, ...u };
    });
    const warehouse = plan.route[index].warehouse;
    await saveDayPlan(dk, { ...plan, route: newRoute, status: newSS === "indult" ? "úton" : "állomásozik", location: newSS === "indult" ? plan.location : warehouse });
    if (newSS === "érkezett") await sendPush(`📍 Megérkezett`, warehouse);
    if (newSS === "indult") await sendPush(`🚛 Elindult`, `${warehouse} → következő helyszín`);
  };
  const revertStopStatus = async (dk, index) => {
    const plan = days[dk] || initialDayPlan();
    if (!plan.route || !plan.route[index]) return;
    const stop = plan.route[index];
    if (stop.stopStatus === "várja") return;
    const prev = stop.stopStatus === "érkezett" ? "várja" : stop.stopStatus === "rakodás alatt" ? "érkezett" : "rakodás alatt";
    const newRoute = plan.route.map((s, i) => {
      if (i !== index) return s;
      const u: any = { stopStatus: prev };
      if (prev === "érkezett") { u.loading = null; u.departed = null; u.truckLoad = null; }
      if (prev === "rakodás alatt") { u.departed = null; u.truckLoad = null; }
      if (prev === "várja") { u.arrived = null; u.loading = null; u.departed = null; u.truckLoad = null; }
      return { ...s, ...u };
    });
    const status = prev === "várja" ? (plan.route.some((s) => s.stopStatus === "indult") ? "úton" : "beállításra vár") : "állomásozik";
    const location = prev === "várja" ? (index > 0 ? plan.route[index - 1].warehouse : "—") : stop.warehouse;
    await saveDayPlan(dk, { ...plan, route: newRoute, status, location });
  };
  const resetDay = async (dk) => { await saveDayPlan(dk, initialDayPlan()); };

  if (!loaded) return (
    <div style={{ minHeight: "100vh", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: c.accent, fontSize: 20, fontFamily: "monospace" }}>{l.loading}</div>
    </div>
  );

  const stopColors: any = { várja: c.stopIdle, érkezett: c.blue, "rakodás alatt": c.accent, indult: c.green };
  const stopIcons: any = { várja: "⏸", érkezett: "🏭", "rakodás alatt": "⏳", indult: "✅" };

  // Gomb stílus segédfüggvény
  const bs = (color: string, active = false, fs = 11) => ({
    background: active ? color : c.surfaceAlt,
    border: `1px solid ${color}`,
    color: active ? c.accentText : color,
    borderRadius: 6, width: 24, height: 24, cursor: "pointer",
    fontSize: fs, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
  });

  const LABEL = labelStyle(c);
  const isLight = c.mode === "light";

  return (
    <div style={{ minHeight: "100vh", background: c.bg, fontFamily: "'DM Mono', monospace", color: c.text }} onClick={() => setShowLangMenu(false)}>
      {transferModal && (() => {
        const route = TRANSFER_ROUTES[transferModal.routeIdx];
        const rk = transferRouteKey(route);
        const dayData = transfers[transferDay] || {};
        const routeData = dayData[rk] || { rounds: [] };
        const round = transferModal.roundIdx != null ? routeData.rounds?.[transferModal.roundIdx] : null;
        return <TransferModal route={route} roundIndex={transferModal.roundIdx} round={round}
          onSave={(roundData) => saveTransferRound(transferDay, transferModal.routeIdx, transferModal.roundIdx, roundData)}
          onClose={() => setTransferModal(null)} l={l} c={c} />;
      })()}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${c.bg}; }
        .card { background: ${c.surface}; border: 1px solid ${c.border}; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: ${c.shadow}; }
        .btn-primary { background: ${c.accent}; color: ${c.accentText}; border: none; border-radius: 8px; padding: 10px 18px; font-weight: 700; cursor: pointer; font-family: inherit; font-size: 13px; width: 100%; }
        .btn-sm { background: transparent; border: 1px solid; border-radius: 6px; padding: 4px 10px; font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
        .select-dark { background: ${c.bgInput}; border: 1px solid ${c.border}; color: ${c.text}; border-radius: 8px; padding: 8px 10px; font-family: inherit; font-size: 13px; width: 100%; }
        .tab-btn { background: transparent; border: 1px solid ${c.border}; border-radius: 20px; padding: 5px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; font-family: inherit; color: ${c.subtle}; white-space: nowrap; }
        .tab-btn.active { background: ${c.accent}; color: ${c.accentText}; border-color: ${c.accent}; }
        .route-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .route-line { width: 2px; background: ${c.border}; flex: 1; min-height: 16px; margin: 2px 0; }
        .day-btn { border-radius: 8px; padding: 7px 12px; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid ${c.border}; background: ${c.surface}; color: ${c.subtle}; text-align: center; }
        .day-btn.selected { border-color: ${c.accent}; background: ${c.accent}; color: ${c.accentText}; }
        .day-btn.tomorrow-style { border-color: ${c.accent}; background: ${isLight ? "#fff7ed" : "#f59e0b22"}; color: ${c.accent}; }
        .lang-menu { position: absolute; top: 36px; right: 0; background: ${c.surface}; border: 1px solid ${c.border}; border-radius: 8px; overflow: hidden; z-index: 100; min-width: 110px; box-shadow: ${c.shadow}; }
        .lang-option { padding: 8px 16px; cursor: pointer; font-size: 12px; font-weight: 700; color: ${c.text}; }
        .lang-option:hover { background: ${c.surfaceAlt}; }
        .lang-option.active-lang { color: ${c.accent}; }
        .theme-toggle { background: transparent; border: 1px solid ${c.border}; border-radius: 8px; padding: 4px 7px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: background 0.15s ease, border-color 0.15s ease; }
        .theme-toggle:hover { background: ${c.surfaceAlt}; border-color: ${c.accent}; }
      `}</style>

      <div style={{ borderBottom: `1px solid ${c.border}`, background: c.bg, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: c.accent, letterSpacing: 2 }}>TATAI TRACKER</div>
              <div style={{ fontSize: 10, color: c.subtle, letterSpacing: 2 }}>{l.appSub}</div>
            </div>
            <button
              onClick={toggleTheme}
              className="theme-toggle"
              title={theme === "dark" ? "Világos téma" : "Sötét téma"}
              aria-label="Toggle theme"
            >
              <PaintBucketIcon color={c.accent} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <button onClick={syncNow} style={{ background: "transparent", border: `1px solid ${c.border}`, borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: 13, color: c.subtle }}>🔄</button>
              {lastSync && <div style={{ color: c.cyan, fontSize: 9, whiteSpace: "nowrap" }}>{new Date(lastSync).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.green }}></div>
              <span style={{ fontSize: 11, color: c.green }}>{l.live}</span>
            </div>
            <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowLangMenu((p) => !p)} style={{ background: "transparent", border: `1px solid ${c.border}`, borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: 16, color: c.text }}>🌐</button>
              {showLangMenu && (
                <div className="lang-menu">
                  {["hu", "en"].map((ln) => <div key={ln} className={`lang-option ${lang === ln ? "active-lang" : ""}`} onClick={() => { setLang(ln); setShowLangMenu(false); }}>{ln === "hu" ? "🇭🇺 Magyar" : "🇬🇧 English"}</div>)}
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px 10px", display: "flex", gap: 8, overflowX: "auto" }}>
          {["utvonal", "transzfer", "fuvar", "export"].map((tab) => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
              {tab === "utvonal" ? l.route : tab === "transzfer" ? l.transferTab : tab === "fuvar" ? l.fuvarTab : l.exportTab}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "16px" }}>

        {activeTab === "utvonal" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
              {dayKeys.map((dk) => {
                const isToday = dk === today, isSelected = dk === selectedDay;
                const isPast = dk < today;
                const plan = days[dk], hasRoute = plan?.plannedRoute?.length > 0;
                return (
                  <div key={dk} ref={isToday ? todayBtnRef : undefined} className={`day-btn ${isSelected ? "selected" : isToday ? "tomorrow-style" : ""}`} onClick={() => { setSelectedDay(dk); setEditingPlan(null); setReplacingStop(null); }} style={{ minWidth: 72, opacity: isPast && !isSelected ? 0.7 : 1, flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{formatDateLabel(dk)}</div>
                    <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>{isToday ? l.today : dk === getDateKey(1) ? l.tomorrow : ""}</div>
                    {hasRoute && <div style={{ fontSize: 9, color: isSelected ? c.accentText : c.green, marginTop: 2 }}>● {plan.plannedRoute.length} {l.stops}</div>}
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
                    <span style={LABEL}>✏️ {l.planningTitle} – {formatDateLabel(selectedDay)}</span>
                    <div style={{ color: c.subtle, fontSize: 11, marginBottom: 10 }}>{l.clickWarehouses}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {WAREHOUSES.map((w) => <button key={w} className="btn-sm" onClick={() => addToEditingRoute(w)} style={{ borderColor: c.cyan, color: c.cyan }}>+ {w}</button>)}
                    </div>
                    {editingPlan.plannedRoute.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={LABEL}>{l.dailyPlan}</span>
                        {editingPlan.plannedRoute.map((w, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 20, height: 20, borderRadius: "50%", background: c.surfaceAlt, border: `1px solid ${c.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: c.accent, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                            <span style={{ color: c.cyan, fontSize: 13, flex: 1 }}>🏭 {w}</span>
                            <button onClick={() => removeFromEditingRoute(i)} style={{ background: "transparent", border: "none", color: c.red, cursor: "pointer", fontSize: 18 }}>−</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={saveEditingPlan} style={{ flex: 1, padding: "10px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", border: `2px solid ${c.green}`, background: c.green, color: "#fff" }}>{l.savePlan}</button>
                      <button onClick={() => setEditingPlan(null)} style={{ flex: 1, padding: "10px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", border: `2px solid ${c.borderStrong}`, background: "transparent", color: c.subtle }}>{l.cancel}</button>
                    </div>
                  </div>
                );
              }

              const isPastDay = selectedDay < today;

              if (!plan.routeLocked) {
                return (
                  <div className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={LABEL}>📋 {formatDateLabel(selectedDay)} – {l.dailyPlan}</span>
                      {!isPastDay && <button className="btn-sm" onClick={() => startEditing(selectedDay)} style={{ borderColor: c.accent, color: c.accent }}>{l.editPlan}</button>}
                    </div>
                    {plan.plannedRoute && plan.plannedRoute.length > 0 ? (
                      <>
                        {plan.plannedRoute.map((w, i) => {
                          const isReplacingHere = replacingStop && replacingStop.dateKey === selectedDay && replacingStop.index === i;
                          const isInsertingBeforeHere = insertingStop && insertingStop.dateKey === selectedDay && insertingStop.index === i && insertingStop.direction === "before";
                          const isInsertingAfterHere = insertingStop && insertingStop.dateKey === selectedDay && insertingStop.index === i && insertingStop.direction === "after";
                          return (
                            <div key={i} style={{ marginBottom: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 20, height: 20, borderRadius: "50%", background: c.surfaceAlt, border: `1px solid ${c.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: c.accent, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                                <span style={{ color: c.cyan, fontSize: 13, flex: 1 }}>🏭 {w}</span>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button title={l.insertBefore} onClick={() => { setReplacingStop(null); setInsertingStop(isInsertingBeforeHere ? null : { dateKey: selectedDay, index: i, direction: "before", pending: null }); }} style={bs(c.purple, isInsertingBeforeHere)}>+⬆</button>
                                  <button title={l.insertAfter} onClick={() => { setReplacingStop(null); setInsertingStop(isInsertingAfterHere ? null : { dateKey: selectedDay, index: i, direction: "after", pending: null }); }} style={bs(c.purple, isInsertingAfterHere)}>+⬇</button>
                                  <button onClick={() => { setInsertingStop(null); setReplacingStop(isReplacingHere ? null : { dateKey: selectedDay, index: i, pending: null }); }} style={bs(c.cyan, isReplacingHere, 13)}>🔄</button>
                                  <button onClick={() => removePlannedStop(selectedDay, i)} style={bs(c.red, false, 14)}>−</button>
                                  {isReplacingHere && replacingStop.pending && <button onClick={() => replacePlannedStop(selectedDay, i, replacingStop.pending)} style={bs(c.green, true, 13)}>✓</button>}
                                  {(isInsertingBeforeHere || isInsertingAfterHere) && insertingStop.pending && <button onClick={() => insertPlannedStop(selectedDay, i, insertingStop.direction, insertingStop.pending)} style={bs(c.green, true, 13)}>✓</button>}
                                </div>
                              </div>
                              {isReplacingHere && (
                                <div style={{ marginTop: 6, background: c.bgInput, border: `1px solid ${c.cyan}`, borderRadius: 8, padding: 8 }}>
                                  <div style={{ color: c.cyan, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{l.replaceLocation}</div>
                                  {WAREHOUSES.filter((ww) => ww !== w).map((ww) => { const ip = replacingStop.pending === ww; return <button key={ww} onClick={() => setReplacingStop((prev) => ({ ...prev, pending: ww }))} style={{ display: "block", width: "100%", textAlign: "left", background: ip ? (isLight ? "#cffafe" : "#06b6d422") : "transparent", border: "none", borderLeft: ip ? `2px solid ${c.cyan}` : "2px solid transparent", color: ip ? c.cyan : c.subtle, padding: "5px 8px", cursor: "pointer", fontSize: 12, fontWeight: ip ? 700 : 400 }}>🏭 {ww}</button>; })}
                                </div>
                              )}
                              {(isInsertingBeforeHere || isInsertingAfterHere) && (
                                <div style={{ marginTop: 6, background: c.bgInput, border: `1px solid ${c.purple}`, borderRadius: 8, padding: 8 }}>
                                  <div style={{ color: c.purple, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{isInsertingBeforeHere ? l.insertBefore : l.insertAfter}</div>
                                  <select className="select-dark" value={insertingStop.pending || ""} onChange={(e) => setInsertingStop((prev) => ({ ...prev, pending: e.target.value || null }))}>
                                    <option value="">— válassz helyszínt —</option>{WAREHOUSES.map((ww) => <option key={ww} value={ww}>{ww}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {isToday && <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => lockAndStart(selectedDay)}>{l.lockStart}</button>}
                        {!isToday && <div style={{ marginTop: 6 }}><div style={{ color: c.subtle, fontSize: 11 }}>{l.futurePlan}</div></div>}
                      </>
                    ) : (
                      <div style={{ textAlign: "center", padding: 16 }}><div style={{ color: c.ghost, fontSize: 12 }}>{l.noPlan}</div></div>
                    )}
                  </div>
                );
              }

              // ZÁROLT TERV
              return (
                <>
                  <div className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <div style={{ fontSize: 32 }}>🚛</div>
                        <div>
                          <div style={{ color: c.text, fontSize: 16, fontWeight: 700 }}>{plan.location}</div>
                          <StatusBadge statusKey={plan.status} l={l} c={c} />
                        </div>
                      </div>
                      {isToday && <button className="btn-sm" onClick={() => resetDay(selectedDay)} style={{ borderColor: c.subtle, color: c.subtle }}>{l.reset}</button>}
                    </div>
                  </div>
                  <div className="card">
                    <span style={LABEL}>{l.todayRoute} – {formatDateLabel(selectedDay)}</span>
                    {(plan.route || []).map((stop, i) => {
                      const ss = stop.stopStatus || "várja";
                      const isLastStop = i === plan.route.length - 1;
                      const isCompleted = ss === "indult";
                      const prevOk = i === 0 ? true : plan.route[i - 1]?.stopStatus === "indult";
                      const allowed = { érkezett: prevOk && ss === "várja", "rakodás alatt": ss === "érkezett" || ss === "rakodás alatt", indult: ss === "rakodás alatt" };
                      const isReplacing = replacingStop && replacingStop.dateKey === selectedDay && replacingStop.index === i;
                      const isInsertingBefore = insertingStop && insertingStop.dateKey === selectedDay && insertingStop.index === i && insertingStop.direction === "before";
                      const isInsertingAfter = insertingStop && insertingStop.dateKey === selectedDay && insertingStop.index === i && insertingStop.direction === "after";
                      const isAnyPanel = isReplacing || isInsertingBefore || isInsertingAfter;
                      const canDepart = ss === "rakodás alatt" && stop.truckLoad;

                      const showAllEditBtns = ss === "várja";
                      const showLastStopBtns = isLastStop && (ss === "érkezett" || ss === "rakodás alatt");

                      return (
                        <div key={i} style={{ marginBottom: 16 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 14, paddingTop: 2 }}>
                              <div className="route-dot" style={{ background: ss === "várja" ? c.dotIdle : stopColors[ss] }}></div>
                              {i < plan.route.length - 1 && <div className="route-line" style={{ height: isAnyPanel ? 160 : ss === "rakodás alatt" ? 100 : 70 }}></div>}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                                <span style={{ color: ss === "várja" ? c.cyanGhost : c.cyan, fontSize: 14, fontWeight: 700 }}>{stop.warehouse}</span>
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: stopColors[ss] + (isLight ? "22" : "33"), color: stopColors[ss], fontWeight: 700 }}>{stopIcons[ss]} {trStopStatus(ss, l)}</span>
                                <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>

                                  {showAllEditBtns && (
                                    <>
                                      <button title={l.insertBefore} onClick={() => { setReplacingStop(null); setInsertingStop(isInsertingBefore ? null : { dateKey: selectedDay, index: i, direction: "before", pending: null }); }} style={bs(c.purple, isInsertingBefore)}>+⬆</button>
                                      <button title={l.insertAfter} onClick={() => { setReplacingStop(null); setInsertingStop(isInsertingAfter ? null : { dateKey: selectedDay, index: i, direction: "after", pending: null }); }} style={bs(c.purple, isInsertingAfter)}>+⬇</button>
                                      <button onClick={() => { setInsertingStop(null); setReplacingStop(isReplacing ? null : { dateKey: selectedDay, index: i, pending: null }); }} style={bs(c.cyan, isReplacing, 13)}>🔄</button>
                                      <button onClick={() => removeActiveStop(selectedDay, i)} style={bs(c.red, false, 14)}>−</button>
                                      {isReplacing && replacingStop.pending && <button onClick={() => replaceStop(selectedDay, i, replacingStop.pending)} style={bs(c.green, true, 13)}>✓</button>}
                                      {(isInsertingBefore || isInsertingAfter) && insertingStop.pending && <button onClick={() => insertStop(selectedDay, i, insertingStop.direction, insertingStop.pending)} style={bs(c.green, true, 13)}>✓</button>}
                                    </>
                                  )}

                                  {showLastStopBtns && (
                                    <>
                                      <button title={l.insertAfter} onClick={() => { setReplacingStop(null); setInsertingStop(isInsertingAfter ? null : { dateKey: selectedDay, index: i, direction: "after", pending: null }); }} style={bs(c.purple, isInsertingAfter)}>+⬇</button>
                                      <button onClick={() => { setInsertingStop(null); setReplacingStop(isReplacing ? null : { dateKey: selectedDay, index: i, pending: null }); }} style={bs(c.cyan, isReplacing, 13)}>🔄</button>
                                      <button onClick={() => removeActiveStop(selectedDay, i)} style={bs(c.red, false, 14)}>−</button>
                                      {isReplacing && replacingStop.pending && <button onClick={() => replaceStop(selectedDay, i, replacingStop.pending)} style={bs(c.green, true, 13)}>✓</button>}
                                      {isInsertingAfter && insertingStop.pending && <button onClick={() => insertStop(selectedDay, i, "after", insertingStop.pending)} style={bs(c.green, true, 13)}>✓</button>}
                                    </>
                                  )}

                                  {ss !== "várja" && (
                                    <button onClick={() => revertStopStatus(selectedDay, i)} style={bs(c.red, false, 13)}>↩</button>
                                  )}
                                </div>
                              </div>

                              {isReplacing && (
                                <div style={{ marginBottom: 8, background: c.bgInput, border: `1px solid ${c.cyan}`, borderRadius: 8, padding: 8 }}>
                                  <div style={{ color: c.cyan, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{l.replaceLocation}</div>
                                  {WAREHOUSES.filter((w) => w !== stop.warehouse).map((w) => { const ip = replacingStop.pending === w; return <button key={w} onClick={() => setReplacingStop((prev) => ({ ...prev, pending: w }))} style={{ display: "block", width: "100%", textAlign: "left", background: ip ? (isLight ? "#cffafe" : "#06b6d422") : "transparent", border: "none", borderLeft: ip ? `2px solid ${c.cyan}` : "2px solid transparent", color: ip ? c.cyan : c.subtle, padding: "5px 8px", cursor: "pointer", fontSize: 12, fontWeight: ip ? 700 : 400 }}>🏭 {w}</button>; })}
                                </div>
                              )}
                              {(isInsertingBefore || isInsertingAfter) && (
                                <div style={{ marginBottom: 8, background: c.bgInput, border: `1px solid ${c.purple}`, borderRadius: 8, padding: 8 }}>
                                  <div style={{ color: c.purple, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{isInsertingBefore ? l.insertBefore : l.insertAfter}</div>
                                  <select className="select-dark" value={insertingStop.pending || ""} onChange={(e) => setInsertingStop((prev) => ({ ...prev, pending: e.target.value || null }))} style={{ marginBottom: 0 }}>
                                    <option value="">— válassz helyszínt —</option>{WAREHOUSES.map((w) => <option key={w} value={w}>{w}</option>)}
                                  </select>
                                </div>
                              )}

                              {(stop.arrived || stop.loading || stop.departed) && (
                                <div style={{ display: "flex", flexWrap: "wrap", marginBottom: 8 }}>
                                  <TimeDisplay iso={stop.arrived} label={l.arrived} c={c} />
                                  {stop.loading && <TimeDisplay iso={stop.loading} label={l.loadingBtn} c={c} />}
                                  {stop.departed && <TimeDisplay iso={stop.departed} label={l.departed} c={c} />}
                                </div>
                              )}

                              {!isCompleted && (
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  {["érkezett", "rakodás alatt"].map((s) => {
                                    const isActive = ss === s, isEnabled = allowed[s];
                                    return <button key={s} className="btn-sm" onClick={() => isEnabled && updateStopStatus(selectedDay, i, s)} style={{ borderColor: isEnabled ? stopColors[s] : c.border, color: isActive ? "#fff" : isEnabled ? stopColors[s] : c.border, background: isActive ? stopColors[s] : "transparent", cursor: isEnabled ? "pointer" : "not-allowed", opacity: isEnabled ? 1 : 0.3 }}>{s === "érkezett" ? `🏭 ${l.arrived}` : `⏳ ${l.loadingBtn}`}</button>;
                                  })}
                                </div>
                              )}

                              {ss === "rakodás alatt" && (
                                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                                  {TRUCK_LOAD_KEYS.map((v) => { const isActive = stop.truckLoad === v; return <button key={v} className="btn-sm" onClick={() => { const nr = plan.route.map((s2, idx) => idx === i ? { ...s2, truckLoad: v } : s2); saveDayPlan(selectedDay, { ...plan, route: nr }); }} style={{ borderColor: c.cyan, color: isActive ? "#fff" : c.cyan, background: isActive ? c.cyan : "transparent", fontWeight: 700 }}>{v === "teli" ? `📦 ${l.full}` : `🔲 ${l.empty}`}</button>; })}
                                  <button className="btn-sm" disabled={!canDepart} onClick={() => canDepart && updateStopStatus(selectedDay, i, "indult")} style={{ borderColor: canDepart ? stopColors["indult"] : c.border, color: canDepart ? "#fff" : c.border, background: canDepart ? stopColors["indult"] : "transparent", cursor: canDepart ? "pointer" : "not-allowed", opacity: canDepart ? 1 : 0.3 }}>🚀 {l.departed}</button>
                                </div>
                              )}
                              {isCompleted && stop.truckLoad && <div style={{ marginTop: 4 }}><span style={{ fontSize: 11, color: c.cyan, fontWeight: 700 }}>📦 {trStatus(stop.truckLoad, l)}</span></div>}
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

        {activeTab === "transzfer" && (
          <>
            <div style={{ color: c.accent, fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2, marginBottom: 12 }}>{l.transferTitle}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 16 }}>
              {transferDayKeys.map((dk) => {
                const isToday = dk === today, isSelected = dk === transferDay;
                const dayData = transfers[dk] || {};
                const totalRounds = TRANSFER_ROUTES.reduce((sum, r) => sum + (dayData[transferRouteKey(r)]?.rounds?.length || 0), 0);
                return (
                  <div key={dk} className={`day-btn ${isSelected && isToday ? "selected" : isSelected ? "selected" : isToday ? "tomorrow-style" : ""}`} onClick={() => setTransferDay(dk)} style={{ padding: "6px 4px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{formatDateLabel(dk)}</div>
                    {isToday && <div style={{ fontSize: 9, marginTop: 2, opacity: 0.85 }}>{l.today}</div>}
                    {totalRounds > 0 && <div style={{ fontSize: 9, color: isSelected ? c.accentText : c.cyan, marginTop: 2 }}>● {totalRounds}</div>}
                  </div>
                );
              })}
            </div>

            {TRANSFER_ROUTES.map((route, routeIdx) => {
              const rk = transferRouteKey(route);
              const dayData = transfers[transferDay] || {};
              const routeData = dayData[rk] || { rounds: [], lastUpdated: null };
              const rounds = routeData.rounds || [];
              return (
                <div key={rk} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                    <div>
                      <div style={{ color: c.text, fontSize: 14, fontWeight: 700 }}>
                        <span style={{ color: c.cyan }}>{route.from}</span> <span style={{ color: c.accent }}>→</span> <span style={{ color: c.cyan }}>{route.to}</span>
                      </div>
                      {routeData.lastUpdated && <div style={{ color: c.cyanLight, fontSize: 10, marginTop: 2 }}>{l.transferLastUpdated}: {formatTime(routeData.lastUpdated)}</div>}
                    </div>
                    <button onClick={() => setTransferModal({ routeIdx, roundIdx: null })}
                      style={{ background: c.accent, border: "none", color: c.accentText, borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{l.transferAddRound}</button>
                  </div>

                  {rounds.length === 0 ? (
                    <div style={{ color: c.ghost, fontSize: 12, textAlign: "center", padding: "12px 0" }}>{l.transferNoRounds}</div>
                  ) : (
                    rounds.map((r: any, ri: number) => {
                      const itemCount = (r.groups || []).reduce((s: number, g: any) => s + (g.items?.length || 0), 0);
                      const rPallets = typeof r.palletCount === "number" ? r.palletCount : 0;
                      const rPct = palletPercent(rPallets);
                      const rColor = palletColor(rPct);
                      const arrived = !!r.arrivedAt;
                      return (
                        <div key={ri} style={{ background: c.bgInput, border: `1px solid ${c.border}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                            <div style={{ color: c.accent, fontSize: 13, fontWeight: 700 }}>{ri + 1}. {l.transferRound}{r.zone ? ` · ${r.zone}` : ""}</div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => setTransferModal({ routeIdx, roundIdx: ri })}
                                style={{ background: c.surfaceAlt, border: `1px solid ${c.cyan}`, color: c.cyan, borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{l.addCargo}{itemCount > 0 ? ` (${itemCount})` : ""}</button>
                              <button onClick={() => { if (window.confirm(`${l.transferDeleteRound}?`)) saveTransferRound(transferDay, routeIdx, ri, null); }}
                                style={{ background: isLight ? "#fee2e2" : "#ef444422", border: `1px solid ${c.red}`, color: c.red, borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🗑️</button>
                            </div>
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                              <div style={{ color: c.muted, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>📦 {l.palletTitle}</div>
                              <div style={{ color: rColor, fontSize: 11, fontWeight: 700 }}>{rPallets} / {PALLET_FULL_LOAD} · {rPct}%</div>
                            </div>
                            <div style={{ width: "100%", height: 10, background: c.surfaceAlt, borderRadius: 5, overflow: "hidden", border: `1px solid ${c.border}` }}>
                              <div style={{ width: `${rPct}%`, height: "100%", background: rColor, transition: "width 0.25s ease, background 0.25s ease" }} />
                            </div>
                          </div>
                          {(r.groups || []).map((g: any, gi: number) => (
                            <div key={gi} style={{ marginTop: 4, paddingTop: 4, borderTop: gi > 0 ? `1px solid ${c.borderSubtle}` : "none" }}>
                              <div style={{ color: c.purple, fontSize: 11, fontWeight: 700, marginBottom: 2 }}>📂 {g.category} <span style={{ color: c.subtle }}>({g.items?.length || 0} {l.transferRoundSummary})</span></div>
                              <div style={{ color: c.muted, fontSize: 11, lineHeight: 1.4 }}>
                                {(g.items || []).slice(0, 6).map((it: any) => it.text).join(", ")}
                                {g.items && g.items.length > 6 ? ` … +${g.items.length - 6}` : ""}
                              </div>
                            </div>
                          ))}
                          {r.note && (
                            <div style={{ marginTop: 8, padding: "6px 8px", background: c.surfaceAlt, border: `1px solid ${c.border}`, borderRadius: 6 }}>
                              <div style={{ color: c.cyan, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>📝 {l.note}</div>
                              <div style={{ color: c.text, fontSize: 12, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{r.note}</div>
                            </div>
                          )}
                          {r.lastUpdated && <div style={{ color: c.cyanLight, fontSize: 10, marginTop: 6 }}>{l.updatedAt}: {formatTime(r.lastUpdated)}</div>}

                          <div style={{ marginTop: 10, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8 }}>
                            <button
                              onClick={() => !arrived && markRoundArrived(transferDay, routeIdx, ri)}
                              disabled={arrived}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                background: arrived ? (isLight ? "#d1fae5" : "#10b98122") : "transparent",
                                border: `1px solid ${arrived ? c.green : c.borderStrong}`,
                                color: arrived ? c.green : c.subtle,
                                borderRadius: 14, padding: "3px 10px",
                                fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                                cursor: arrived ? "default" : "pointer",
                                fontFamily: "inherit",
                              }}
                              title={arrived ? formatTime(r.arrivedAt) : l.arrivedRound}
                            >
                              {arrived ? "✓" : "○"} {l.arrivedRound}
                              {arrived && <span style={{ color: c.green, fontWeight: 700, opacity: 0.85 }}>· {formatTime(r.arrivedAt)}</span>}
                            </button>
                            <CopyRoundButton round={r} l={l} c={c} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </>
        )}

        {activeTab === "fuvar" && (() => {
          const draft = fuvarDraftFor(fuvarDay);
          const saved = fuvarSavedFor(fuvarDay);
          const savedAt = fuvarSavedAtFor(fuvarDay);
          return (
            <>
              {fuvarModal && <FuvarModal onClose={() => setFuvarModal(false)} onAdd={(item) => addFuvarDraft(fuvarDay, item)} l={l} c={c} />}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ color: c.accent, fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2 }}>{l.fuvarTitle}</div>
                <button onClick={() => setFuvarModal(true)} style={{ background: c.accent, border: "none", color: c.accentText, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ {l.fuvarCreate}</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 16 }}>
                {fuvarDayKeys.map((dk) => {
                  const isToday = dk === today, isSelected = dk === fuvarDay;
                  const count = (fuvarSavedMap[dk]?.items?.length || 0) + (fuvarDraftMap[dk]?.length || 0);
                  return (
                    <div key={dk} className={`day-btn ${isSelected ? "selected" : isToday ? "tomorrow-style" : ""}`} onClick={() => setFuvarDay(dk)} style={{ padding: "6px 4px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{formatDateLabel(dk)}</div>
                      {isToday && <div style={{ fontSize: 9, marginTop: 2, opacity: 0.85 }}>{l.today}</div>}
                      {count > 0 && <div style={{ fontSize: 9, color: isSelected ? c.accentText : c.cyan, marginTop: 2 }}>● {count}</div>}
                    </div>
                  );
                })}
              </div>
              {draft.length > 0 && (
                <div className="card" style={{ marginBottom: 12 }}>
                  <div style={{ color: c.accent, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>{l.fuvarDraftTitle} ({draft.length})</div>
                  {draft.map((item: any, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${c.border}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: c.text, fontSize: 13, fontWeight: 700 }}>{item.from}{item.via?.filter(Boolean).map((v, i) => <span key={i}> → <span style={{ color: c.cyan }}>{v}</span></span>)}{" → "}{item.to}{item.urgent && <span style={{ marginLeft: 6, color: c.red, fontSize: 10, fontWeight: 700 }}>⚡ SÜRGŐS</span>}</div>
                        {(item.timeFrom || item.timeTo) && <div style={{ color: c.subtle, fontSize: 11, marginTop: 2 }}>🕐 {item.timeFrom || "—"} – {item.timeTo || "—"}</div>}
                      </div>
                      <button onClick={() => removeFuvarDraftItem(fuvarDay, idx)} style={{ background: isLight ? "#fee2e2" : "#ef444422", border: `1px solid ${c.red}`, color: c.red, borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>×</button>
                    </div>
                  ))}
                  <button onClick={() => saveFuvarDraft(fuvarDay)} style={{ width: "100%", marginTop: 12, background: c.green, border: "none", color: "#fff", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>💾 {l.fuvarSave} ({draft.length} fuvar)</button>
                </div>
              )}
              {saved.length === 0 && draft.length === 0 ? (
                <div className="card" style={{ textAlign: "center", color: c.subtle, fontSize: 12, padding: 24 }}>{l.noData}</div>
              ) : saved.length > 0 && (
                <div className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ color: c.green, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>✓ {l.fuvarSavedTitle} ({saved.length})</div>
                    <div style={{ color: c.cyanLight, fontSize: 10 }}>{savedAt ? `${l.fuvarUpdated}: ${formatTime(savedAt)}` : ""}</div>
                  </div>
                  {saved.map((item: any, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${c.border}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: c.text, fontSize: 13, fontWeight: 700 }}>{item.from}{item.via?.filter(Boolean).map((v, i) => <span key={i}> → <span style={{ color: c.cyan }}>{v}</span></span>)}{" → "}{item.to}{item.urgent && <span style={{ marginLeft: 6, color: c.red, fontSize: 10, fontWeight: 700 }}>⚡ SÜRGŐS</span>}</div>
                        {(item.timeFrom || item.timeTo) && <div style={{ color: c.subtle, fontSize: 11, marginTop: 2 }}>🕐 {item.timeFrom || "—"} – {item.timeTo || "—"}</div>}
                      </div>
                      <button onClick={() => deleteFuvarItem(fuvarDay, idx)} style={{ background: isLight ? "#fee2e2" : "#ef444422", border: `1px solid ${c.red}`, color: c.red, borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>🗑️</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {activeTab === "export" && (() => {
          const exportCargo = () => {
            const rows: any[][] = [["Dátum", "Csoport", "Rakomány", "Honnan", "Hova"]];
            const dateKeys = Object.keys(transfers).sort();
            dateKeys.forEach((dk) => {
              const dayData = transfers[dk] || {};
              TRANSFER_ROUTES.forEach((route) => {
                const rk = transferRouteKey(route);
                const routeData = dayData[rk];
                if (!routeData?.rounds) return;
                routeData.rounds.forEach((round: any) => {
                  (round.groups || []).forEach((g: any) => {
                    (g.items || []).forEach((item: any) => {
                      rows.push([dk, g.category || "", item.text || "", route.from, route.to]);
                    });
                  });
                });
              });
            });
            if (rows.length <= 1) { alert(l.exportNoData); return; }
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 20 }, { wch: 20 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Rakomány");
            XLSX.writeFile(wb, `rakomany_export_${getTodayKey()}.xlsx`);
          };

          const exportRoutePlan = () => {
            const dateKeys = Object.keys(days).sort();
            if (dateKeys.length === 0) { alert(l.exportNoData); return; }
            let maxStops = 0;
            dateKeys.forEach((dk) => {
              const plan = days[dk];
              const stops = plan?.route?.length || plan?.plannedRoute?.length || 0;
              if (stops > maxStops) maxStops = stops;
            });
            if (maxStops === 0) { alert(l.exportNoData); return; }
            const header: string[] = ["Dátum"];
            for (let i = 1; i <= maxStops; i++) {
              header.push(`${i}. állomás`);
              header.push(`${i}. érkezés`);
            }
            const rows: any[][] = [header];
            dateKeys.forEach((dk) => {
              const plan = days[dk];
              const route = plan?.route || [];
              const planned = plan?.plannedRoute || [];
              const stops = route.length > 0 ? route : planned.map((w: string) => ({ warehouse: w }));
              const row: any[] = [dk];
              stops.forEach((stop: any) => {
                row.push(stop.warehouse || stop || "");
                const arrival = stop.arrived ? new Date(stop.arrived).toLocaleString("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
                row.push(arrival);
              });
              while (row.length < header.length) row.push("");
              rows.push(row);
            });
            const ws = XLSX.utils.aoa_to_sheet(rows);
            const colWidths: any[] = [{ wch: 12 }];
            for (let i = 0; i < maxStops; i++) {
              colWidths.push({ wch: 20 });
              colWidths.push({ wch: 16 });
            }
            ws["!cols"] = colWidths;
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Útvonalterv");
            XLSX.writeFile(wb, `utvonalterv_export_${getTodayKey()}.xlsx`);
          };

          return (
            <>
              <div style={{ color: c.accent, fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2, marginBottom: 16 }}>{l.exportTitle}</div>
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 28 }}>📦</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: c.text, fontSize: 14, fontWeight: 700 }}>{l.exportCargo}</div>
                    <div style={{ color: c.subtle, fontSize: 11, marginTop: 2 }}>{l.exportCargoDesc}</div>
                  </div>
                </div>
                <button onClick={exportCargo} style={{ width: "100%", background: c.accent, border: "none", color: c.accentText, borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l.exportCargo}</button>
              </div>
              <div className="card">
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 28 }}>🗺️</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: c.text, fontSize: 14, fontWeight: 700 }}>{l.exportRoutePlan}</div>
                    <div style={{ color: c.subtle, fontSize: 11, marginTop: 2 }}>{l.exportRoutePlanDesc}</div>
                  </div>
                </div>
                <button onClick={exportRoutePlan} style={{ width: "100%", background: c.accent, border: "none", color: c.accentText, borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l.exportRoutePlan}</button>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
