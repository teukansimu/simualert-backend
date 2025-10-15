import express from "express";
import cors from "cors";
import cron from "node-cron";


import { fetchFromTori } from "./sources/tori.js";
import { fetchFromEbay } from "./sources/ebay.js";
import { notifyIFTTT } from "./notifiers/ifttt.js";

const app = express();
app.use(cors());
app.use(express.json());

// In-memory DB for MVP
const DB = {
  alerts: [],
  findings: new Map(),
};

function makeId(prefix="alrt") { return `${prefix}_${Math.random().toString(36).slice(2,9)}`; }
function normalizeKeywords(s) {
  return (s||"")
    .split(",")
    .map(x=>x.trim())
    .filter(Boolean);
}

// API
app.post("/api/alerts", (req, res) => {
  const b = req.body || {};
  const alrt = {
    id: makeId(),
    name: b.name || "Uusi hälytys",
    keywords: Array.isArray(b.keywords) ? b.keywords : normalizeKeywords(b.keywords),
    sources: b.sources?.length ? b.sources : ["tori"],
    price_min: Number.isFinite(b.price_min) ? b.price_min : null,
    price_max: Number.isFinite(b.price_max) ? b.price_max : null,
    frequency: b.frequency || "5min",
    notify: b.notify?.length ? b.notify : ["email"],
    active: b.active ?? true,
    ifttt_url: b.ifttt_url || null,
    created_at: new Date().toISOString(),
  };
  DB.alerts.push(alrt);
  res.json(alrt);
});

app.get("/api/alerts", (req, res) => {
  res.json(DB.alerts);
});

app.patch("/api/alerts/:id", (req, res) => {
  const i = DB.alerts.findIndex(a=>a.id===req.params.id);
  if (i<0) return res.status(404).json({error:"not-found"});
  DB.alerts[i] = { ...DB.alerts[i], ...req.body };
  res.json(DB.alerts[i]);
});

app.delete("/api/alerts/:id", (req, res) => {
  const i = DB.alerts.findIndex(a=>a.id===req.params.id);
  if (i<0) return res.status(404).json({error:"not-found"});
  DB.alerts.splice(i,1);
  res.json({ok:true});
});

app.post("/api/run/:id", async (req, res) => {
  const alrt = DB.alerts.find(a=>a.id===req.params.id);
  if (!alrt) return res.status(404).json({error:"not-found"});
  const findings = await runAlertOnce(alrt);
  res.json({count: findings.length, findings});
});

app.get("/api/feed", (req, res) => {
  res.json(Array.from(DB.findings.values()).slice(-100));
});

// Engine
async function runAlertOnce(alrt){
  if (!alrt.active) return [];
  const all = [];
  if (alrt.sources.includes("tori")) {
    all.push(...await fetchFromTori(alrt));
  }
  if (alrt.sources.includes("ebay")) {
    all.push(...await fetchFromEbay(alrt));
  }
  const fresh = [];
  for (const it of all) {
    if (alrt.price_min!=null && it.price_eur < alrt.price_min) continue;
    if (alrt.price_max!=null && it.price_eur > alrt.price_max) continue;
    const text = `${it.title}`.toLowerCase();
    const ok = (alrt.keywords?.length? alrt.keywords : []).some(kw=> text.includes(kw.toLowerCase()));
    if (!ok) continue;
    const hash = `${it.source}#${it.source_id || it.url}`;
    if (DB.findings.has(hash)) continue;
    const enriched = { ...it, hash, alert_id: alrt.id, created_at: new Date().toISOString() };
    DB.findings.set(hash, enriched);
    fresh.push(enriched);
    await safeNotify(alrt, enriched);
  }
  return fresh;
}

async function safeNotify(alrt, item){
  try {
    if (alrt.notify.includes("email") && alrt.ifttt_url) {
      await notifyIFTTT(alrt.ifttt_url, item);
    }
  } catch (e) {
    console.error("notify error", e?.message);
  }
}

// Cron every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  for (const alrt of DB.alerts) {
    if (alrt.active) await runAlertOnce(alrt);
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`SimuAlert backend listening on :${PORT}`));
