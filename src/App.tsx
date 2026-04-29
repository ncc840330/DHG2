import { useState, useEffect, useRef } from "react";

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
];
const TRANSFER_CATEGORIES = ["China-repacking", "Inbound", "Egyéb"];
const HUAWEI_ZONES = ["B1", "B4"];
const PALLET_FULL_LOAD = 33;
const transferRouteKey = (r: { from: string; to: string }) => `${r.from}__${r.to}`;
const palletPercent = (count: number) =>
  Math.max(0, Math.min(100, Math.round(((count || 0) / PALLET_FULL_LOAD) * 100)));
const palletColor = (pct: number) =>
  pct >= 90 ? "#10b981" : pct >= 60 ? "#a3e635" : pct >= 30 ? "#f59e0b" : "#ef4444";

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
    palletTitle: "Paletta szám", palletHint: `Add meg a forduló palettaszámát (${PALLET_FULL_LOAD} = 100%)`,
    palletLoad: "Rakomány töltöttség", palletRequired: "Add meg a paletta számot a mentéshez",
    s_rakodasravar: "rakodásra vár", s_rakodas: "rakodás alatt", s_szedes: "szedés alatt",
    s_szedesvar: "szedésre vár", s_indulas_rakodva: "indulásra kész - rakodva",
    s_indulas_ures: "indulásra kész - üres", ss_varja: "várja", ss_erkezett: "érkezett",
    ss_rakodas: "rakodás alatt", ss_indult: "indult", ts_uton: "úton",
    ts_allomásozik: "állomásozik", ts_vár: "beállításra vár",
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
    palletTitle: "Pallet count", palletHint: `Enter pallet count for this round (${PALLET_FULL_LOAD} = 100%)`,
    palletLoad: "Load level", palletRequired: "Pallet count required to save",
    s_rakodasravar: "waiting load", s_rakodas: "loading", s_szedes: "picking",
    s_szedesvar: "waiting pick", s_indulas_rakodva: "ready to go - loaded",
    s_indulas_ures: "ready to go - empty", ss_varja: "waiting", ss_erkezett: "arrived",
    ss_rakodas: "loading", ss_indult: "departed", ts_uton: "on the way",
    ts_allomásozik: "stationed", ts_vár: "pending setup",
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
  const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10);
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

