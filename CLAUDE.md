# CLAUDE.md — ÍMARK Intelligence

Þetta skjal er varanlegt samhengi fyrir hvern Claude Code session sem vinnur í þessu repository-i. Lestu þetta fyrst, áður en þú breytir nokkru.

## Project Mission

Markmið verkefnisins er að byggja upp bestu daglegu markaðsvakt fyrir íslenskt markaðsfólk.

Grunnreglur:

- Gæði ganga alltaf fyrir magn.
- Íslenskt efni hefur forgang.
- Ekki birta frétt nema hún hafi raunverulegt gildi fyrir markaðsfólk.
- Ritstjórnarleg dómgreind er mikilvægari en sjálfvirkni.
- Markmiðið er að draga úr handvirkri vinnu án þess að fórna gæðum.
- Allar breytingar eiga að gera verkefnið einfaldara, stöðugra og auðveldara í rekstri.

Þessar grunnreglur eiga að vega þyngst í hverri ákvörðun sem tekin er í þessu verkefni — ef tillaga stangast á við þær (t.d. meiri sjálfvirkni sem dregur úr gæðum, eða flóknari uppsetning sem gerir reksturinn erfiðari), á reglan að vinna.

## Tilgangur verkefnisins

ÍMARK Intelligence (birt sem "ÍMARK vaktin") er intelligence-vara fyrir félagsmenn ÍMARK (Samtök markaðs- og auglýsingafólks á Íslandi).

> Það sem íslenskt markaðsfólk þarf að vita.

Þetta er **ekki** fréttasafn og **ekki** RSS-lesari. Kerfið safnar opinberu efni, metur vægi þess fyrir íslenskt markaðsfólk og birtir aðeins atriði sem hafa skýrt ritstjórnarlegt gildi. Gæði ganga alltaf fyrir magn.

Live síða: https://imark-iceland.github.io/trends/

## Langtímasýn

Markmiðið er að þróa ÍMARK Intelligence í **daglega** intelligence-vakt sem sameinar:

- íslenskar markaðsfréttir
- alþjóðleg markaðscase
- AI sem hefur áhrif á markaðsstarf
- ráðningar
- verðlaun
- endurmörkun
- platform breytingar

Kerfið á með tímanum að krefjast sem minnstrar handvirkrar vinnu en viðhalda háum ritstjórnarlegum gæðum.

Núverandi vikuleg keyrsla (sjá "Hvernig GitHub Actions keyrir verkefnið") er **núverandi útfærsla, ekki föst regla eða endanleg hönnun**. Hún endurspeglar hvar verkefnið er statt núna, ekki hvert það stefnir. Þetta hefur áhrif á ákvarðanir:

- Sjálfvirkni á að vera sjálfgefna leiðin — handvirk ritstjórn (`config/editorial-items.json`, `data/brief.json`) er neyðarúrræði fyrir atriði sem vaktin missir af, ekki varanleg lausn til lengdar.
- Breytingar sem draga úr þörf fyrir handvirka íhlutun (betri heimildir, betri síun, betri skorun) eru í takt við stefnuna.
- Breytingar sem auka handvirka vinnu (fleiri handskrifaðar skrár, fleiri samhliða kerfi) ættu að vera tímabundnar og skjalfestar sem slíkar.
- Áður en keyrslutíðni er aukin úr viku í dag þarf að leysa núverandi þekktu vandamálin (sjá neðst) — sérstaklega tvöfalda ritstjórnarflæðið og að `intelligence.json` birtist ekki á síðunni — annars margfaldast ruglingurinn við hverja keyrslu.

## Tæknileg uppbygging

Engin gagnagrunnur, ekkert frontend framework. Static site sem keyrir á JSON + Node.js + GitHub Actions.

