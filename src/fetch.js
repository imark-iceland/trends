/**
 * ÍMARK Trends – Weekly Fetch
 * Sources: RSS feeds + Anthropic sitemap/OG scraping.
 * No API key or paid services required.
 *
 * Run: node src/fetch.js
 */

import Parser from "rss-parser";
import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const config = JSON.parse(await fs.readFile(path.join(ROOT, "config/sources.json"), "utf-8"));

const parser = new Parser({ timeout: 12000 });
const DAYS_BACK = config.settings?.fetchDaysBack ?? 14;
const MAX_ITEMS = config.settings?.maxItemsPerWeek ?? 10;
const CUTOFF = Date.now() - DAYS_BACK * 86400000;
const UA = "Mozilla/5.0 (compatible; ImarkBot/1.0; +https://imark.is)";

// ─── RSS sources ─────────────────────────────────────────────────────────────

const RSS_SOURCES = [
  { name: "Marketing Brew",    url: "https://www.marketingbrew.com/feed.xml",              category: "Auglýsingar & sköpun",   weight: 1.4 },
  { name: "Adweek",            url: "https://www.adweek.com/feed/",                        category: "Auglýsingar & sköpun",   weight: 1.3 },
  { name: "Think with Google", url: "https://feeds.feedburner.com/blogspot/AMob",          category: "AI & markaðssetning",     weight: 1.3 },
  { name: "Google AI Blog",    url: "https://blog.google/technology/ai/rss/",              category: "AI & markaðssetning",     weight: 1.4 },
  { name: "OpenAI News",       url: "https://openai.com/blog/rss.xml",                     category: "AI & markaðssetning",     weight: 1.3 },
  { name: "Nieman Lab",        url: "https://www.niemanlab.org/feed/",                     category: "Miðlar & pallborð",       weight: 1.2 },
  { name: "Meta Newsroom",     url: "https://about.fb.com/news/feed/",                     category: "Miðlar & pallborð",       weight: 1.1 },
  { name: "YouTube Blog",      url: "https://blog.youtube/rss/",                           category: "Miðlar & pallborð",       weight: 1.0 },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

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
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&rsquo;|&apos;/g, "'").replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function cleanText(raw = "") {
  return decodeEntities(raw).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function excerpt(text, maxLen = 300) {
  const clean = cleanText(text);
  if (clean.length <= maxLen) return clean;
  const cut = clean.lastIndexOf(" ", maxLen);
  return clean.slice(0, cut > 0 ? cut : maxLen) + "…";
}

function normalise(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function titleSimilarity(a, b) {
  const wa = new Set(normalise(a).split(" ").filter(w => w.length > 3));
  const wb = new Set(normalise(b).split(" ").filter(w => w.length > 3));
  if (!wa.size || !wb.size) return 0;
  return [...wa].filter(w => wb.has(w)).length / Math.max(wa.size, wb.size);
}

function detectTags(title, snippet) {
  const text = `${title} ${snippet}`.toLowerCase();
  const map = {
    AI:          ["artificial intelligence", " ai ", "generative", "llm", "gpt", "machine learning", "openai", "claude", "gemini", "chatgpt"],
    Branding:    ["brand", "branding", "identity", "positioning", "rebrand"],
    Miðlar:      ["media", "platform", "streaming", "publishing", "newsletter", "journalism", "news site", "publisher"],
    PR:          ["public relations", "reputation", "crisis comms", "press release"],
    Sköpun:      ["creative", "campaign", "copywriting", "art direction"],
    Stefna:      ["strategy", "strategic", "growth", "transformation", "forecast"],
    Neytendur:   ["consumer", "audience", "customer", "loyalty", "behaviour"],
    Auglýsingar: ["advertising", " ads ", "programmatic", "paid media", "ad revenue", "media buying", "ad platform"],
    Social:      ["social media", "instagram", "tiktok", "linkedin", "youtube", "facebook", "threads"],
  };
  return Object.entries(map)
    .filter(([, kws]) => kws.some(k => text.includes(k)))
    .map(([tag]) => tag);
}

// ─── Relevance scoring ────────────────────────────────────────────────────────

const MARKETING_KW = [
  "brand", "marketing", "advertising", "media", "campaign", "agency",
  "consumer", "audience", "creative", "strategy", "digital", "content",
  "social media", "pr ", "public relations", "publisher", "journalism",
  "ad ", "ads ", "generative ai", "artificial intelligence", "openai",
  "markaðs", "auglýs", "miðl", "neytend", "search", "analytics",
  "measurement", "platform", "influencer", "creator", "engagement",
];

const BLOCK_KW = [
  "election", "military", "war crimes", "attack", "police", "murder",
  "crime", "court", "weather", "sport", "football", "basketball",
  "olympic", "G7", "NATO", "Zelensky", "Putin", "knattspyrna",
  "lögregla", "slys", "veður", "handknattleikur", "kosning", "þing ",
];

function scoreItem(title, snippet, weight) {
  const text = normalise(`${title} ${snippet}`);
  if (BLOCK_KW.some(kw => text.includes(kw.toLowerCase()))) return 0;
  if (snippet.length < 60) return 0;
  let score = weight;
  for (const kw of MARKETING_KW) {
    if (text.includes(kw.toLowerCase())) score += 0.25;
  }
  return score;
}

// ─── RSS fetch ────────────────────────────────────────────────────────────────

async function fetchRSS(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = feed.items
      .filter(item => {
        const pub = new Date(item.isoDate ?? item.pubDate ?? 0).getTime();
        return pub > CUTOFF && item.link && item.title;
      })
      .map(item => {
        const title = cleanText(item.title);
        const snippet = excerpt(item.contentSnippet ?? item.content ?? item.summary ?? "");
        return {
          title,
          link: item.link,
          source: source.name,
          category: source.category,
          pubDate: item.isoDate ?? item.pubDate,
          summary: snippet,
          tags: detectTags(title, snippet),
          score: scoreItem(title, snippet, source.weight),
        };
      })
      .filter(item => item.score > 0);

    console.log(`  ✓ ${source.name.padEnd(22)} ${items.length} items`);
    return items;
  } catch (err) {
    console.warn(`  ✗ ${source.name.padEnd(22)} ${err.message.split("\n")[0].slice(0, 55)}`);
    return [];
  }
}

// ─── Anthropic sitemap scraper ────────────────────────────────────────────────

function extractMeta(html, property) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"))
           ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}

