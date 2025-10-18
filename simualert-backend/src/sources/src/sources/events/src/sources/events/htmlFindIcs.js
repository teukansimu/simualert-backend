import axios from "axios";
import * as cheerio from "cheerio";
import { fetchFromICS } from "./ics.js";

export async function fetchByFindingICSOnPage(source) {
  const { data: html } = await axios.get(source.url, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "fi-FI,fi;q=0.9" },
    timeout: 15000,
  });

  const $ = cheerio.load(html);

  // Etsi suora .ics-linkki tai ICS-tekstiä sisältävä linkki
  let icsHref = $('a[href$=".ics"]').attr("href");
  if (!icsHref) {
    icsHref = $(
      'a:contains("ics"), a:contains("iCalendar"), a:contains("Vie .ics"), a:contains("Export .ics")'
    )
      .first()
      .attr("href");
  }
  if (!icsHref) return []; // ei löytynyt

  // Tee suhteellisesta absoluuttinen
  if (!/^https?:\/\//i.test(icsHref)) {
    const base = new URL(source.url);
    icsHref = new URL(icsHref, base).toString();
  }

  // Lue ICS-adapterilla
  const icsSource = { ...source, url: icsHref, name: source.name + " (ICS)" };
  return fetchFromICS(icsSource);
}