```
src/fetch.js       — sjálfvirk vakt: sækir heimildir, skorar, síar, skrifar data/intelligence.json + diagnostics.json
src/generate.js    — les gögn úr data/, skrifar docs/index.html (static dashboard)
config/editorial-items.json — handvalin atriði sem fetch.js les og blandar við sjálfvirku niðurstöðuna
config/sources.json          — ATH: ekki notuð af neinu í dag, sjá "Þekkt vandamál" neðst
data/intelligence.json       — nýjasta úttak fetch.js (topItems, skorað)
data/diagnostics.json        — heilsufar hverrar heimildar í síðustu keyrslu
data/brief.json              — handskrifuð/handritstýrð skrá sem generate.js birtir í raun á síðunni
data/latest.json             — eldra fallback-snið, notað ef intelligence.json vantar
data/weeks/*.json            — vikuleg geymsla (archive) af intelligence.json
docs/index.html              — GitHub Pages úttak (branch: main, folder: /docs)
.github/workflows/weekly-fetch.yml — sjálfvirk keyrsla (núverandi tíðni: vikuleg)
```

Stack: Node.js 20+ (Actions keyrir á Node 22), `rss-parser`, `node-fetch`. `@anthropic-ai/sdk` er í `package.json` en er ekki notað af neinum núverandi kóða — sjá "Þekkt vandamál".

Keyrsla staðbundið:
```bash
npm install
npm run build     # fetch + generate
npm run preview   # serve docs/ á localhost
```

## Hvernig fetch-ferlið virkar (`src/fetch.js`)

1. **Heimildir**: `SOURCES`-fylkið er hörð-kóðað í skránni sjálfri (ekki `config/sources.json`). Hver heimild hefur `name`, `url`, `type` (`rss` eða `html`), `market` (`Icelandic`/`Global`), `focus` (t.d. `agency`, `brand`, `icelandic-market`, `ai-platform`), og stundum `fallbackUrl` fyrir íslenskar RSS-heimildir sem geta bilað.
2. **Handvalin atriði**: `loadEditorialItems()` les `config/editorial-items.json` fyrst, hafnar `enabled:false`, keyrir hvert atriði í gegnum sömu síu (`evaluateCandidate`) og sjálfvirku heimildirnar.
3. **Sækja**: allar heimildir sóttar samhliða — RSS beint, HTML með hlekkjagreiningu og forgangsröðun (`linkPriority`) sem vegur mest á markaðstengd orð, frétta/blogg-mynstur og agency/brand-samhengi.
4. **Sía**: `evaluateCandidate()` hafnar á aldri (`DAYS_BACK=14` sjálfgefið), blokkuðum orðum (íþróttir, glæpir, veður, crypto o.fl. — sjá `BLOCKED`), noise-tenglum (valmyndir, laus störf, samfélagsmiðlahnappar — sjá `SITE_NOISE`), og veikri markaðstengingu.
5. **Skora**: `scoreItem()` gefur stig eftir flokki og markaði (sjá "Scoring reglur" neðst). Hvert atriði þarf að ná `scoreThreshold()` — lægri þröskuldur fyrir íslensk atriði (30, eða 20 fyrir agency-case) en alþjóðleg (35).
6. **Afrita í burtu**: `dedupe()` fjarlægir sömu URL og titla með ≥68% orðasamsvörun (`titleSimilarity`).
7. **Velja**: `selectItems()` reynir að ná ~40% íslensku hlutfalli af `MAX_ITEMS` (sjálfgefið 12), raðar eftir `score` (hæst efst), sníður í 5–12 atriði, setur `priority` út frá skor-röð.
8. **Skrifa**: Ef færri en `MIN_ITEMS` (5) finnast er `data/intelligence.json` **ekki** yfirskrifað — ferlið hættir með villukóða 1 til að vernda núverandi gögn. Annars er skrifað í `data/intelligence.json` og afrit í `data/weeks/{ISO-vika}-intelligence.json`.
9. `data/diagnostics.json` er alltaf skrifað, óháð árangri — sýnir stöðu hverrar heimildar (`success`/`failed`/`skipped`), fjölda fundinna/samþykktra/hafnaðra atriða og ástæður höfnunar (`rejectionReasons`).

## Hvernig generate-ferlið virkar (`src/generate.js`)

