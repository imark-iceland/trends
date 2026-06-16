# ÍMARK Trends Dashboard

Vikuyfirlit markaðsmála, branding, gervigreindar og fjölmiðlunar – fyrir ÍMARK félaga á imark.is.

---

## Uppbygging verkefnis

```
imark-trends/
├── .github/workflows/
│   └── weekly-fetch.yml      # GitHub Actions – keyrir á hverjum mánudegi kl. 07:00
├── config/
│   └── sources.json          # RSS heimildir, flokkar, blokkuð lén – breyttu hér
├── data/
│   ├── latest.json           # Síðasta vika (lesið af dashboard)
│   └── weeks/                # Skjalasafn – ein JSON-skrá á viku
├── docs/
│   └── index.html            # Myndaður dashboard (settur inn á imark.is)
├── src/
│   ├── fetch.js              # Sækir RSS, gefur stig, eyðir tvítekningum, kallar á Claude
│   └── generate.js           # Myndar HTML úr JSON
├── .env.example              # Afritaðu í .env og fylltu út
└── package.json
```

---

## Uppsetning

### 1. Klónaðu verkefnið

```bash
git clone https://github.com/<þitt-notandanafn>/imark-trends.git
cd imark-trends
npm install
```

### 2. Settu upp Anthropic API lykil

```bash
cp .env.example .env
# Opnaðu .env og settu inn þinn ANTHROPIC_API_KEY
```

Fáðu lykil á [console.anthropic.com](https://console.anthropic.com).

### 3. Prófaðu staðbundið

```bash
npm run build   # sækir + myndar HTML
npm run preview # opnar á localhost
```

---

## GitHub Actions – Sjálfvirk uppfærsla

Verkflæðið í `.github/workflows/weekly-fetch.yml` keyrir sjálfkrafa á hverjum mánudegi kl. 07:00 UTC.

### Setja upp

1. Farðu í **GitHub → Settings → Secrets and variables → Actions**
2. Bættu við leyndarmáli: `ANTHROPIC_API_KEY` með gildi API-lykils þíns
3. Virkjaðu GitHub Pages undir **Settings → Pages → Source: Deploy from branch → main → /public**

Eftir fyrstu keyrslu mun `https://<notandanafn>.github.io/imark-trends/` vera virkt.

---

## Innfelling á imark.is (Squarespace)

### Leið 1 – iframe (mælt með)

Þetta er einfaldasta leiðin. Settu inn Code Block á síðu í Squarespace og límdu inn:

```html
<iframe
  src="https://<notandanafn>.github.io/imark-trends/"
  width="100%"
  height="1800"
  style="border:none; min-height:1200px;"
  title="ÍMARK – Vikan í markaðsmálum"
  loading="lazy"
></iframe>
<script>
  // Sjálfvirk hæðarjöfnun
  window.addEventListener('message', function(e) {
    if (e.data && e.data.imarkHeight) {
      document.querySelector('iframe').style.height = e.data.imarkHeight + 'px';
    }
  });
</script>
```

Til að virkja sjálfvirka hæðarjöfnun, bættu þessum línum við neðst í `docs/index.html` á undan `</body>`:

```html
<script>
  window.parent.postMessage({ imarkHeight: document.body.scrollHeight }, '*');
</script>
```

### Leið 2 – Setja HTML beint inn

Ef þú vilt sameina dashboard við Squarespace sniðmát:

1. Opnaðu `docs/index.html`
2. Límdu allt efni í Custom Code Block í Squarespace
3. Uppfærðu handvirkt eftir hverja keyrslu (eða sjálfvirkt með webhook)

---

## Stillingar – `config/sources.json`

### Bæta við heimild

```json
{
  "name": "Nafn heimildar",
  "url": "https://example.com/rss",
  "category": "AI & markaðssetning",
  "language": "en",
  "weight": 1.2
}
```

`weight` er milli 0.5–2.0. Hærra þýðir meiri forgang við val á greinum.

### Flokkar

Flokkar eru stilltir í `categories` listanum. Bætti þú við flokki þar, bættu einnig við heimild sem notar hann.

### Blokkuð lén

Bættu lénum við `blockedDomains` til að útiloka þau:

```json
"blockedDomains": ["example-spam-site.com", "clickbait.net"]
```

### Blokkuð leitarorð

`blockedKeywords` útiloka greinar sem innihalda þessi orð í titli eða texta.

---

## Tækni

| Hluti | Val |
|---|---|
| Fetch | Node.js 18+, `rss-parser` |
| AI samantektir | Claude API (`claude-opus-4-8`) |
| HTML myndun | Vanillu JavaScript (engar þriðjaflokksramma) |
| Keyrsla | GitHub Actions (cron) |
| Geymsla | JSON-skrár í `data/` |
| Innfelling | iframe eða beint HTML á Squarespace |

---

## Uppfærsla á líkani eða greinafíkn

Í `config/sources.json` undir `settings.ai`:

```json
"ai": {
  "model": "claude-opus-4-8",
  "summaryMaxTokens": 300,
  "editorNoteMaxTokens": 500
}
```

---

## Handvirk keyrsla

```bash
# Sækja nýtt efni og mynda HTML
npm run build

# Sækja einungis
npm run fetch

# Mynda HTML einungis (úr gögnum sem þegar eru til)
npm run generate
```

---

## Skjalasafn

Hverja viku er JSON-skrá vistuð í `data/weeks/YYYY-WXX.json`. Dashboard sýnir tengla á síðustu 12 vikur neðst á síðunni.

---

## Leyfi

Verkefnið er ætlað ÍMARK – Markaðssamtök Íslands til innri nota. Allar heimildir eru opinberar RSS-streymisheimildir og greinar opnast í upprunalegri heimild.
