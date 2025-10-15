export async function fetchFromEbay(alert){
  // TODO: use eBay Finding API (needs key) or scraping for MVP
  return [{
    source: "ebay",
    source_id: String(Date.now()-1),
    title: "Weber 45 DCOE carb set",
    price_eur: 210,
    location: "DE",
    url: "https://www.ebay.com/",
    posted_at: new Date(Date.now() - 10*60*1000).toISOString(),
    thumb: null,
  }];
}