1. Les `data/intelligence.json` (normalizerar `topItems→items`, `url→link`, `summary_is→summary`, `why_it_matters_is→whyItMatters`). Fellback á `data/latest.json` ef vantar.
2. Les `data/brief.json` (valfrjálst, engin villa ef vantar).
3. Les `data/weeks/*.json` fyrir archive-tengla.
4. Byggir eina `docs/index.html`: haus, "vika"-hero, `renderTopStories(brief)` (dökki "Mikilvægast í markaðsmálum þessa vikuna" kaflinn — það sem notendur sjá í raun), `renderArchiveLinks` fyrir eldri vikur, footer með fyrirvara um AI-aðstoð við samantekt.
5. **ATH — þekkt galli**: `cards`/`filterButtons`/`allCategories` eru reiknuð úr `data.items` (þ.e. úr `intelligence.json`) en aldrei sett inn í HTML-úttakið sem skilað er. CSS (`.cards-grid`, `.filter-btn`, `.card`) og JS (`querySelectorAll('.filter-btn')`, `getElementById('no-results')`) eru enn í skránni en tengjast engu sýnilegu efni. Sjálfvirka vaktarniðurstaðan í `intelligence.json` birtist því ekki á síðunni í dag — aðeins `data/brief.json` gerir það. Sjá "Þekkt vandamál".

## Hvernig GitHub Actions keyrir verkefnið

`.github/workflows/weekly-fetch.yml`:
- Keyrir í dag sjálfkrafa á mánudögum kl. 07:17 UTC (`cron: "17 7 * * 1"`), og má keyra handvirkt með `workflow_dispatch`. **Þetta er núverandi útfærsla, ekki endanleg hönnun** — langtímamarkmiðið er dagleg keyrsla (sjá "Langtímasýn").
- Skref: checkout (fullur history) → Node 22 → `npm ci` → `node src/fetch.js` → `node src/generate.js` → commit + push á `data/` og `docs/` sem `IMARK Intelligence Bot`.
- Notar `git pull --rebase origin main` fyrir push, til að forðast árekstra við handvirka commit-a (t.d. í `data/brief.json`).
- Workflow-ið snertir **aldrei** `data/brief.json` — sú skrá er alfarið utan sjálfvirku keyrslunnar og er eingöngu breytt með handvirkum commit-um.
- GitHub Pages: `Source: Deploy from a branch`, branch `main`, folder `/docs`.
- Þegar keyrslutíðni er aukin (t.d. í átt að daglegri keyrslu) þarf að endurskoða `DAYS_BACK`, `MIN_ITEMS`/`MAX_ITEMS` og dedupe-þröskulda í `src/fetch.js`, svo tíðari keyrsla fylli ekki dashboardið af veikari eða endurteknum atriðum.

## Ritstjórnarstefna

Þetta er ritstýrð intelligence-vara fyrir meðlimi ÍMARK, **ekki RSS-lesari**.

Allt efni skal standast eftirfarandi:

- Hvert atriði þarf að svara já við öllum þremur: Af hverju skiptir þetta máli? Hvað geta íslensk fyrirtæki lært af þessu? Hefur þetta áhrif á markaðsmál á Íslandi? Ef svarið er nei á atriðið ekki að birtast.
- Íslenskt efni hefur forgang þegar sambærileg alþjóðleg atriði eru til.
- Betra er að birta 2–3 mjög sterk atriði en 10 veik.
- Hvert atriði verður að útskýra af hverju það skiptir íslenskt markaðsfólk máli.
- Forðast hype, clickbait og almennar AI-fréttir sem hafa ekki skýr áhrif á markaðsmál.
- Samantektir eiga að vera stuttar, skýrar og skrifaðar á eðlilegri íslensku.
- "Why it matters" á alltaf að vera hagnýtt fyrir markaðsfólk.
- Ef ekkert stenst birtingarviðmið skal skýrt segja: **"Engin publish-ready atriði í dag."** — aldrei fylla upp með veikara efni til að ná lágmarksfjölda.

