/**
 * ÍMARK Trends – Weekly Fetch
 * Fetches RSS feeds, scores relevance, deduplicates, saves JSON.
 * No API key or paid services required.
 *
 * Run: node src/fetch.js
 */

import Parser from "rss-parser";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const config = JSON.parse(
  await fs.readFile(path.join(ROOT, "config/sources.json"), "utf-8")
);

const parser = new Parser({ timeout: 10000 });
const DAYS_BACK = config.settings.fetchDaysBack ?? 14;
const MAX_ITEMS = config.settings.maxItemsPerWeek ?? 10;
const CUTOFF = Date.now() - DAYS_BACK * 86400000;

// ─── Utilities ───────────────────────────────────────────────────────────────

function getWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function decodeEntities(str = "") {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;|&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(raw = "") {
  return decodeEntities(raw)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(text, maxLen = 280) {
  const clean = cleanText(text);
  if (clean.length <= maxLen) return clean;
  const cut = clean.lastIndexOf(" ", maxLen);
  return clean.slice(0, cut > 0 ? cut : maxLen) + "…";
}

function normalise(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
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
    AI: ["artificial intelligence", " ai ", "generative", "llm", "gpt", "machine learning", "openai", "claude", "gemini", "chatgpt"],
    Branding: ["brand", "branding", "identity", "positioning", "rebrand"],
    Miðlar: ["media", "platform", "streaming", "publishing", "newsletter", "journalism", "news site", "publisher"],
    PR: ["public relations", "reputation", "crisis comms", "press release", "communications"],
    Sköpun: ["creative", "campaign", "copywriting", "art direction", "design"],
    Stefna: ["strategy", "strategic", "growth", "transformation", "forecast"],
    Neytendur: ["consumer", "audience", "customer", "loyalty", "behaviour", "trust"],
    Auglýsingar: ["advertising", " ads ", "programmatic", "paid media", "ad revenue", "ad platform", "media buying"],
    Social: ["social media", "instagram", "tiktok", "linkedin", "youtube", "twitter", "facebook"],
  };
  return Object.entries(map)
    .filter(([, kws]) => kws.some((k) => text.includes(k)))
    .map(([tag]) => tag);
}

// ─── Relevance scoring ───────────────────────────────────────────────────────

const MARKETING_KEYWORDS = [
  "brand", "marketing", "advertising", "media", "campaign", "agency",
  "consumer", "audience", "creative", "strategy", "digital", "content",
  "social media", "pr", "public relations", "publisher", "journalism",
  "ad ", "ads ", "generative ai", "artificial intelligence", "openai",
  "markaðs", "auglýs", "miðl", "neytend",
];

const IRRELEVANT_KEYWORDS = [
  "election", "military", "war", "attack", "police", "crime", "court",
  "weather", "sport", "football", "basketball", "olympic",
  "G7", "NATO", "Zelensky", "Putin", "þing", "kosning", "lögregla",
  "slys", "veður", "knattspyrna", "handknattleikur",
];

function scoreItem(title, snippet, sourceWeight) {
  const text = normalise(`${title} ${snippet}`);

  // Hard disqualify on irrelevant topics
  for (const kw of IRRELEVANT_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) return 0;
  }

  // Hard disqualify if too short (ticker/stub posts)
  if (snippet.length < 60) return 0;

  let score = sourceWeight;
  for (const kw of MARKETING_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) score += 0.3;
  }
  return score;
}

// ─── Fetch sources ───────────────────────────────────────────────────────────

async function fetchSource(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = feed.items
      .filter((item) => {
        const pub = new Date(item.isoDate ?? item.pubDate ?? 0).getTime();
        return pub > CUTOFF && item.link && item.title;
      })
      .map((item) => {
        const title = cleanText(item.title);
        const snippet = excerpt(item.contentSnippet ?? item.content ?? item.summary ?? "");
        const score = scoreItem(title, snippet, source.weight ?? 1.0);
        return {
          title,
          link: item.link,
          source: source.name,
          category: source.category,
          language: source.language,
          pubDate: item.isoDate ?? item.pubDate,
          summary: snippet,
          tags: detectTags(title, snippet),
          score,
        };
      })
      .filter((item) => item.score > 0);

    console.log(`  ✓ ${source.name}: ${items.length} relevant items`);
    return items;
  } catch (err) {
    console.warn(`  ✗ ${source.name}: ${err.message.split("\n")[0]}`);
    return [];
  }
}

// ─── Deduplicate ─────────────────────────────────────────────────────────────

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
  console.log("🔍 ÍMARK Trends – Weekly Fetch\n");

  const results = await Promise.all(config.sources.map(fetchSource));
  let items = results.flat();
  console.log(`\n  ${items.length} relevant items across all sources`);

  // Score-sort → deduplicate → re-sort by date
  items.sort((a, b) => b.score - a.score);
  items = deduplicate(items);

  const selected = items.slice(0, MAX_ITEMS);
  selected.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  console.log(`  ${selected.length} items selected\n`);

  if (selected.length === 0) {
    console.error("❌ No relevant articles found. Aborting — existing data not overwritten.");
    process.exit(1);
  }

  const weekId = getWeekId();
  const output = {
    weekId,
    generatedAt: new Date().toISOString(),
    items: selected,
    disclaimer: "Yfirlit unnið sjálfvirkt úr RSS-straumum. Tenglar vísa á upprunalegar heimildir.",
  };

  await fs.mkdir(path.join(ROOT, "data/weeks"), { recursive: true });
  await fs.mkdir(path.join(ROOT, "docs"), { recursive: true });

  await fs.writeFile(path.join(ROOT, "data/latest.json"), JSON.stringify(output, null, 2));
  await fs.writeFile(path.join(ROOT, `data/weeks/${weekId}.json`), JSON.stringify(output, null, 2));

  console.log(`✅ ${selected.length} articles saved → data/latest.json`);
  console.log(`✅ Archive → data/weeks/${weekId}.json`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
