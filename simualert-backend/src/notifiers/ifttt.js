import axios from "axios";

export async function notifyIFTTT(iftttUrl, item){
  const u = new URL(iftttUrl);
  u.searchParams.set("value1", `${item.title} – ${item.price_eur} € (${item.source.toUpperCase()})`);
  u.searchParams.set("value2", item.url);
  u.searchParams.set("value3", `${item.location} • ${new Date(item.posted_at).toLocaleString()}`);
  await axios.get(u.toString());
}
