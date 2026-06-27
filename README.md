# ÍMARK Intelligence

Vikuleg markaðsvakt fyrir ÍMARK sem safnar íslenskum og alþjóðlegum markaðsfréttum, forgangsraðar íslensku efni og birtir eitt skýrt ritstýrt yfirlit fyrir félagsmenn.

Live síða: https://imark-iceland.github.io/trends/

## Hvað verkefnið gerir

- Keyrir vikulega með GitHub Actions.
- Vaktar íslenskar heimildir, auglýsingastofur, íslensk vörumerki og alþjóðlegar fagheimildir.
- Safnar atriðum um herferðir, endurmörkun, ný vörumerki, ráðningar, verðlaun, AI/tækni og alþjóðleg case.
- Skrifar niðurstöður í `data/intelligence.json`.
- Býr til static GitHub Pages dashboard í `docs/index.html`.

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
      "priority": 1
    }
  ]
}
```

## Keyrsla

```bash
npm install
npm run fetch
npm run generate
```

Eða allt í einu:

```bash
npm run build
```

Prófa dashboard staðbundið:

```bash
npm run preview
```

## GitHub Pages

Stilltu GitHub Pages á:

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/docs`

Workflowið í `.github/workflows/weekly-fetch.yml` keyrir á mánudögum kl. 07:00 UTC og má líka keyra handvirkt með `workflow_dispatch`.

## Ritstjórnarreglur

- Að lágmarki 40% íslenskt efni í aðalyfirliti ef nægt efni finnst.
- Ekki birta atriði án heimildartengils.
- Ekki fylla með almennum AI fréttum nema þær tengist markaðsstarfi, vörumerkjum, efnisgerð, miðlum eða samskiptum.
- Forðast endurtekningar með URL- og titilsamanburði.
- Skýra alltaf af hverju atriðið skiptir máli fyrir íslenskt markaðsfólk.

## Stack

- Node.js 20 í GitHub Actions
- `rss-parser` og `node-fetch`
- JSON skrár í `data/`
- Static HTML í `docs/`
- Enginn gagnagrunnur og ekkert frontend framework
