import ical from "ical";

export async function fetchFromICS(source) {
  const data = await new Promise((resolve, reject) => {
    ical.fromURL(source.url, {}, (err, data) => (err ? reject(err) : resolve(data)));
  });

  const out = [];
  for (const k of Object.keys(data)) {
    const ev = data[k];
    if (ev.type !== "VEVENT") continue;

    out.push({
      source: source.name,
      source_id: ev.uid || (ev.summary + String(ev.start)),
      title: (ev.summary || "Tapahtuma").trim(),
      description: (ev.description || "").trim(),
      start: ev.start?.toISOString?.() || new Date().toISOString(),
      end: ev.end?.toISOString?.(),
      venue: ev.location || "",
      url: ev.url || source.url,
      city: source.region || "Forssan seutu",
      created_at: new Date().toISOString(),
    });
  }
  return out;
}
