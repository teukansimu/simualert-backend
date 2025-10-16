import express from "express";
import cors from "cors";
import cron from "node-cron";


import { fetchFromTori } from "./sources/tori.js";
import { fetchFromEbay } from "./sources/ebay.js";
import { notifyIFTTT } from "./notifiers/ifttt.js";

const app = express();
app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
  <meta charset="utf-8"/>
  <title>SimuAlert (MVP)</title>
  <style>body{font-family:system-ui,Segoe UI,Arial;margin:2rem;max-width:820px}input,select{padding:.5rem;border:1px solid #ccc;border-radius:8px}label{display:block;margin:.5rem 0 .25rem}button{padding:.6rem 1rem;border-radius:10px;border:0;background:#111;color:#fff}</style>
  <h1>SimuAlert – luo hälytys (MVP)</h1>
  <p>Liitä oma IFTTT Maker -URL <b>ilman /json</b>, lisää hakusanat ja luo hälytys.</p>
  <form id="f">
    <label>Nimi</label>
    <input id="name" value="Escort Mk2 test" style="width:100%"/>
    <label>Hakusanat (pilkuilla)</label>
    <input id="keywords" value="escort mk2, rs2000" style="width:100%"/>
    <label>Lähteet</label>
    <select id="sources" multiple size="3" style="width:100%">
      <option value="tori" selected>Tori</option>
      <option value="ebay" selected>eBay</option>
    </select>
    <label>IFTTT Maker URL</label>
    <input id="ifttt" placeholder="https://maker.ifttt.com/trigger/ChatGPT_alert/with/key/ABC..." style="width:100%"/>
    <div style="margin-top:1rem"><button type="submit">Luo hälytys</button></div>
  </form>
  <pre id="out" style="background:#f6f6f7;padding:1rem;border-radius:12px;margin-top:1rem;white-space:pre-wrap"></pre>
  <script>
  document.getElementById('f').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const body = {
      name: document.getElementById('name').value,
      keywords: document.getElementById('keywords').value.split(',').map(s=>s.trim()).filter(Boolean),
      sources: Array.from(document.getElementById('sources').selectedOptions).map(o=>o.value),
      ifttt_url: document.getElementById('ifttt').value,
      notify: ['email'], active: true, frequency: '5min'
    };
    const r = await fetch('/api/alerts', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    const j = await r.json();
    document.getElementById('out').textContent = JSON.stringify(j,null,2);
  });
  </script>`);
});


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
async function runAllAlerts() {
  const fresh = [];
  for (const alrt of DB.alerts) {
    if (!alrt.active) continue;
    const got = await runAlertOnce(alrt); // tämä on jo tiedostossa valmiina
    fresh.push(...got);
  }
  return fresh; // palauttaa kaikki tän ajon uudet löydöt
}

}

app.post('/api/runAll', async (req, res) => {
  try {
    const result = await runAllAlerts();
    res.json({ success: true, count: result.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 8787;
// Testireitti, joka näyttää selkeän viestin selaimessa
app.get("/test", (req, res) => {
  res.send(`
    <h1>SimuAlert toimii! 🚀</h1>
    <p>Tämä on Teukan testipalvelin Renderissä.</p>
    <p>Aika palvelimella: ${new Date().toLocaleString()}</p>
  `);
});

// 1) POST: turvallinen tapa — anna ifttt_url bodyssa
app.post("/api/ifttt-test", async (req, res) => {
  try {
    const url = req.body?.ifttt_url;
    if (!url) return res.status(400).json({ ok:false, error: "missing ifttt_url" });

    const fakeItem = {
      title: "Escort Mk2 – testilöytö",
      price_eur: 123,
      source: "tori",
      url: "https://example.com/ilmoitus",
      location: "Forssa",
      posted_at: new Date().toISOString(),
    };

    await notifyIFTTT(url, fakeItem);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error: e.message });
  }
});

// 2) (Valinnainen) GET: helppo selain-testi ?url=<IFTTT>
app.get("/api/ifttt-test", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).send("Missing ?url=");
    const fakeItem = {
      title: "Escort Mk2 – testilöytö",
      price_eur: 123,
      source: "tori",
      url: "https://example.com/ilmoitus",
      location: "Forssa",
      posted_at: new Date().toISOString(),
    };
    await notifyIFTTT(url, fakeItem);
    res.send("OK");
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message);
  }
});

app.listen(PORT, () => console.log(`SimuAlert backend listening on :${PORT}`));