Ef ritstjórn veit af mikilvægu atriði sem sjálfvirka vaktin nær ekki má setja það í `config/editorial-items.json` — en **aldrei** án raunverulegs `source` og `url`. `market_relevance` á að vera annað hvort `"Icelandic"` eða `"Global"` (ekki `"High"` eða annað — sjá "Þekkt vandamál" um núverandi frávik í skránni).

## Scoring reglur

Grunnstig eftir tegund atriðis (`scoreItem()` í `src/fetch.js`):

| Tegund | Stig |
|---|---|
| Íslensk markaðsherferð / agency case | +60 |
| Íslensk endurmörkun | +60 |
| Íslensk verðlaun eða tilnefning | +55 |
| Íslensk ráðning í markaðs- eða samskiptastarf | +45 |
| Alþjóðlegt case með sterkum lærdómi | +45 |
| AI sem breytir markaðsstarfi | +40 |
| Mikilvæg breyting hjá Google, Meta, LinkedIn eða öðrum platformum | +40 |
| Sterk rannsókn eða neytendatrend | +35 |
| Almenn erlend markaðsfrétt | +5 |

Auk þess: +25 ef atriði er íslenskt, +25 fyrir agency/agency-search focus, +20 fyrir icelandic-market focus, +10 fyrir brand focus, +100 fyrir handvalin (`editorial`) atriði, smávægileg nýleikabónus (allt að +4 fyrir atriði yngri en 4 daga).

Sjálfgefið lágmark til birtingar er `35` stig fyrir almenn atriði, en lægra fyrir íslensk atriði (`MIN_ICELANDIC_SCORE=30`, eða `MIN_ICELANDIC_AGENCY_CASE_SCORE=20` fyrir agency-case) — þetta er viljandi til að ná fleiri sterkum íslenskum atriðum, en er ekki skjalfest í README.

## Reglur um íslenskt vs. alþjóðlegt efni

- Markmiðið er 40–60% íslenskt og 40–60% alþjóðlegt efni, en hlutföllin eru **ekki þvinguð** — ef ekki finnast nógu mörg góð íslensk atriði er betra að birta færri.
- `selectItems()` reynir að ná ~40% íslensku hlutfalli af `MAX_ITEMS` áður en restin er fyllt eftir skori.
- `market_relevance` gildi sem eru gild í kerfinu í dag: `"Icelandic"` og `"Global"` (README nefnir líka `"Nordic"` í JSON-skemanu en ekkert í núverandi kóða framleiðir eða meðhöndlar það gildi sérstaklega).
- Ef engin íslensk atriði finnast í keyrslu setur `fetch.js` `noIcelandicItems: true` í `diagnostics.json` og skrifar viðvörun.

## Reglur um röðun frétta (nýjast fyrst)

- Í `data/brief.json`-kaflanum — það sem raunverulega birtist notendum í dag — raðar `renderTopStories()` í `src/generate.js` atriðum eftir `date` í **lækkandi** röð: nýjasta efst.
- Í sjálfvirku vaktinni (`data/intelligence.json`) raðar `selectItems()` í `src/fetch.js` eftir **score**, ekki dagsetningu — `priority`-reiturinn endurspeglar skor-röð, ekki tímaröð. Þessi gögn birtast þó ekki á síðunni í dag (sjá "Þekkt vandamál").
- **Engin pinned/priority-yfirstýring er útfærð í kóðanum í dag.** `config/editorial-items.json` inniheldur `pinnedUntil`-reit á hverju atriði, en hvorki `fetch.js` né `generate.js` les hann. Ef sett verður upp pinned-regla þarf hún að útfærast — hún er ekki til nú þegar.
- Sjálfgefin hegðun (þar til annað er ákveðið): nýjast fremst, nema skýr og útfærð priority/pinned-regla eigi við.

## Hvað má aldrei gera