async function fetchAnthropicSitemap() {
  const SOURCE = { name: "Anthropic", category: "AI & markaðssetning", weight: 1.4 };
  try {
    const sitemapRes = await fetch("https://www.anthropic.com/sitemap.xml", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(12000),
    });
    const xml = await sitemapRes.text();

    // Extract /news/ URLs with lastmod within window
    const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
    const recentUrls = urlBlocks
      .map(block => {
        const loc = (block.match(/<loc>([^<]+)<\/loc>/) ?? [])[1] ?? "";
        const lastmod = (block.match(/<lastmod>([^<]+)<\/lastmod>/) ?? [])[1] ?? "";
        return { loc, lastmod };
      })
      .filter(({ loc, lastmod }) => {
        if (!loc.includes("/news/") || loc.endsWith("/news/")) return false;
        if (!lastmod) return true; // include if no date
        return new Date(lastmod).getTime() > CUTOFF;
      })
      .slice(0, 15); // cap to avoid too many requests

    console.log(`  Anthropic sitemap: ${recentUrls.length} recent news URLs`);

    // Fetch OG metadata for each article
    const articles = [];
    for (const { loc } of recentUrls) {
      try {
        const r = await fetch(loc, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(8000),
        });
        const html = await r.text();
        const title = extractMeta(html, "og:title") || extractMeta(html, "twitter:title");
        const description = extractMeta(html, "og:description") || extractMeta(html, "twitter:description");
        const pubDate = extractMeta(html, "article:published_time") || extractMeta(html, "og:article:published_time");

        if (!title || !description) continue;
        const snippet = excerpt(description);
        const score = scoreItem(title, snippet, SOURCE.weight);
        if (score === 0) continue;

        articles.push({
          title: cleanText(title),
          link: loc,
          source: SOURCE.name,
          category: SOURCE.category,
          pubDate: pubDate || new Date().toISOString(),
          summary: snippet,
          tags: detectTags(title, snippet),
          score,
        });
      } catch {
        // skip individual page failures silently
      }
    }

    console.log(`  ✓ ${"Anthropic".padEnd(22)} ${articles.length} items`);
    return articles;
  } catch (err) {
    console.warn(`  ✗ ${"Anthropic".padEnd(22)} ${err.message.slice(0, 55)}`);
    return [];
  }
}

// ─── Deduplicate ──────────────────────────────────────────────────────────────

function deduplicate(items) {
  const kept = [];
  for (const item of items) {
    if (!kept.some(k => titleSimilarity(k.title, item.title) >= 0.65)) kept.push(item);
  }
  return kept;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 ÍMARK Trends – Weekly Fetch\n");

  // Fetch all RSS in parallel, then Anthropic sequentially (many page requests)
  const [rssResults, anthropicItems] = await Promise.all([
    Promise.all(RSS_SOURCES.map(fetchRSS)),
    fetchAnthropicSitemap(),
  ]);

  let items = [...rssResults.flat(), ...anthropicItems];
  console.log(`\n  ${items.length} relevant items total`);

  // Score-sort → deduplicate → pick top N → re-sort by date
  items.sort((a, b) => b.score - a.score);
  items = deduplicate(items);
  const selected = items.slice(0, MAX_ITEMS);
  selected.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  console.log(`  ${selected.length} items selected\n`);

  if (selected.length === 0) {
    console.error("❌ No relevant articles found. Existing data not overwritten.");
    process.exit(1);
  }

  const weekId = getWeekId();
  const output = {
    weekId,
    generatedAt: new Date().toISOString(),
    items: selected,
    disclaimer: "Yfirlit unnið sjálfvirkt úr RSS-straumum opinberra heimilda. Tenglar vísa á upprunalegar heimildir.",
  };

  await fs.mkdir(path.join(ROOT, "data/weeks"), { recursive: true });
  await fs.mkdir(path.join(ROOT, "docs"), { recursive: true });
  await fs.writeFile(path.join(ROOT, "data/latest.json"), JSON.stringify(output, null, 2));
  await fs.writeFile(path.join(ROOT, `data/weeks/${weekId}.json`), JSON.stringify(output, null, 2));

  console.log(`✅ ${selected.length} articles saved → data/latest.json`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
