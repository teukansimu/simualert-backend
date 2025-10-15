export async function fetchFromTori(alert){
  // NOTE: No official public API — replace with real scraping/query later.
  const now = Date.now();
  return [{
    source: "tori",
    source_id: String(now),
    title: "Escort Mk2 etulokasuoja (oik)",
    price_eur: 95,
    location: "Hämeenlinna",
    url: "https://www.tori.fi/",
    posted_at: new Date(now - 5*60*1000).toISOString(),
    thumb: null,
  }];
}
