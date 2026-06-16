/**
 * ÍMARK Trends – HTML Generator
 * Reads data/latest.json and writes docs/index.html
 * No AI or API key required.
 *
 * Run: node src/generate.js
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatWeekId(weekId) {
  const [year, week] = weekId.split("-W");
  return `Vika ${parseInt(week, 10)}, ${year}`;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("is-IS", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatGeneratedDate(iso) {
  return new Date(iso).toLocaleDateString("is-IS", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function categorySlug(cat) {
  return cat.toLowerCase().replace(/[^a-záðéíóúýþæö]/g, "-").replace(/-+/g, "-");
}

// ─── Card ────────────────────────────────────────────────────────────────────

function renderCard(item, index) {
  const tags = (item.tags ?? [])
    .map((t) => `<span class="tag">${t}</span>`)
    .join("");

  return `
    <article class="card" data-category="${categorySlug(item.category)}" data-index="${index}">

      <div class="card-meta">
        <span class="card-category">${item.category}</span>
        <span class="card-date">${formatDate(item.pubDate)}</span>
      </div>

      <h2 class="card-title">
        <a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
      </h2>

      <div class="card-byline">
        <span class="card-source-label">Heimild:</span>
        <a class="card-source-link" href="${item.link}" target="_blank" rel="noopener noreferrer">${item.source}</a>
      </div>

      ${item.summary ? `
      <div class="card-summary-block">
        <span class="summary-label">Í stuttu máli</span>
        <p class="card-summary">${item.summary}</p>
      </div>` : ""}

      ${tags ? `<div class="card-tags">${tags}</div>` : ""}

      <a class="card-link" href="${item.link}" target="_blank" rel="noopener noreferrer">
        Lesa frumgrein á ${item.source} →
      </a>

    </article>`;
}

// ─── Archive ─────────────────────────────────────────────────────────────────

function renderArchiveLinks(weeks) {
  if (!weeks.length) return "";
  const links = weeks
    .slice(0, 12)
    .map((w) => `<a href="weeks/${w}.html" class="archive-link">${formatWeekId(w)}</a>`)
    .join("");
  return `
  <section class="archive-section">
    <h3 class="archive-heading">Eldri vikur</h3>
    <div class="archive-links">${links}</div>
  </section>`;
}

async function getArchivedWeeks() {
  try {
    const files = await fs.readdir(path.join(ROOT, "data/weeks"));
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// ─── Full HTML ────────────────────────────────────────────────────────────────

function buildHTML(data, archiveWeeks = []) {
  const cards = data.items.map((item, i) => renderCard(item, i)).join("\n");

  const allCategories = [...new Set(data.items.map((i) => i.category))];
  const filterButtons = allCategories
    .map((cat) => `<button class="filter-btn" data-filter="${categorySlug(cat)}">${cat}</button>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="is">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ÍMARK – Vikan í markaðsmálum</title>
  <meta name="description" content="Valin frétt og þróun í markaðsmálum, branding, auglýsingum og gervigreind – fyrir ÍMARK félaga." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --red:      #ce202c;
      --dark:     #111111;
      --light:    #efefef;
      --white:    #ffffff;
      --grey-1:   #1a1a1a;
      --grey-2:   #2a2a2a;
      --grey-3:   #888888;
      --grey-4:   #cccccc;
      --text:     #111111;
      --text-dim: #555555;
      --font:     'Inter', system-ui, sans-serif;
      --max-w:    1100px;
      --gap:      clamp(1rem, 3vw, 2rem);
    }

    html { font-size: 16px; scroll-behavior: smooth; }
    body { font-family: var(--font); background: var(--light); color: var(--text); line-height: 1.6; -webkit-font-smoothing: antialiased; }
    a { color: inherit; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Header */
    .site-header { background: var(--dark); color: var(--white); padding: 2rem var(--gap); }
    .header-inner { max-width: var(--max-w); margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
    .header-logo { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; color: var(--white); }
    .header-logo span { color: var(--red); }
    .header-tagline { font-size: 0.75rem; color: var(--grey-3); letter-spacing: 0.05em; text-transform: uppercase; margin-left: 0.75rem; }
    .header-date { font-size: 0.85rem; color: var(--grey-3); }

    /* Hero */
    .week-hero { background: var(--dark); color: var(--white); padding: 2.5rem var(--gap) 2rem; border-top: 1px solid var(--grey-2); }
    .week-hero-inner { max-width: var(--max-w); margin: 0 auto; }
    .week-label { display: inline-block; background: var(--red); color: var(--white); font-size: 0.7rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.25rem 0.6rem; margin-bottom: 1rem; }
    .week-title { font-size: clamp(1.75rem, 4vw, 2.75rem); font-weight: 700; letter-spacing: -0.03em; line-height: 1.15; margin-bottom: 0.4rem; }
    .week-subtitle { font-size: 0.85rem; color: var(--grey-3); }

    /* Filters */
    .filters { background: var(--light); padding: 1rem var(--gap); border-bottom: 1px solid var(--grey-4); position: sticky; top: 0; z-index: 10; }
    .filters-inner { max-width: var(--max-w); margin: 0 auto; display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
    .filter-label { font-size: 0.75rem; font-weight: 600; color: var(--grey-3); letter-spacing: 0.05em; text-transform: uppercase; margin-right: 0.25rem; }
    .filter-btn { background: none; border: 1px solid var(--grey-4); color: var(--text-dim); font-family: var(--font); font-size: 0.78rem; font-weight: 500; padding: 0.3rem 0.75rem; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
    .filter-btn:hover, .filter-btn.active { background: var(--dark); border-color: var(--dark); color: var(--white); }

    /* Grid */
    .main { padding: 2.5rem var(--gap) 4rem; }
    .main-inner { max-width: var(--max-w); margin: 0 auto; }
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 1.5rem; }

    /* Card */
    .card { background: var(--white); padding: 1.75rem; display: flex; flex-direction: column; gap: 0.85rem; border: 1px solid rgba(0,0,0,0.07); transition: box-shadow 0.2s, transform 0.2s; }
    .card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.08); transform: translateY(-2px); }
    .card.hidden { display: none; }

    .card-meta { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .card-category { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--red); }
    .card-date { font-size: 0.72rem; color: var(--grey-3); }

    .card-title { font-size: 1.05rem; font-weight: 600; line-height: 1.35; letter-spacing: -0.01em; }
    .card-title a:hover { color: var(--red); text-decoration: none; }

    .card-byline { display: flex; align-items: baseline; gap: 0.3rem; font-size: 0.78rem; }
    .card-source-label { color: var(--grey-3); }
    .card-source-link { font-weight: 600; text-decoration: underline; text-underline-offset: 2px; text-decoration-color: var(--grey-4); }
    .card-source-link:hover { color: var(--red); text-decoration-color: var(--red); text-decoration: underline; }

    .card-summary-block { border-left: 2px solid var(--light); padding-left: 0.9rem; flex: 1; }
    .summary-label { display: block; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--grey-3); margin-bottom: 0.3rem; }
    .card-summary { font-size: 0.88rem; color: var(--text-dim); line-height: 1.6; }

    .card-tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .tag { font-size: 0.65rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; background: var(--light); color: var(--grey-3); padding: 0.2rem 0.5rem; border: 1px solid var(--grey-4); }

    .card-link { font-size: 0.78rem; font-weight: 600; color: var(--red); margin-top: auto; padding-top: 0.5rem; border-top: 1px solid var(--light); }
    .card-link:hover { text-decoration: none; opacity: 0.8; }

    /* Archive */
    .archive-section { max-width: var(--max-w); margin: 0 auto 3rem; padding: 0 var(--gap); }
    .archive-heading { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--grey-3); margin-bottom: 0.75rem; }
    .archive-links { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .archive-link { font-size: 0.78rem; color: var(--text-dim); border: 1px solid var(--grey-4); padding: 0.3rem 0.7rem; transition: all 0.15s; }
    .archive-link:hover { background: var(--dark); color: var(--white); border-color: var(--dark); text-decoration: none; }

    /* Footer */
    .site-footer { background: var(--dark); color: var(--grey-3); padding: 2rem var(--gap); font-size: 0.78rem; }
    .footer-inner { max-width: var(--max-w); margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; }
    .footer-logo { font-weight: 700; font-size: 0.85rem; color: var(--white); }
    .footer-logo span { color: var(--red); }

    .no-results { display: none; text-align: center; padding: 3rem; color: var(--grey-3); font-size: 0.9rem; grid-column: 1 / -1; }

    @media (max-width: 640px) {
      .header-inner { flex-direction: column; align-items: flex-start; }
      .cards-grid { grid-template-columns: 1fr; }
      .card { padding: 1.25rem; }
    }
  </style>
</head>
<body>

  <header class="site-header">
    <div class="header-inner">
      <div>
        <span class="header-logo">Í<span>MARK</span></span>
        <span class="header-tagline">Markaðstíðindi</span>
      </div>
      <span class="header-date">Uppfært ${formatGeneratedDate(data.generatedAt)}</span>
    </div>
  </header>

  <section class="week-hero">
    <div class="week-hero-inner">
      <span class="week-label">Vikan í markaðsmálum</span>
      <h1 class="week-title">${formatWeekId(data.weekId)}</h1>
      <p class="week-subtitle">${data.items.length} valdar greinar · ${formatGeneratedDate(data.generatedAt)}</p>
    </div>
  </section>

  <nav class="filters" aria-label="Sía eftir flokki">
    <div class="filters-inner">
      <span class="filter-label">Flokkur:</span>
      <button class="filter-btn active" data-filter="all">Allir</button>
      ${filterButtons}
    </div>
  </nav>

  <main class="main">
    <div class="main-inner">
      <div class="cards-grid" id="cards-grid">
        ${cards}
        <p class="no-results" id="no-results">Engar greinar í þessum flokki.</p>
      </div>
    </div>
  </main>

  ${renderArchiveLinks(archiveWeeks)}

  <footer class="site-footer">
    <div class="footer-inner">
      <p>${data.disclaimer}</p>
      <span class="footer-logo">Í<span>MARK</span></span>
    </div>
  </footer>

  <script>
    const buttons = document.querySelectorAll('.filter-btn');
    const cards = document.querySelectorAll('.card');
    const noResults = document.getElementById('no-results');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        let visible = 0;
        cards.forEach(card => {
          const show = filter === 'all' || card.dataset.category === filter;
          card.classList.toggle('hidden', !show);
          if (show) visible++;
        });
        noResults.style.display = visible === 0 ? 'block' : 'none';
      });
    });
  </script>

</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🏗️  ÍMARK Trends – Generate HTML\n");

  const latestPath = path.join(ROOT, "data/latest.json");
  let data;
  try {
    data = JSON.parse(await fs.readFile(latestPath, "utf-8"));
  } catch {
    console.error("❌ data/latest.json not found. Run `node src/fetch.js` first.");
    process.exit(1);
  }

  const archiveWeeks = await getArchivedWeeks();
  const html = buildHTML(data, archiveWeeks);

  await fs.mkdir(path.join(ROOT, "docs"), { recursive: true });
  await fs.writeFile(path.join(ROOT, "docs/index.html"), html, "utf-8");

  console.log(`✅ docs/index.html generated`);
  console.log(`   ${data.items.length} articles · Week ${data.weekId}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
