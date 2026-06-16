/**
 * ÍMARK Trends – Live Fetch (no AI required)
 * Fetches real RSS content, scores by relevance, deduplicates,
 * and saves JSON using the article's own snippet as summary.
 *
 * Run: node src/fetch-live.js
 * No API key needed. AI enrichment runs via GitHub Actions on Mondays.
 */

import Parser from "rss-parser";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const CONFIRMED_SOURCES = [
  {
    name: "Nieman Lab",
    url: "https://www.niemanlab.org/feed/",
    category: "Miðlar & pallborð",
    language: "en",
    weight: 1.1,
  },
  {
    name: "Adweek",
    url: "https://www.adweek.com/feed/",
    category: "Auglýsingar & sköpun",
    language: "en",
    weight: 1.2,
  },
  {
    name: "OpenAI Blog",
    url: "https://openai.com/blog/rss.xml",
    category: "AI & markaðssetning",
    language: "en",
    weight: 1.4,
  },
];

const RELEVANCE_HIGH = [
  "brand", "branding", "marketing", "advertising", "media", "pr", "creative",
  "ai", "artificial intelligence", "generative", "consumer", "strategy",
  "campaign", "agency", "social media", "content", "digital", "analytics",
];

const RELEVANCE_MEDIUM = [
  "technology", "data", "privacy", "platform", "growth", "audience",
  "engagement", "measurement", "publisher", "editor", "journalism",
];

const MAX_ITEMS = 10;
const DAYS_BACK = 14;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normalise(str) {
  return str?.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function scoreRelevance(title, snippet, weight) {
  const text = normalise(`${title} ${snippet}`);
  let score = weight;
  for (const kw of RELEVANCE_HIGH) { if (text.includes(kw)) score += 0.3; }
  for (const kw of RELEVANCE_MEDIUM) { if (text.includes(kw)) score += 0.1; }
  return score;
}

function titleSimilarity(a, b) {
  const wa = new Set(normalise(a).split(" ").filter((w) => w.length > 3));
  const wb = new Set(normalise(b).split(" ").filter((w) => w.length > 3));
  if (!wa.size || !wb.size) return 0;
  return [...wa].filter((w) => wb.has(w)).length / Math.max(wa.size, wb.size);
}

function detectTags(title, snippet) {
  const text = `${title} ${snippet}`.toLowerCase();
  const map = {
    AI: ["ai", "artificial intelligence", "generative", "llm", "gpt", "machine learning", "openai", "claude", "gemini"],
    Branding: ["brand", "branding", "identity", "positioning"],
    Miðlar: ["media", "platform", "streaming", "publishing", "newsletter", "journalism"],
    PR: ["pr", "public relations", "reputation", "crisis", "communications"],
    Sköpun: ["creative", "design", "campaign", "copy"],
    Stefna: ["strategy", "strategic", "growth", "transformation"],
    Neytendur: ["consumer", "audience", "customer", "loyalty"],
    Auglýsingar: ["advertising", "ads", "programmatic", "paid media"],
    Social: ["social media", "instagram", "tiktok", "linkedin", "youtube", "twitter"],
  };
  return Object.entries(map)
    .filter(([, kws]) => kws.some((k) => text.includes(k)))
    .map(([tag]) => tag);
}

function decodeEntities(str) {
  return str
    ?.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;|&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">") ?? "";
}

function cleanSnippet(raw) {
  return decodeEntities(raw)
    ?.replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) ?? "";
}

function cleanTitle(raw) {
  return decodeEntities(raw)?.replace(/<[^>]+>/g, "").trim() ?? "";
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

const parser = new Parser({ timeout: 10000 });
const cutoff = Date.now() - DAYS_BACK * 86400000;

async function fetchSource(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = feed.items
      .filter((item) => {
        const pub = new Date(item.isoDate ?? item.pubDate ?? 0).getTime();
        return pub > cutoff && item.link && item.title;
      })
      .map((item) => {
        const snippet = cleanSnippet(item.contentSnippet ?? item.content ?? "");
        return {
          title: cleanTitle(item.title),
          link: item.link,
          source: source.name,
          category: source.category,
          language: source.language,
          pubDate: item.isoDate ?? item.pubDate,
          summary: snippet,
          insight: "",
          tags: detectTags(item.title, snippet),
          score: scoreRelevance(item.title, snippet, source.weight),
        };
      });
    console.log(`  ✓ ${source.name}: ${items.length} items in last ${DAYS_BACK} days`);
    return items;
  } catch (err) {
    console.warn(`  ✗ ${source.name}: ${err.message}`);
    return [];
  }
}

function deduplicate(items) {
  const kept = [];
  for (const item of items) {
    const dupe = kept.some((k) => titleSimilarity(k.title, item.title) >= 0.65);
    if (!dupe) kept.push(item);
  }
  return kept;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 ÍMARK Trends – Live Fetch\n");

  const results = await Promise.all(CONFIRMED_SOURCES.map(fetchSource));
  let items = results.flat();
  console.log(`\n  ${items.length} total items fetched`);

  // Drop items with very short summaries (news tickers, stub posts)
  items = items.filter((i) => i.summary.length >= 60);

  items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  items = deduplicate(items);
  console.log(`  ${items.length} items after deduplication`);

  // Sort by score within the top 20, then take best MAX_ITEMS
  const top20 = items.slice(0, 20).sort((a, b) => b.score - a.score);
  const selected = top20.slice(0, MAX_ITEMS);
  // Re-sort selected by date (newest first) for display
  selected.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  console.log(`  ${selected.length} items selected\n`);

  if (selected.length === 0) {
    console.error("❌ No live articles found. Aborting — not overwriting existing data.");
    process.exit(1);
  }

  const weekId = getWeekId();
  const output = {
    weekId,
    generatedAt: new Date().toISOString(),
    editorsNote: "",
    items: selected,
    disclaimer: "Yfirlit unnið með aðstoð gervigreindar. Tenglar vísa á upprunalegar heimildir.",
    note: "AI enrichment (summaries in Icelandic, insights) runs via GitHub Actions.",
  };

  await fs.mkdir(path.join(ROOT, "data/weeks"), { recursive: true });
  await fs.mkdir(path.join(ROOT, "docs"), { recursive: true });

  await fs.writeFile(path.join(ROOT, "data/latest.json"), JSON.stringify(output, null, 2));
  await fs.writeFile(path.join(ROOT, `data/weeks/${weekId}.json`), JSON.stringify(output, null, 2));

  console.log(`✅ data/latest.json saved (${selected.length} live articles)`);
  console.log("Running generate...\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
