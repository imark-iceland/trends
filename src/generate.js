/**
 * IMARK Intelligence - static dashboard generator
 * Reads data/intelligence.json and writes docs/index.html.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("is-IS", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatUpdated(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("is-IS", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function relevanceLabel(value) {
  const labels = {
    Icelandic: "Íslenskt",
    Nordic: "Norrænt",
    Global: "Alþjóðlegt",
  };
  return labels[value] || value;
}

function categoryLabel(value) {
  const labels = {
    "Radningar": "Ráðningar",
    "Verdlaun og tilnefningar": "Verðlaun og tilnefningar",
    "Endurmarkun og ny vorumerki": "Endurmörkun og ný vörumerki",
    "Herferdir": "Herferðir",
    "AI og taekni": "AI og tækni",
    "Althjodleg case": "Alþjóðleg case",
    "Markadsfrettir": "Markaðsfréttir",
  };
  return labels[value] || value;
}

function renderItem(item, variant = "primary") {
  const priority = Number(item.priority || 0);
  return `
    <article class="item ${variant}">
      <div class="item-rank">${priority ? String(priority).padStart(2, "0") : ""}</div>
      <div class="item-body">
        <div class="item-meta">
          <span>${escapeHtml(categoryLabel(item.category))}</span>
          <span>${escapeHtml(relevanceLabel(item.market_relevance))}</span>
          <span>${escapeHtml(formatDate(item.date))}</span>
        </div>
        <h2><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h2>
        <p class="summary">${escapeHtml(item.summary_is)}</p>
        <div class="why">
          <strong>Af hverju þetta skiptir máli</strong>
          <p>${escapeHtml(item.why_it_matters_is)}</p>
        </div>
        <a class="source" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Heimild: ${escapeHtml(item.source)}</a>
      </div>
    </article>`;
}

function fallbackFromLatest(latest) {
  const items = (latest.items || []).slice(0, 10).map((item, index) => ({
    title: item.title,
    source: item.source,
    url: String(item.link || "").trim(),
    date: item.pubDate,
    category: item.category || "Markadsfrettir",
    summary_is: item.summary || "Valin frétt úr fyrri ÍMARK vakt.",
    why_it_matters_is: "Þetta er varðveitt úr síðustu keyrslu og gefur samhengi þar til næsta Intelligence vakt keyrir.",
    market_relevance: "Global",
    priority: index + 1,
  }));

  return {
    week: latest.weekId ? latest.weekId.replace("-W", ", vika ") : "Vika",
    updatedAt: latest.generatedAt || new Date().toISOString(),
    topItems: items,
  };
}

async function readData() {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, "data/intelligence.json"), "utf-8"));
  } catch {
    const latest = JSON.parse(await fs.readFile(path.join(ROOT, "data/latest.json"), "utf-8"));
    return fallbackFromLatest(latest);
  }
}

function buildHTML(data) {
  const allItems = (data.topItems || []).sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99));
  const topItems = allItems.slice(0, 8);
  const moreItems = allItems.slice(8);
  const localCount = topItems.filter((item) => item.market_relevance === "Icelandic").length;

  return `<!DOCTYPE html>
<html lang="is">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ÍMARK Intelligence</title>
  <meta name="description" content="Það sem íslenskt markaðsfólk þarf að vita í þessari viku." />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root {
      --red: #ce202c;
      --ink: #111111;
      --paper: #f4f4f1;
      --muted: #666666;
      --line: #d8d8d2;
      --white: #ffffff;
      --max: 1120px;
    }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--paper);
      line-height: 1.55;
    }
    a { color: inherit; }
    .header {
      background: var(--ink);
      color: var(--white);
      padding: 26px clamp(18px, 4vw, 48px);
    }
    .header-inner, .hero-inner, .content, .footer-inner {
      max-width: var(--max);
      margin: 0 auto;
    }
    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 14px;
      font-weight: 800;
      letter-spacing: .02em;
    }
    .logo img { height: 34px; width: auto; display: block; }
    .updated { color: #b8b8b8; font-size: 14px; text-align: right; }
    .hero {
      background: var(--ink);
      color: var(--white);
      padding: 32px clamp(18px, 4vw, 48px) 56px;
      border-top: 1px solid #2a2a2a;
    }
    .eyebrow {
      color: #ffb7bd;
      text-transform: uppercase;
      font-weight: 800;
      font-size: 12px;
      letter-spacing: .12em;
      margin: 0 0 12px;
    }
    h1 {
      font-size: clamp(42px, 8vw, 82px);
      line-height: .96;
      margin: 0;
      letter-spacing: 0;
      max-width: 920px;
    }
    .subtitle {
      color: #d9d9d9;
      font-size: clamp(18px, 2.3vw, 25px);
      max-width: 760px;
      margin: 20px 0 0;
    }
    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 26px;
    }
    .stat {
      border: 1px solid #3a3a3a;
      padding: 8px 12px;
      color: #d8d8d8;
      font-size: 13px;
    }
    main { padding: 42px clamp(18px, 4vw, 48px) 64px; }
    .section-title {
      margin: 0 0 18px;
      font-size: 14px;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .lead-list {
      display: grid;
      gap: 16px;
    }
    .item {
      display: grid;
      grid-template-columns: 58px 1fr;
      gap: 18px;
      background: var(--white);
      border: 1px solid var(--line);
      padding: clamp(18px, 3vw, 28px);
    }
    .item-rank {
      color: var(--red);
      font-size: 22px;
      font-weight: 800;
      line-height: 1;
    }
    .item-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 10px;
    }
    .item-meta span {
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      padding: 4px 8px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .item h2 {
      margin: 0;
      font-size: clamp(22px, 3vw, 32px);
      line-height: 1.12;
      letter-spacing: 0;
    }
    .item.secondary h2 { font-size: clamp(19px, 2.2vw, 24px); }
    .item h2 a { text-decoration-thickness: 1px; text-underline-offset: 5px; }
    .summary {
      color: #333333;
      font-size: 16px;
      margin: 14px 0 0;
      max-width: 820px;
    }
    .why {
      border-left: 3px solid var(--red);
      margin-top: 16px;
      padding-left: 14px;
      max-width: 860px;
    }
    .why strong {
      display: block;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: 4px;
    }
    .why p { margin: 0; color: #444444; }
    .source {
      display: inline-block;
      margin-top: 16px;
      color: var(--red);
      font-weight: 700;
      font-size: 14px;
    }
    .more {
      margin-top: 42px;
      padding-top: 28px;
      border-top: 1px solid var(--line);
    }
    .more-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
      gap: 16px;
    }
    .empty {
      background: var(--white);
      border: 1px solid var(--line);
      padding: 24px;
      color: var(--muted);
    }
    footer {
      background: var(--ink);
      color: #b8b8b8;
      padding: 28px clamp(18px, 4vw, 48px);
      font-size: 14px;
    }
    .footer-inner {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      flex-wrap: wrap;
    }
    @media (max-width: 680px) {
      .header-inner { align-items: flex-start; flex-direction: column; }
      .updated { text-align: left; }
      .item { grid-template-columns: 1fr; gap: 10px; }
      .item-rank { font-size: 18px; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <div class="logo">
        <img src="imark-logo.png" alt="ÍMARK" />
        <span>Intelligence</span>
      </div>
      <div class="updated">Uppfært ${escapeHtml(formatUpdated(data.updatedAt))}</div>
    </div>
  </header>

  <section class="hero">
    <div class="hero-inner">
      <p class="eyebrow">${escapeHtml(data.week || "")}</p>
      <h1>ÍMARK Intelligence</h1>
      <p class="subtitle">Það sem íslenskt markaðsfólk þarf að vita í þessari viku</p>
      <div class="stats">
        <span class="stat">${topItems.length} mikilvægustu atriðin</span>
        <span class="stat">${localCount} íslensk atriði í aðalyfirliti</span>
        <span class="stat">Allt með heimild og skýringu</span>
      </div>
    </div>
  </section>

  <main>
    <div class="content">
      <h2 class="section-title">Ritstýrt yfirlit</h2>
      <div class="lead-list">
        ${topItems.length ? topItems.map((item) => renderItem(item)).join("\n") : `<p class="empty">Engin atriði fundust í þessari keyrslu.</p>`}
      </div>

      ${moreItems.length ? `
      <section class="more">
        <h2 class="section-title">Fleira áhugavert</h2>
        <div class="more-grid">
          ${moreItems.map((item) => renderItem(item, "secondary")).join("\n")}
        </div>
      </section>` : ""}
    </div>
  </main>

  <footer>
    <div class="footer-inner">
      <span>ÍMARK Intelligence er unnið sjálfvirkt úr opinberum heimildum og birtir ekki atriði án tengils á uppruna.</span>
      <span>GitHub Pages</span>
    </div>
  </footer>
</body>
</html>`;
}

async function main() {
  const data = await readData();
  const html = buildHTML(data);
  await fs.mkdir(path.join(ROOT, "docs"), { recursive: true });
  await fs.writeFile(path.join(ROOT, "docs/index.html"), html, "utf-8");
  console.log(`Generated docs/index.html from ${data.topItems?.length || 0} intelligence items.`);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