- **Aldrei** eyða eða skrifa yfir núverandi gögn í `data/` án þess að taka afrit eða staðfesta við notanda fyrst — sérstaklega `data/brief.json`, sem er handritstýrt og ekki endurskapanlegt með script-i.
- **Aldrei** setja inn placeholder-fréttir, uppspunnin atriði eða atriði án raunverulegs `source` og `url`.
- **Aldrei** birta atriði sem svarar ekki játandi öllum þremur ritstjórnarspurningunum, né fylla upp í lágmarksfjölda með veiku efni — ef ekkert stenst viðmið á að segja það skýrt (sjá "Ritstjórnarstefna").
- **Aldrei** þvinga íslenskt/alþjóðlegt hlutfall á kostnað gæða — betra er að birta færri atriði.
- **Aldrei** breyta `data/intelligence.json` handvirkt á sama hátt og `data/brief.json` er breytt — `intelligence.json` er sjálfvirkt framleitt af `fetch.js` og á að vera það áfram.
- **Aldrei** commita `.env` eða `ANTHROPIC_API_KEY`.
- **Aldrei** breyta keyrslutíðni (cron) eða keyrsluheimildum (`permissions: contents: write`) án þess að ræða það fyrst — þótt stefnt sé að daglegri keyrslu til lengri tíma (sjá "Langtímasýn"), á sú breyting að vera meðvituð, undirbúin ákvörðun, ekki tilviljunarkennd breyting samhliða öðru verki.
- **Aldrei** gera breytingar á fleiri en einu kerfi (fetch-síu, generate-sniði, workflow) í sömu breytingu án þess að staðfesta að `npm run build` skili raunverulegu, sannreynanlegu úttaki fyrst.

## Hvernig ný Claude Code session á að taka við verkefninu

1. Lestu þetta skjal fyrst.
2. Ef eitthvað virðist misræmi milli þess sem hér stendur og núverandi kóða (t.d. eftir að einhver af "Þekktu vandamálunum" hefur verið lagfærður), treystu kóðanum og git-sögunni — ekki þessu skjali — og uppfærðu þetta skjal í samræmi.
3. Áður en breytingum er beitt á `src/fetch.js` eða `src/generate.js`: keyrðu `npm run build` staðbundið og skoðaðu `data/diagnostics.json` og `docs/index.html` til að staðfesta að breytingin virki eins og til stóð.
4. Fyrir breytingar sem hafa áhrif á birt efni (scoring, síun, röðun): athugaðu hvort breytingin á að ná til bæði `intelligence.json`-leiðarinnar og `brief.json`-leiðarinnar, því þær eru tvær aðskildar leiðir í dag (sjá "Þekkt vandamál").
5. Ekki gera stórar endurskipulagningar (t.d. sameina `intelligence.json`/`brief.json` flæðin, tengja cards-grid aftur við sjálfvirku vaktina, fjarlægja `config/sources.json`, auka keyrslutíðni) án þess að ræða það og fá samþykki fyrst — þetta eru þekkt vandamál/framtíðarskref en lagfæring þeirra breytir ritstjórnarflæðinu sem núverandi teymi er vant.
6. Hafðu langtímasýnina (dagleg keyrsla, minni handvirk vinna, óbreytt gæðakrafa) í huga sem stefnu — en ekki innleiða hana í einu stökki án samþykkis.

## Þekkt vandamál (staða 2026-07-14)

- `docs/index.html` birtir ekki kortagrindina (`cards-grid`) úr `data/intelligence.json` þrátt fyrir að `generate.js` reikni hana — dauður kóði í bæði CSS og JS.
- Tvær samhliða ritstjórnarleiðir sem skarast að miklu leyti en eru viðhaldnar sitt í hvoru lagi: `config/editorial-items.json` (lesin af `fetch.js`, endar í ósýnilegri `intelligence.json`) og `data/brief.json` (handskrifuð, raunverulega birt).
- `config/sources.json` er ekki notuð af neinum núverandi kóða — leif frá eldri útgáfu verkefnisins.
- `pinnedUntil`-reitur í `config/editorial-items.json` er hvergi lesinn.
- `@anthropic-ai/sdk` er ónotuð dependency; `.env.example`/`ANTHROPIC_API_KEY` vísar í enga virka virkni.
- `market_relevance: "High"` kemur fyrir í `config/editorial-items.json`, sem er ógilt gildi miðað við `"Icelandic" | "Global"` reglu kerfisins.
