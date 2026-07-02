# ÍMARK Intelligence

Vikuleg intelligence-vara fyrir félagsmenn ÍMARK:

> Það sem íslenskt markaðsfólk þarf að vita í þessari viku.

Live síða: https://imark-iceland.github.io/imark-intelligence

Þetta er ekki fréttasafn og ekki RSS-lesari. Kerfið safnar opinberu efni, metur vægi þess og birtir aðeins atriði sem hafa skýrt gildi fyrir íslenskt markaðsfólk.

## Hvað verkefnið gerir

- Keyrir vikulega með GitHub Actions.
- Vaktar íslenskar heimildir, íslenskar auglýsingastofur, íslensk vörumerki og valdar alþjóðlegar fagheimildir.
- Skoðar RSS þar sem það er til, en líka fréttasíður, newsroom, case pages, bloggsíður og opinberar fréttatilkynningar.
- Gefur hverju atriði intelligence-stig eftir mikilvægi.
- Skrifar niðurstöður í `data/intelligence.json`.
- Býr til static GitHub Pages dashboard í `docs/index.html`.

## Ritstjórnarregla

Hvert atriði þarf að svara:

- Af hverju skiptir þetta máli?
- Hvað geta íslensk fyrirtæki lært af þessu?
- Hefur þetta áhrif á markaðsmál á Íslandi?

Ef svarið er nei á atriðið ekki að birtast.

## Scoring

- Íslensk markaðsherferð: `+60`
- Íslenskt agency case: `+60`
- Íslensk endurmörkun: `+60`
- Íslensk verðlaun eða tilnefning: `+55`
- Íslensk ráðning í markaðs- og samskiptastarf: `+45`
- Alþjóðlegt case með sterkum lærdómi: `+45`
- AI sem breytir markaðsstarfi: `+40`
- Mikilvæg breyting hjá Google, Meta, LinkedIn eða öðrum platformum: `+40`
- Sterk rannsókn eða neytendatrend: `+35`
- Almenn erlend markaðsfrétt: `+5`

Sjálfgefið birtast aðeins atriði sem ná að minnsta kosti `35` stigum. Gæði ganga alltaf fyrir magn.

## Hlutföll

Markmiðið er 40-60% íslenskt efni og 40-60% alþjóðlegt efni, en hlutföll eru ekki neydd ef góð íslensk atriði finnast ekki. Það er betra að birta færri og betri atriði en að fylla með veikum fréttum.

## JSON schema

```json
{
  "week": "Vika XX, YYYY",
  "updatedAt": "...",
  "topItems": [
    {
      "title": "",
      "source": "",
      "url": "",
      "date": "",
      "category": "",
      "summary_is": "",
      "why_it_matters_is": "",
      "market_relevance": "Icelandic | Nordic | Global",
      "score": 45,
      "score_reason": "",
      "priority": 1
    }
  ]
}
```

## Dashboard

Dashboardið sýnir eitt ritstýrt yfirlit með 8-12 mikilvægustu atriðunum í forgangsröð. Það býr ekki til aðskilda kafla eins og “íslenski markaðurinn” eða “fleiri fréttir”.

## Handvalin atriði

Ef ritstjórn veit af mikilvægu atriði sem sjálfvirka vaktin grípur ekki má setja það í `config/editorial-items.json`.

Settu `enabled` í `true`, fylltu inn raunverulegan heimildartengil og hafðu `market_relevance` sem `Icelandic` eða `Global`. Slík atriði fá hátt vægi en eru samt aldrei birt án `source` og `url`.

## Heimildir

Heimildir eru skilgreindar í `src/fetch.js` í `SOURCES` listanum.

Til að bæta við heimild:

1. Bættu við færslu með `name`, `url`, `type`, `market` og `focus`.
2. Notaðu `type: "rss"` ef feed er til, annars `type: "html"`.
3. Fyrir íslenska RSS heimild er gott að setja `fallbackUrl` svo kerfið reyni HTML ef RSS bilar.
4. Veldu `market: "Icelandic"` fyrir íslenskar heimildir og `market: "Global"` fyrir alþjóðlegar.
5. Veldu `focus` eftir efninu, til dæmis `agency`, `brand`, `icelandic-market`, `ai`, `platform` eða `international-case`.

HTML vaktin reynir að finna greinatengla á síðunni. Ef síðan notar mikið JavaScript eða hefur enga venjulega tengla birtist það í diagnostics.

## Diagnostics

Hver keyrsla skrifar `data/diagnostics.json`.

Skráin sýnir fyrir hverja heimild:

- `name`
- `url`
- `type`: `rss`, `html`, `manual` eða `api`
- `status`: `success`, `failed` eða `skipped`
- `httpStatus`
- `itemsFound`
- `itemsAfterFilter`
- `itemsRejected`
- `rejectionReasons`
- `errorMessage`
- `lastChecked`

Ef engin íslensk atriði finnast setur kerfið `noIcelandicItems: true`, skrifar warning í console og birtir viðvörun á dashboardinu.

Algengar ástæður í `rejectionReasons`:

- `no-new-articles-in-window`: atriðið var of gamalt fyrir vikuvaktina.
- `weak-market-relevance`: atriðið var of almennt eða ekki nógu sterkt fyrir markaðsfólk.
- `agency-signal-missing`: agency-vakt fann efni en ekki merki um herferð, case, verðlaun, ráðningu eða svipað.
- `hiring-not-marketing-or-communications`: ráðning var ekki nógu tengd markaðs- eða samskiptastarfi.
- `ai-not-marketing-related`: AI frétt tengdist ekki markaðsstarfi nógu skýrt.
- `score-below-threshold`: atriðið fékk ekki nóg intelligence-stig.

## Ef 0 íslensk atriði birtast

1. Opnaðu `data/diagnostics.json`.
2. Skoðaðu `summary.icelandicSourcesWorking` og `summary.icelandicItemsSelected`.
3. Finndu íslenskar heimildir með `status: "failed"` og lestu `errorMessage`.
4. Finndu heimildir með `itemsFound > 0` en `itemsAfterFilter: 0` og skoðaðu `rejectionReasons`.
5. Ef heimild er að skila réttum atriðum sem filter hafnar, þarf að laga scoring/filter í `src/fetch.js`.
6. Ef heimild svarar ekki, þarf að laga `url`, bæta við `fallbackUrl` eða nota aðra opinbera heimild.
7. Ef mikilvægt íslenskt atriði er vitað en vaktin nær því ekki, má setja það tímabundið í `config/editorial-items.json` með raunverulegri heimild.

## Keyrsla

```bash
npm install
npm run build
npm run preview
```

## GitHub Pages

Stilltu GitHub Pages á:

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/docs`

Workflowið í `.github/workflows/weekly-fetch.yml` keyrir á mánudögum kl. 07:00 UTC og má líka keyra handvirkt með `workflow_dispatch`.

## Stack

- Node.js 20 í GitHub Actions
- `rss-parser` og `node-fetch`
- JSON skrár í `data/`
- Static HTML í `docs/`
- Enginn gagnagrunnur og ekkert frontend framework