function TimeDisplay({ iso, label }: { iso: string, label: string }) {
  if (!iso) return null;
  const d = new Date(iso);
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", marginRight: 14 }}>
      <span style={{ color: "#6b7280", fontSize: 9, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
      <span style={{ color: "#e2e8f0", fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>{d.toLocaleString("hu-HU", { hour: "2-digit", minute: "2-digit" })}</span>
      <span style={{ color: "#6b7280", fontSize: 10 }}>{d.toLocaleString("hu-HU", { month: "2-digit", day: "2-digit" })}</span>
    </div>
  );
}

function StatusBadge({ statusKey, l }: { statusKey: string, l: any }) {
  const colors: any = {
    teli: { bg: "#f59e0b", color: "#0f1117" }, üres: { bg: "#2a2d3a", color: "#94a3b8" },
    "rakodásra vár": { bg: "#eab308", color: "#0f1117" }, "rakodás alatt": { bg: "#3b82f6", color: "#fff" },
    "szedés alatt": { bg: "#8b5cf6", color: "#fff" }, "szedésre vár": { bg: "#f97316", color: "#fff" },
    "indulásra kész - rakodva": { bg: "#10b981", color: "#fff" }, "indulásra kész - üres": { bg: "#6b7280", color: "#fff" },
    érkezett: { bg: "#10b981", color: "#fff" }, úton: { bg: "#3b82f6", color: "#fff" },
    állomásozik: { bg: "#10b981", color: "#fff" }, "beállításra vár": { bg: "#374151", color: "#94a3b8" },
    indult: { bg: "#10b981", color: "#fff" }, várja: { bg: "#374151", color: "#94a3b8" },
  };
  const s = colors[statusKey] || { bg: "#2a2d3a", color: "#94a3b8" };
  return <span style={{ background: s.bg, color: s.color, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{trStatus(statusKey, l)}</span>;
}

const LABEL: any = { color: "#f59e0b", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, display: "block" };

function TransferModal({ route, roundIndex, round, onSave, onClose, l }: any) {
  const requiresZone = route.to === "Komárom-Huawei";
  const [groups, setGroups] = useState<any[]>(round?.groups ? round.groups.map((g: any) => ({ ...g, items: [...(g.items || [])] })) : []);
  const [zone, setZone] = useState<string | null>(round?.zone || null);
  const [palletCount, setPalletCount] = useState<number | "">(typeof round?.palletCount === "number" ? round.palletCount : "");
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

  const palletNum = typeof palletCount === "number" ? palletCount : 0;
  const palletPct = palletPercent(palletNum);
  const palletBarColor = palletColor(palletPct);
  const hasPallet = typeof palletCount === "number" && palletCount > 0;
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
    onSave({ groups: finalGroups, zone: requiresZone ? zone : null, palletCount: palletNum, savedAt: new Date().toISOString() });
    onClose();
  };

  const titleSuffix = roundIndex != null ? ` ${roundIndex + 1}. ${l.transferRound}` : ` ${l.transferRound}`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#1a1d2e", border: "1px solid #f59e0b", borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #2a2d3a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>{l.cargoModalTitle}</div>
            <div style={{ color: "#06b6d4", fontSize: 11, marginTop: 2, fontWeight: 700 }}>{route.from} → {route.to}{titleSuffix}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#4a5568", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {requiresZone && (
            <div style={{ background: "#0f1117", border: `1px solid ${zone ? "#10b981" : "#ef4444"}`, borderRadius: 8, padding: 10 }}>
              <div style={{ color: zone ? "#10b981" : "#ef4444", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, fontWeight: 700 }}>{l.transferZone} – {l.transferPickZone}</div>
              <div style={{ display: "flex", gap: 8 }}>
                {HUAWEI_ZONES.map((z) => (
                  <button key={z} onClick={() => setZone(z)}
                    style={{ flex: 1, background: zone === z ? "#f59e0b" : "transparent", border: `1px solid ${zone === z ? "#f59e0b" : "#374151"}`, color: zone === z ? "#0f1117" : "#e2e8f0", borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{z}</button>
                ))}
              </div>
            </div>
          )}

          {groups.length > 0 && (
            <div>
              <div style={{ color: "#4a5568", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Mentett csoportok</div>
              {groups.map((g, gIdx) => (
                <div key={gIdx} style={{ background: "#0f1117", border: "1px solid #2a2d3a", borderRadius: 8, padding: 8, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ color: "#a78bfa", fontSize: 12, fontWeight: 700 }}>📂 {g.category} <span style={{ color: "#4a5568", fontWeight: 400 }}>({g.items.length})</span></div>
                    <button onClick={() => removeGroup(gIdx)} style={{ background: "#ef444422", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Törlés</button>
                  </div>
                  {g.items.map((it: any, iIdx: number) => (
                    <div key={iIdx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                      <div style={{ flex: 1, color: "#e2e8f0", fontSize: 12 }}>{it.text}</div>
                      <button onClick={() => removeGroupItem(gIdx, iIdx)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13 }}>×</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div style={{ background: "#0f1117", border: "1px solid #2a2d3a", borderRadius: 8, padding: 10 }}>
            {!activeCategory ? (
              <>
                <div style={{ color: "#f59e0b", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, fontWeight: 700 }}>{l.transferPickCategory}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {TRANSFER_CATEGORIES.map((c) => (
                    <button key={c} onClick={() => setActiveCategory(c)}
                      style={{ background: "transparent", border: "1px solid #a78bfa", color: "#a78bfa", borderRadius: 6, padding: "8px 6px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{c}</button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ color: "#a78bfa", fontSize: 12, fontWeight: 700 }}>📂 {activeCategory}</div>
                  <button onClick={() => { setActiveCategory(null); setActiveItems([]); setInputVal(""); }} style={{ background: "transparent", border: "1px solid #4a5568", color: "#4a5568", borderRadius: 6, padding: "2px 8px", fontSize: 10, cursor: "pointer" }}>Mégse</button>
                </div>
                <input ref={inputRef} value={inputVal} onChange={(e) => setInputVal(e.target.value)} onKeyDown={handleKeyDown} placeholder={l.cargoScan}
                  style={{ width: "100%", background: "#0f1117", border: "1px solid #f59e0b", borderRadius: 8, padding: "10px 12px", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
                <div style={{ color: "#4a5568", fontSize: 10, marginTop: 6, textAlign: "center" }}>Enter = automatikus hozzáadás</div>
                {activeItems.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {[...activeItems].reverse().map((item, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid #2a2d3a22" }}>
                        <div style={{ flex: 1, color: "#e2e8f0", fontSize: 12 }}>{item.text}</div>
                        <button onClick={() => removeActiveItem(activeItems.length - 1 - idx)} style={{ background: "#ef444422", border: "1px solid #ef4444", color: "#ef4444", cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6 }}>Törlés</button>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={commitGroup} disabled={activeItems.length === 0}
                  style={{ marginTop: 10, width: "100%", background: activeItems.length > 0 ? "#10b981" : "#2a2d3a", border: "none", color: activeItems.length > 0 ? "#fff" : "#4a5568", borderRadius: 8, padding: "9px", fontSize: 12, fontWeight: 700, cursor: activeItems.length > 0 ? "pointer" : "not-allowed" }}>{l.transferAddGroup} ({activeItems.length})</button>
              </>
            )}
          </div>

          {flatItemsCount === 0 && groups.length === 0 && (
            <div style={{ color: "#4a5568", fontSize: 12, textAlign: "center", padding: "8px 0" }}>{l.cargoEmpty}</div>
          )}

          <div style={{ background: "#0f1117", border: `1px solid ${hasPallet ? palletBarColor : "#ef4444"}`, borderRadius: 8, padding: 10 }}>
            <div style={{ color: hasPallet ? palletBarColor : "#ef4444", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, fontWeight: 700 }}>
              {l.palletTitle} {hasPallet ? "" : `– ${l.palletRequired}`}
            </div>
            <div style={{ color: "#4a5568", fontSize: 11, marginBottom: 8 }}>{l.palletHint}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <button onClick={() => setPalletCount((p) => Math.max(0, (typeof p === "number" ? p : 0) - 1))}
                style={{ background: "#1e2130", border: "1px solid #374151", color: "#e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>−</button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={palletCount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") { setPalletCount(""); return; }
                  const n = parseInt(v, 10);
                  if (!isNaN(n)) setPalletCount(Math.max(0, n));
                }}
                placeholder="0"
                style={{ flex: 1, background: "#0f1117", border: `1px solid ${hasPallet ? palletBarColor : "#ef4444"}`, borderRadius: 8, padding: "10px 12px", color: "#e2e8f0", fontSize: 16, fontFamily: "inherit", textAlign: "center", fontWeight: 700, boxSizing: "border-box", outline: "none" }}
              />
              <button onClick={() => setPalletCount((p) => (typeof p === "number" ? p : 0) + 1)}
                style={{ background: "#1e2130", border: "1px solid #374151", color: "#e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>+</button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700 }}>{l.palletLoad}</div>
              <div style={{ color: palletBarColor, fontSize: 13, fontWeight: 700 }}>{palletNum} / {PALLET_FULL_LOAD} · {palletPct}%</div>
            </div>
            <div style={{ width: "100%", height: 14, background: "#1e2130", borderRadius: 7, overflow: "hidden", border: "1px solid #2a2d3a" }}>
              <div style={{ width: `${palletPct}%`, height: "100%", background: palletBarColor, transition: "width 0.25s ease, background 0.25s ease" }} />
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid #2a2d3a", display: "flex", gap: 8 }}>
          <button onClick={() => { if (window.confirm("Biztosan törlöd a teljes fordulót?")) { onSave(null); onClose(); } }}
            style={{ background: "#1e2130", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{l.cargoClear}</button>
          <button onClick={handleSave} disabled={!canSave}
            style={{ flex: 1, background: canSave ? "#f59e0b" : "#2a2d3a", border: "none", color: canSave ? "#0f1117" : "#4a5568", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: canSave ? "pointer" : "not-allowed" }}>{l.cargoSave}{flatItemsCount > 0 ? ` (${flatItemsCount})` : ""}</button>
        </div>
      </div>
    </div>
  );
}

function FuvarModal({ onClose, onAdd, l }: any) {
  const emptyForm = { from: "", to: "", via: [], urgent: false, timeFrom: "", timeTo: "" };
  const [form, setForm] = useState(emptyForm);
  const [added, setAdded] = useState([]);
  const canAdd = form.from && form.to && form.from !== form.to;
  const handleAdd = () => { if (!canAdd) return; setAdded((prev) => [...prev, form]); setForm(emptyForm); };
  const handleDone = () => { added.forEach((item) => onAdd(item)); onClose(); };
  const addVia = () => setForm((p) => ({ ...p, via: [...p.via, ""] }));
  const setVia = (i, val) => setForm((p) => ({ ...p, via: p.via.map((v, idx) => (idx === i ? val : v)) }));
  const removeVia = (i) => setForm((p) => ({ ...p, via: p.via.filter((_, idx) => idx !== i) }));
  const OPTIONAL: any = { color: "#e2e8f0", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 };
  const REQUIRED: any = { color: "#f59e0b", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#1a1d2e", border: "1px solid #f59e0b", borderRadius: 12, width: "100%", maxWidth: 460, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #2a2d3a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>{l.fuvarCreate}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#4a5568", fontSize: 20, cursor: "pointer" }}>×</button>
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
                <button onClick={() => removeVia(i)} style={{ background: "#ef444422", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 6, padding: "8px 10px", fontSize: 13, cursor: "pointer", marginBottom: 1 }}>×</button>
              </div>
            ))}
            <button onClick={addVia} style={{ background: "transparent", border: "1px dashed #06b6d4", color: "#06b6d4", borderRadius: 6, padding: "7px", fontSize: 11, cursor: "pointer", textAlign: "center" }}>+ Köztes megálló hozzáadása</button>
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
            <input type="checkbox" checked={form.urgent} onChange={(e) => setForm((p) => ({ ...p, urgent: e.target.checked }))} style={{ accentColor: "#ef4444", width: 16, height: 16 }} />
            <span style={{ color: "#ef4444", fontSize: 12, fontWeight: 700 }}>{l.fuvarUrgent} (opcionális)</span>
          </label>
          <button onClick={handleAdd} disabled={!canAdd} style={{ background: canAdd ? "#f59e0b" : "#2a2d3a", border: "none", color: canAdd ? "#0f1117" : "#4a5568", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: canAdd ? "pointer" : "not-allowed" }}>{l.fuvarAdd}</button>
          {added.length > 0 && (
            <div style={{ borderTop: "1px solid #2a2d3a", paddingTop: 10 }}>
              <div style={{ color: "#4a5568", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Hozzáadva ({added.length})</div>
              {added.map((item: any, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #2a2d3a22" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 700 }}>
                      {item.from}{item.via?.filter(Boolean).map((v, i) => <span key={i}> → <span style={{ color: "#06b6d4" }}>{v}</span></span>)}{" → "}{item.to}
                      {item.urgent && <span style={{ marginLeft: 6, color: "#ef4444", fontSize: 10 }}>⚡</span>}
                    </div>
                    {(item.timeFrom || item.timeTo) && <div style={{ color: "#4a5568", fontSize: 11, marginTop: 2 }}>🕐 {item.timeFrom || "—"} – {item.timeTo || "—"}</div>}
                  </div>
                  <button onClick={() => setAdded((prev) => prev.filter((_, i) => i !== idx))} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid #2a2d3a" }}>
          <button onClick={handleDone} disabled={added.length === 0} style={{ width: "100%", background: added.length > 0 ? "#10b981" : "#2a2d3a", border: "none", color: added.length > 0 ? "#fff" : "#4a5568", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: added.length > 0 ? "pointer" : "not-allowed" }}>
            Vázlathoz adás – {added.length} fuvar →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const PIN = "12345";
  const [authed, setAuthed] = useState(() => localStorage.getItem("tt_auth") === PIN);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#1a1d2e", border: "1px solid #f59e0b", borderRadius: 16, padding: 32, width: "100%", maxWidth: 340, textAlign: "center" }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#f59e0b", letterSpacing: 4, marginBottom: 4 }}>TATAI TRACKER</div>
          <div style={{ color: "#4a5568", fontSize: 11, letterSpacing: 2, marginBottom: 32 }}>RAKTÁRI LOGISZTIKA</div>
          <div style={{ color: "#e2e8f0", fontSize: 13, marginBottom: 12 }}>Add meg a belépési kódot</div>
          <input type="password" value={pinInput} onChange={e => { setPinInput(e.target.value); setPinError(false); }}
            onKeyDown={e => { if (e.key === "Enter") { if (pinInput === PIN) { localStorage.setItem("tt_auth", PIN); setAuthed(true); } else { setPinError(true); setPinInput(""); } } }}
            placeholder="••••••" autoFocus
            style={{ width: "100%", background: "#0f1117", border: `1px solid ${pinError ? "#ef4444" : "#f59e0b"}`, borderRadius: 8, padding: "12px", color: "#e2e8f0", fontSize: 20, textAlign: "center", fontFamily: "inherit", boxSizing: "border-box" as any, outline: "none", letterSpacing: 6, marginBottom: 8 }} />
          {pinError && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>Helytelen kód</div>}
          <button onClick={() => { if (pinInput === PIN) { localStorage.setItem("tt_auth", PIN); setAuthed(true); } else { setPinError(true); setPinInput(""); } }}
            style={{ width: "100%", background: "#f59e0b", border: "none", color: "#0f1117", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>Belépés</button>
        </div>
      </div>
    );
  }

  const [lang, setLang] = useState("hu");
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [days, setDays] = useState({});
  const [fuvarDraft, setFuvarDraft] = useState([]);
  const [fuvarSaved, setFuvarSaved] = useState([]);
  const [fuvarSavedAt, setFuvarSavedAt] = useState(null);
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
  const l = T[lang];

  useEffect(() => {
    subscribeToPush().then(sub => {
      if (sub) { pushSubRef.current = sub; console.log('✅ Push subscription OK'); }
      else { console.warn('⚠️ Push subscription failed or denied'); }
    });
  }, []);

  const sendPush = async (title: string, body: string) => {
    let sub = pushSubRef.current;
    if (!sub) { sub = await subscribeToPush(); if (sub) pushSubRef.current = sub; }
    if (!sub) { console.warn('No push subscription'); return; }
    try {
      const res = await fetch('/.netlify/functions/send-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub, title, body }) });
      console.log('Push sent:', res.status);
    } catch (e) { console.error('Push error:', e); }
  };

  useEffect(() => { const t = setInterval(() => {}, 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const go = () => {
      const now = new Date(), tom = new Date(now);
      tom.setDate(tom.getDate() + 1); tom.setHours(0, 0, 0, 0);
      midnightRef.current = setTimeout(() => { setSelectedDay(getTodayKey()); go(); }, tom.getTime() - now.getTime());
    };
    go(); return () => clearTimeout(midnightRef.current);
  }, []);

  const syncNow = async () => {
    const d = await fbGet("days"); if (d) setDays(d);
    const fs = await fbGet("fuvarRequests");
    if (fs) { setFuvarSaved(fs.items || []); setFuvarSavedAt(fs.savedAt || null); }
    const tr = await fbGet("transfers"); if (tr) setTransfers(tr);
    setLastSync(new Date().toISOString());
  };

  useEffect(() => {
    const load = async () => { await syncNow(); setLoaded(true); };
    load();
    const iv = setInterval(syncNow, 60000);
    return () => clearInterval(iv);
  }, []);

  const today = getTodayKey();
  const dayKeys = [0, 1, 2, 3].map((i) => getDateKey(i));
  const transferDayKeys = [-3, -2, -1, 0, 1, 2, 3].map((i) => getDateKey(i));

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

  const saveFuvarDraft = async () => {
    const now = new Date().toISOString();
    const sorted = [...fuvarSaved, ...fuvarDraft].sort((a, b) => WAREHOUSES.indexOf(a.from) - WAREHOUSES.indexOf(b.from));
    setFuvarSaved(sorted); setFuvarSavedAt(now); setFuvarDraft([]);
    await fbSet("fuvarRequests", { items: sorted, savedAt: now });
  };
  const deleteFuvarItem = async (idx) => {
    const newItems = fuvarSaved.filter((_, i) => i !== idx);
    const now = new Date().toISOString();
    setFuvarSaved(newItems); setFuvarSavedAt(now);
    await fbSet("fuvarRequests", { items: newItems, savedAt: now });
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
    <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#f59e0b", fontSize: 20, fontFamily: "monospace" }}>{l.loading}</div>
    </div>
  );

  const stopColors: any = { várja: "#374151", érkezett: "#3b82f6", "rakodás alatt": "#f59e0b", indult: "#10b981" };
  const stopIcons: any = { várja: "⏸", érkezett: "🏭", "rakodás alatt": "⏳", indult: "✅" };

  // Gomb stílus segédfüggvény
  const bs = (color: string, active = false, fs = 11) => ({
    background: active ? color : "#1e2130",
    border: `1px solid ${color}`,
    color: active ? "#0f1117" : color,
    borderRadius: 6, width: 24, height: 24, cursor: "pointer",
    fontSize: fs, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", fontFamily: "'DM Mono', monospace" }} onClick={() => setShowLangMenu(false)}>
      {transferModal && (() => {
        const route = TRANSFER_ROUTES[transferModal.routeIdx];
        const rk = transferRouteKey(route);
        const dayData = transfers[transferDay] || {};
        const routeData = dayData[rk] || { rounds: [] };
        const round = transferModal.roundIdx != null ? routeData.rounds?.[transferModal.roundIdx] : null;
        return <TransferModal route={route} roundIndex={transferModal.roundIdx} round={round}
          onSave={(roundData) => saveTransferRound(transferDay, transferModal.routeIdx, transferModal.roundIdx, roundData)}
          onClose={() => setTransferModal(null)} l={l} />;
      })()}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .card { background: #1a1d27; border: 1px solid #2a2d3a; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
        .btn-primary { background: #f59e0b; color: #0f1117; border: none; border-radius: 8px; padding: 10px 18px; font-weight: 700; cursor: pointer; font-family: inherit; font-size: 13px; width: 100%; }
        .btn-sm { background: transparent; border: 1px solid; border-radius: 6px; padding: 4px 10px; font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
        .select-dark { background: #0f1117; border: 1px solid #2a2d3a; color: #e2e8f0; border-radius: 8px; padding: 8px 10px; font-family: inherit; font-size: 13px; width: 100%; }
        .tab-btn { background: transparent; border: 1px solid #2a2d3a; border-radius: 20px; padding: 5px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; font-family: inherit; color: #4a5568; white-space: nowrap; }
        .tab-btn.active { background: #f59e0b; color: #0f1117; border-color: #f59e0b; }
        .route-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .route-line { width: 2px; background: #2a2d3a; flex: 1; min-height: 16px; margin: 2px 0; }
        .day-btn { border-radius: 8px; padding: 7px 12px; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid #2a2d3a; background: #1a1d27; color: #4a5568; text-align: center; }
        .day-btn.selected { border-color: #f59e0b; background: #f59e0b; color: #0f1117; }
        .day-btn.tomorrow-style { border-color: #f59e0b; background: #f59e0b22; color: #f59e0b; }
        .lang-menu { position: absolute; top: 36px; right: 0; background: #1a1d27; border: 1px solid #2a2d3a; border-radius: 8px; overflow: hidden; z-index: 100; min-width: 110px; }
        .lang-option { padding: 8px 16px; cursor: pointer; font-size: 12px; font-weight: 700; color: #e2e8f0; }
        .lang-option:hover { background: #2a2d3a; }
        .lang-option.active-lang { color: #f59e0b; }
      `}</style>

      <div style={{ borderBottom: "1px solid #2a2d3a", background: "#0f1117", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#f59e0b", letterSpacing: 2 }}>TATAI TRACKER</div>
            <div style={{ fontSize: 10, color: "#4a5568", letterSpacing: 2 }}>{l.appSub}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <button onClick={syncNow} style={{ background: "transparent", border: "1px solid #2a2d3a", borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: 13, color: "#4a5568" }}>🔄</button>
              {lastSync && <div style={{ color: "#06b6d4", fontSize: 9, whiteSpace: "nowrap" }}>{new Date(lastSync).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }}></div>
              <span style={{ fontSize: 11, color: "#10b981" }}>{l.live}</span>
            </div>
            <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowLangMenu((p) => !p)} style={{ background: "transparent", border: "1px solid #2a2d3a", borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: 16, color: "#e2e8f0" }}>🌐</button>
              {showLangMenu && (
                <div className="lang-menu">
                  {["hu", "en"].map((ln) => <div key={ln} className={`lang-option ${lang === ln ? "active-lang" : ""}`} onClick={() => { setLang(ln); setShowLangMenu(false); }}>{ln === "hu" ? "🇭🇺 Magyar" : "🇬🇧 English"}</div>)}
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px 10px", display: "flex", gap: 8, overflowX: "auto" }}>
          {["utvonal", "transzfer", "fuvar"].map((tab) => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
              {tab === "utvonal" ? l.route : tab === "transzfer" ? l.transferTab : l.fuvarTab}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "16px" }}>

        {activeTab === "utvonal" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
              {dayKeys.map((dk) => {
                const isToday = dk === today, isSelected = dk === selectedDay;
                const plan = days[dk], hasRoute = plan?.plannedRoute?.length > 0;
                return (
                  <div key={dk} className={`day-btn ${isSelected ? "selected" : isToday ? "tomorrow-style" : ""}`} onClick={() => { setSelectedDay(dk); setEditingPlan(null); setReplacingStop(null); }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{formatDateLabel(dk)}</div>
                    <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>{isToday ? l.today : dk === getDateKey(1) ? l.tomorrow : ""}</div>
                    {hasRoute && <div style={{ fontSize: 9, color: isSelected ? "#0f1117" : "#10b981", marginTop: 2 }}>● {plan.plannedRoute.length} {l.stops}</div>}
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
                    <div style={{ color: "#4a5568", fontSize: 11, marginBottom: 10 }}>{l.clickWarehouses}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {WAREHOUSES.map((w) => <button key={w} className="btn-sm" onClick={() => addToEditingRoute(w)} style={{ borderColor: "#06b6d4", color: "#06b6d4" }}>+ {w}</button>)}
                    </div>
                    {editingPlan.plannedRoute.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={LABEL}>{l.dailyPlan}</span>
                        {editingPlan.plannedRoute.map((w, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#1e2130", border: "1px solid #f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#f59e0b", fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                            <span style={{ color: "#06b6d4", fontSize: 13, flex: 1 }}>🏭 {w}</span>
                            <button onClick={() => removeFromEditingRoute(i)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 18 }}>−</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={saveEditingPlan} style={{ flex: 1, padding: "10px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "2px solid #10b981", background: "#10b981", color: "#fff" }}>{l.savePlan}</button>
                      <button onClick={() => setEditingPlan(null)} style={{ flex: 1, padding: "10px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "2px solid #374151", background: "transparent", color: "#4a5568" }}>{l.cancel}</button>
                    </div>
                  </div>
                );
              }

              if (!plan.routeLocked) {
                return (
                  <div className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={LABEL}>📋 {formatDateLabel(selectedDay)} – {l.dailyPlan}</span>
                      <button className="btn-sm" onClick={() => startEditing(selectedDay)} style={{ borderColor: "#f59e0b", color: "#f59e0b" }}>{l.editPlan}</button>
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
                                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#1e2130", border: "1px solid #f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#f59e0b", fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                                <span style={{ color: "#06b6d4", fontSize: 13, flex: 1 }}>🏭 {w}</span>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button title={l.insertBefore} onClick={() => { setReplacingStop(null); setInsertingStop(isInsertingBeforeHere ? null : { dateKey: selectedDay, index: i, direction: "before", pending: null }); }} style={bs("#a78bfa", isInsertingBeforeHere)}>+⬆</button>
                                  <button title={l.insertAfter} onClick={() => { setReplacingStop(null); setInsertingStop(isInsertingAfterHere ? null : { dateKey: selectedDay, index: i, direction: "after", pending: null }); }} style={bs("#a78bfa", isInsertingAfterHere)}>+⬇</button>
                                  <button onClick={() => { setInsertingStop(null); setReplacingStop(isReplacingHere ? null : { dateKey: selectedDay, index: i, pending: null }); }} style={bs("#06b6d4", isReplacingHere, 13)}>🔄</button>
                                  <button onClick={() => removePlannedStop(selectedDay, i)} style={bs("#ef4444", false, 14)}>−</button>
                                  {isReplacingHere && replacingStop.pending && <button onClick={() => replacePlannedStop(selectedDay, i, replacingStop.pending)} style={bs("#10b981", true, 13)}>✓</button>}
                                  {(isInsertingBeforeHere || isInsertingAfterHere) && insertingStop.pending && <button onClick={() => insertPlannedStop(selectedDay, i, insertingStop.direction, insertingStop.pending)} style={bs("#10b981", true, 13)}>✓</button>}
                                </div>
                              </div>
                              {isReplacingHere && (
                                <div style={{ marginTop: 6, background: "#0f1117", border: "1px solid #06b6d4", borderRadius: 8, padding: 8 }}>
                                  <div style={{ color: "#06b6d4", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{l.replaceLocation}</div>
                                  {WAREHOUSES.filter((ww) => ww !== w).map((ww) => { const ip = replacingStop.pending === ww; return <button key={ww} onClick={() => setReplacingStop((prev) => ({ ...prev, pending: ww }))} style={{ display: "block", width: "100%", textAlign: "left", background: ip ? "#06b6d422" : "transparent", border: "none", borderLeft: ip ? "2px solid #06b6d4" : "2px solid transparent", color: ip ? "#06b6d4" : "#4a5568", padding: "5px 8px", cursor: "pointer", fontSize: 12, fontWeight: ip ? 700 : 400 }}>🏭 {ww}</button>; })}
                                </div>
                              )}
                              {(isInsertingBeforeHere || isInsertingAfterHere) && (
                                <div style={{ marginTop: 6, background: "#0f1117", border: "1px solid #a78bfa", borderRadius: 8, padding: 8 }}>
                                  <div style={{ color: "#a78bfa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{isInsertingBeforeHere ? l.insertBefore : l.insertAfter}</div>
                                  <select className="select-dark" value={insertingStop.pending || ""} onChange={(e) => setInsertingStop((prev) => ({ ...prev, pending: e.target.value || null }))}>
                                    <option value="">— válassz helyszínt —</option>{WAREHOUSES.map((ww) => <option key={ww} value={ww}>{ww}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {isToday && <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => lockAndStart(selectedDay)}>{l.lockStart}</button>}
                        {!isToday && <div style={{ marginTop: 6 }}><div style={{ color: "#4a5568", fontSize: 11 }}>{l.futurePlan}</div></div>}
                      </>
                    ) : (
                      <div style={{ textAlign: "center", padding: 16 }}><div style={{ color: "#374151", fontSize: 12 }}>{l.noPlan}</div></div>
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
                          <div style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 700 }}>{plan.location}</div>
                          <StatusBadge statusKey={plan.status} l={l} />
                        </div>
                      </div>
                      {isToday && <button className="btn-sm" onClick={() => resetDay(selectedDay)} style={{ borderColor: "#4a5568", color: "#4a5568" }}>{l.reset}</button>}
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

                      // Szerkesztő gombok logika:
                      // "várja": +⬆ +⬇ 🔄 − (mind a 4)
                      // utolsó stop + érkezett/rakodás alatt: +⬇ 🔄 − ↩ (elé szúr NEM kell)
                      // egyéb nem "várja": csak ↩
                      const showAllEditBtns = ss === "várja";
                      const showLastStopBtns = isLastStop && (ss === "érkezett" || ss === "rakodás alatt");

                      return (
                        <div key={i} style={{ marginBottom: 16 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 14, paddingTop: 2 }}>
                              <div className="route-dot" style={{ background: ss === "várja" ? "#2a2d3a" : stopColors[ss] }}></div>
                              {i < plan.route.length - 1 && <div className="route-line" style={{ height: isAnyPanel ? 160 : ss === "rakodás alatt" ? 100 : 70 }}></div>}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                                <span style={{ color: ss === "várja" ? "#164e63" : "#06b6d4", fontSize: 14, fontWeight: 700 }}>{stop.warehouse}</span>
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: stopColors[ss] + "33", color: stopColors[ss], fontWeight: 700 }}>{stopIcons[ss]} {trStopStatus(ss, l)}</span>
                                <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>

                                  {/* "várja" státusz: mind a 4 szerkesztő gomb */}
                                  {showAllEditBtns && (
                                    <>
                                      <button title={l.insertBefore} onClick={() => { setReplacingStop(null); setInsertingStop(isInsertingBefore ? null : { dateKey: selectedDay, index: i, direction: "before", pending: null }); }} style={bs("#a78bfa", isInsertingBefore)}>+⬆</button>
                                      <button title={l.insertAfter} onClick={() => { setReplacingStop(null); setInsertingStop(isInsertingAfter ? null : { dateKey: selectedDay, index: i, direction: "after", pending: null }); }} style={bs("#a78bfa", isInsertingAfter)}>+⬇</button>
                                      <button onClick={() => { setInsertingStop(null); setReplacingStop(isReplacing ? null : { dateKey: selectedDay, index: i, pending: null }); }} style={bs("#06b6d4", isReplacing, 13)}>🔄</button>
                                      <button onClick={() => removeActiveStop(selectedDay, i)} style={bs("#ef4444", false, 14)}>−</button>
                                      {isReplacing && replacingStop.pending && <button onClick={() => replaceStop(selectedDay, i, replacingStop.pending)} style={bs("#10b981", true, 13)}>✓</button>}
                                      {(isInsertingBefore || isInsertingAfter) && insertingStop.pending && <button onClick={() => insertStop(selectedDay, i, insertingStop.direction, insertingStop.pending)} style={bs("#10b981", true, 13)}>✓</button>}
                                    </>
                                  )}

                                  {/* Utolsó stop érkezett/rakodás alatt: +⬇ 🔄 − */}
                                  {showLastStopBtns && (
                                    <>
                                      <button title={l.insertAfter} onClick={() => { setReplacingStop(null); setInsertingStop(isInsertingAfter ? null : { dateKey: selectedDay, index: i, direction: "after", pending: null }); }} style={bs("#a78bfa", isInsertingAfter)}>+⬇</button>
                                      <button onClick={() => { setInsertingStop(null); setReplacingStop(isReplacing ? null : { dateKey: selectedDay, index: i, pending: null }); }} style={bs("#06b6d4", isReplacing, 13)}>🔄</button>
                                      <button onClick={() => removeActiveStop(selectedDay, i)} style={bs("#ef4444", false, 14)}>−</button>
                                      {isReplacing && replacingStop.pending && <button onClick={() => replaceStop(selectedDay, i, replacingStop.pending)} style={bs("#10b981", true, 13)}>✓</button>}
                                      {isInsertingAfter && insertingStop.pending && <button onClick={() => insertStop(selectedDay, i, "after", insertingStop.pending)} style={bs("#10b981", true, 13)}>✓</button>}
                                    </>
                                  )}

                                  {/* Visszavonás gomb: minden nem "várja" státusznál */}
                                  {ss !== "várja" && (
                                    <button onClick={() => revertStopStatus(selectedDay, i)} style={bs("#ef4444", false, 13)}>↩</button>
                                  )}
                                </div>
                              </div>

                              {isReplacing && (
                                <div style={{ marginBottom: 8, background: "#0f1117", border: "1px solid #06b6d4", borderRadius: 8, padding: 8 }}>
                                  <div style={{ color: "#06b6d4", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{l.replaceLocation}</div>
                                  {WAREHOUSES.filter((w) => w !== stop.warehouse).map((w) => { const ip = replacingStop.pending === w; return <button key={w} onClick={() => setReplacingStop((prev) => ({ ...prev, pending: w }))} style={{ display: "block", width: "100%", textAlign: "left", background: ip ? "#06b6d422" : "transparent", border: "none", borderLeft: ip ? "2px solid #06b6d4" : "2px solid transparent", color: ip ? "#06b6d4" : "#4a5568", padding: "5px 8px", cursor: "pointer", fontSize: 12, fontWeight: ip ? 700 : 400 }}>🏭 {w}</button>; })}
                                </div>
                              )}
                              {(isInsertingBefore || isInsertingAfter) && (
                                <div style={{ marginBottom: 8, background: "#0f1117", border: "1px solid #a78bfa", borderRadius: 8, padding: 8 }}>
                                  <div style={{ color: "#a78bfa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{isInsertingBefore ? l.insertBefore : l.insertAfter}</div>
                                  <select className="select-dark" value={insertingStop.pending || ""} onChange={(e) => setInsertingStop((prev) => ({ ...prev, pending: e.target.value || null }))} style={{ marginBottom: 0 }}>
                                    <option value="">— válassz helyszínt —</option>{WAREHOUSES.map((w) => <option key={w} value={w}>{w}</option>)}
                                  </select>
                                </div>
                              )}

                              {(stop.arrived || stop.loading || stop.departed) && (
                                <div style={{ display: "flex", flexWrap: "wrap", marginBottom: 8 }}>
                                  <TimeDisplay iso={stop.arrived} label={l.arrived} />
                                  {stop.loading && <TimeDisplay iso={stop.loading} label={l.loadingBtn} />}
                                  {stop.departed && <TimeDisplay iso={stop.departed} label={l.departed} />}
                                </div>
                              )}

                              {!isCompleted && (
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  {["érkezett", "rakodás alatt"].map((s) => {
                                    const isActive = ss === s, isEnabled = allowed[s];
                                    return <button key={s} className="btn-sm" onClick={() => isEnabled && updateStopStatus(selectedDay, i, s)} style={{ borderColor: isEnabled ? stopColors[s] : "#2a2d3a", color: isActive ? "#0f1117" : isEnabled ? stopColors[s] : "#2a2d3a", background: isActive ? stopColors[s] : "transparent", cursor: isEnabled ? "pointer" : "not-allowed", opacity: isEnabled ? 1 : 0.3 }}>{s === "érkezett" ? `🏭 ${l.arrived}` : `⏳ ${l.loadingBtn}`}</button>;
                                  })}
                                </div>
                              )}

                              {ss === "rakodás alatt" && (
                                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                                  {TRUCK_LOAD_KEYS.map((v) => { const isActive = stop.truckLoad === v; return <button key={v} className="btn-sm" onClick={() => { const nr = plan.route.map((s2, idx) => idx === i ? { ...s2, truckLoad: v } : s2); saveDayPlan(selectedDay, { ...plan, route: nr }); }} style={{ borderColor: "#06b6d4", color: isActive ? "#0f1117" : "#06b6d4", background: isActive ? "#06b6d4" : "transparent", fontWeight: 700 }}>{v === "teli" ? `📦 ${l.full}` : `🔲 ${l.empty}`}</button>; })}
                                  <button className="btn-sm" disabled={!canDepart} onClick={() => canDepart && updateStopStatus(selectedDay, i, "indult")} style={{ borderColor: canDepart ? stopColors["indult"] : "#2a2d3a", color: canDepart ? "#0f1117" : "#2a2d3a", background: canDepart ? stopColors["indult"] : "transparent", cursor: canDepart ? "pointer" : "not-allowed", opacity: canDepart ? 1 : 0.3 }}>🚀 {l.departed}</button>
                                </div>
                              )}
                              {isCompleted && stop.truckLoad && <div style={{ marginTop: 4 }}><span style={{ fontSize: 11, color: "#06b6d4", fontWeight: 700 }}>📦 {trStatus(stop.truckLoad, l)}</span></div>}
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
            <div style={{ color: "#f59e0b", fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2, marginBottom: 12 }}>{l.transferTitle}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 16 }}>
              {transferDayKeys.map((dk) => {
                const isToday = dk === today, isSelected = dk === transferDay;
                const dayData = transfers[dk] || {};
                const totalRounds = TRANSFER_ROUTES.reduce((sum, r) => sum + (dayData[transferRouteKey(r)]?.rounds?.length || 0), 0);
                return (
                  <div key={dk} className={`day-btn ${isSelected && isToday ? "selected" : isSelected ? "selected" : isToday ? "tomorrow-style" : ""}`} onClick={() => setTransferDay(dk)} style={{ padding: "6px 4px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{formatDateLabel(dk)}</div>
                    {isToday && <div style={{ fontSize: 9, marginTop: 2, opacity: 0.85 }}>{l.today}</div>}
                    {totalRounds > 0 && <div style={{ fontSize: 9, color: isSelected ? "#0f1117" : "#06b6d4", marginTop: 2 }}>● {totalRounds}</div>}
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
                      <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 700 }}>
                        <span style={{ color: "#06b6d4" }}>{route.from}</span> <span style={{ color: "#f59e0b" }}>→</span> <span style={{ color: "#06b6d4" }}>{route.to}</span>
                      </div>
                      {routeData.lastUpdated && <div style={{ color: "#67e8f9", fontSize: 10, marginTop: 2 }}>{l.transferLastUpdated}: {formatTime(routeData.lastUpdated)}</div>}
                    </div>
                    <button onClick={() => setTransferModal({ routeIdx, roundIdx: null })}
                      style={{ background: "#f59e0b", border: "none", color: "#0f1117", borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{l.transferAddRound}</button>
                  </div>

                  {rounds.length === 0 ? (
                    <div style={{ color: "#374151", fontSize: 12, textAlign: "center", padding: "12px 0" }}>{l.transferNoRounds}</div>
                  ) : (
                    rounds.map((r: any, ri: number) => {
                      const itemCount = (r.groups || []).reduce((s: number, g: any) => s + (g.items?.length || 0), 0);
                      const rPallets = typeof r.palletCount === "number" ? r.palletCount : 0;
                      const rPct = palletPercent(rPallets);
                      const rColor = palletColor(rPct);
                      return (
                        <div key={ri} style={{ background: "#0f1117", border: "1px solid #2a2d3a", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                            <div style={{ color: "#f59e0b", fontSize: 13, fontWeight: 700 }}>{ri + 1}. {l.transferRound}{r.zone ? ` · ${r.zone}` : ""}</div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => setTransferModal({ routeIdx, roundIdx: ri })}
                                style={{ background: "#1e2130", border: "1px solid #06b6d4", color: "#06b6d4", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{l.addCargo}{itemCount > 0 ? ` (${itemCount})` : ""}</button>
                              <button onClick={() => { if (window.confirm(`${l.transferDeleteRound}?`)) saveTransferRound(transferDay, routeIdx, ri, null); }}
                                style={{ background: "#ef444422", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🗑️</button>
                            </div>
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                              <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>📦 {l.palletTitle}</div>
                              <div style={{ color: rColor, fontSize: 11, fontWeight: 700 }}>{rPallets} / {PALLET_FULL_LOAD} · {rPct}%</div>
                            </div>
                            <div style={{ width: "100%", height: 10, background: "#1e2130", borderRadius: 5, overflow: "hidden", border: "1px solid #2a2d3a" }}>
                              <div style={{ width: `${rPct}%`, height: "100%", background: rColor, transition: "width 0.25s ease, background 0.25s ease" }} />
                            </div>
                          </div>
                          {(r.groups || []).map((g: any, gi: number) => (
                            <div key={gi} style={{ marginTop: 4, paddingTop: 4, borderTop: gi > 0 ? "1px solid #2a2d3a55" : "none" }}>
                              <div style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700, marginBottom: 2 }}>📂 {g.category} <span style={{ color: "#4a5568" }}>({g.items?.length || 0} {l.transferRoundSummary})</span></div>
                              <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.4 }}>
                                {(g.items || []).slice(0, 6).map((it: any) => it.text).join(", ")}
                                {g.items && g.items.length > 6 ? ` … +${g.items.length - 6}` : ""}
                              </div>
                            </div>
                          ))}
                          {r.lastUpdated && <div style={{ color: "#67e8f9", fontSize: 10, marginTop: 6 }}>{l.updatedAt}: {formatTime(r.lastUpdated)}</div>}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </>
        )}

        {activeTab === "fuvar" && (
          <>
            {fuvarModal && <FuvarModal onClose={() => setFuvarModal(false)} onAdd={(item) => setFuvarDraft((prev) => [...prev, item])} l={l} />}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ color: "#f59e0b", fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2 }}>{l.fuvarTitle}</div>
              <button onClick={() => setFuvarModal(true)} style={{ background: "#f59e0b", border: "none", color: "#0f1117", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ {l.fuvarCreate}</button>
            </div>
            {fuvarDraft.length > 0 && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>{l.fuvarDraftTitle} ({fuvarDraft.length})</div>
                {fuvarDraft.map((item: any, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #2a2d3a" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 700 }}>{item.from}{item.via?.filter(Boolean).map((v, i) => <span key={i}> → <span style={{ color: "#06b6d4" }}>{v}</span></span>)}{" → "}{item.to}{item.urgent && <span style={{ marginLeft: 6, color: "#ef4444", fontSize: 10, fontWeight: 700 }}>⚡ SÜRGŐS</span>}</div>
                      {(item.timeFrom || item.timeTo) && <div style={{ color: "#4a5568", fontSize: 11, marginTop: 2 }}>🕐 {item.timeFrom || "—"} – {item.timeTo || "—"}</div>}
                    </div>
                    <button onClick={() => setFuvarDraft((prev) => prev.filter((_, i) => i !== idx))} style={{ background: "#ef444422", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>×</button>
                  </div>
                ))}
                <button onClick={saveFuvarDraft} style={{ width: "100%", marginTop: 12, background: "#10b981", border: "none", color: "#fff", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>💾 {l.fuvarSave} ({fuvarDraft.length} fuvar)</button>
              </div>
            )}
            {fuvarSaved.length === 0 && fuvarDraft.length === 0 ? (
              <div className="card" style={{ textAlign: "center", color: "#4a5568", fontSize: 12, padding: 24 }}>{l.noData}</div>
            ) : fuvarSaved.length > 0 && (
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ color: "#10b981", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>✓ {l.fuvarSavedTitle} ({fuvarSaved.length})</div>
                  <div style={{ color: "#67e8f9", fontSize: 10 }}>{fuvarSavedAt ? `${l.fuvarUpdated}: ${formatTime(fuvarSavedAt)}` : ""}</div>
                </div>
                {fuvarSaved.map((item: any, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #2a2d3a" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 700 }}>{item.from}{item.via?.filter(Boolean).map((v, i) => <span key={i}> → <span style={{ color: "#06b6d4" }}>{v}</span></span>)}{" → "}{item.to}{item.urgent && <span style={{ marginLeft: 6, color: "#ef4444", fontSize: 10, fontWeight: 700 }}>⚡ SÜRGŐS</span>}</div>
                      {(item.timeFrom || item.timeTo) && <div style={{ color: "#4a5568", fontSize: 11, marginTop: 2 }}>🕐 {item.timeFrom || "—"} – {item.timeTo || "—"}</div>}
                    </div>
                    <button onClick={() => deleteFuvarItem(idx)} style={{ background: "#ef444422", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
