SimuAlert backend — nopea käynnistys

1) Asenna
   - Tarvitset Node 18+
   - Avaa terminaali tässä kansiossa ja aja:
     npm i
     npm run dev

2) Luo hälytys (esimerkki curlilla)
   curl -X POST http://localhost:8787/api/alerts    -H "Content-Type: application/json"    -d '{"name":"Escort Mk2","keywords":["escort mk2","rs2000"],"sources":["tori","ebay"],"ifttt_url":"https://maker.ifttt.com/trigger/ESCORT/with/key/OMA_AVAIN"}'

   Vastauksessa tulee id, esim. alrt_abcd123.

3) Aja haku heti
   curl -X POST http://localhost:8787/api/run/alrt_abcd123

4) Katso feed
   http://localhost:8787/api/feed

Huom: Tori/eBay on nyt stub — korvaa oikeilla hauilla myöhemmin.
