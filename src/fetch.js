/**
 * ÍMARK Trends – Weekly Fetch
 * Category-balanced editorial selection.
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

const DAYS_BACK = 14;
const TOTAL_ITEMS = 10;
const MAX_PER_CATEGORY = 3;
const CUTOFF = Date.now() - DAYS_BACK * 86400000;
const UA = "Mozilla/5.0 (compatible; ImarkBot/1.0; +https://imark.is)";

// ─── Category targets ────────────────────────────────────────────────────────
// quota: ideal number of articles per week
// max:   hard cap per category

const CATEGORIES = {
  "AI & markaðssetning":    { quota: 2, max: MAX_PER_CATEGORY },
  "Branding & auðkenni":    { quota: 2, max: MAX_PER_CATEGORY },
  "Auglýsingar & sköpun":   { quota: 2, max: MAX_PER_CATEGORY },
  "Miðlar & pallborð":      { quota: 2, max: MAX_PER_CATEGORY },
  "Neytendahegðun":         { quota: 1, max: MAX_PER_CATEGORY },
  "PR & orðspor":           { quota: 1, max: 2 },
};

// ─── Sources ─────────────────────────────────────────────────────────────────

const RSS_SOURCES = [
  // AI & Marketing
  { name: "OpenAI News",       url: "https://openai.com/blog/rss.xml",                    category: "AI & markaðssetning",  weight: 1.4 },
  { name: "Google AI Blog",    url: "https://blog.google/technology/ai/rss/",             category: "AI & markaðssetning",  weight: 1.3 },
  { name: "Think with Google", url: "https://feeds.feedburner.com/blogspot/AMob",         category: "AI & markaðssetning",  weight: 1.3 },

  // Branding & Identity
  { name: "Brand New",         url: "https://www.underconsideration.com/brandnew/atom.xml", category: "Branding & auðkenni", weight: 1.5 },
  { name: "Design Week",       url: "https://www.designweek.co.uk/feed/",                 category: "Branding & auðkenni",  weight: 1.3 },
  { name: "Creative Review",   url: "https://www.creativereview.co.uk/feed/",             category: "Branding & auðkenni",  weight: 1.3 },

  // Advertising & Creative
  { name: "Marketing Brew",    url: "https://www.marketingbrew.com/feed.xml",             category: "Auglýsingar & sköpun", weight: 1.4 },
  { name: "Adweek",            url: "https://www.adweek.com/feed/",                       category: "Auglýsingar & sköpun", weight: 1.3 },
  { name: "Digiday",           url: "https://digiday.com/feed/",                          category: "Auglýsingar & sköpun", weight: 1.2 },

  // Media & Platforms
  { name: "Nieman Lab",        url: "https://www.niemanlab.org/feed/",                    category: "Miðlar & pallborð",    weight: 1.3 },
  { name: "Meta Newsroom",     url: "https://about.fb.com/news/feed/",                    category: "Miðlar & pallborð",    weight: 1.1 },
  { name: "YouTube Blog",      url: "https://blog.youtube/rss/",                          category: "Miðlar & pallborð",    weight: 1.0 },
];

// Sources that contribute to secondary categories via keyword detection
// (their primary category is above, but they can fill others)
const SECONDARY_CATEGORY_KEYWORDS = {
  "Neytendahegðun": [
    "consumer behaviour", "consumer research", "consumer trust", "customer loyalty",
    "shopper", "buyer behaviour", "purchase intent", "consumer survey",
    "consumer trend", "customer experience", "consumer insight",
  ],
  "PR & orðspor": [
    "public relations", "reputation management", "crisis communications",
    "media relations", "earned media", "press release", "corporate communications",
  ],
};

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
  const wa = new Set(normalise(a).split(" ").filter(w => w.length > 3));
  const wb = new Set(normalise(b).split(" ").filter(w => w.length > 3));
  if (!wa.size || !wb.size) return 0;
  return [...wa].filter(w => wb.has(w)).length / Math.max(wa.size, wb.size);
}

function detectTags(title, snippet) {
  const text = `${title} ${snippet}`.toLowerCase();
  const map = {
    AI:          [" ai ", "artificial intelligence", "generative", "llm", "gpt", "machine learning", "openai", "claude", "gemini", "chatgpt"],
    Branding:    ["brand", "branding", "identity", "positioning", "rebrand", "logo", "visual identity"],
    Miðlar:      ["media", "platform", "streaming", "publishing", "newsletter", "journalism", "news site"],
    PR:          ["public relations", "reputation", "crisis", "communications", "press release"],
    Sköpun:      ["creative", "design", "campaign", "copywriting", "art direction"],
    Stefna:      ["strategy", "strategic", "growth", "transformation", "forecast"],
    Neytendur:   ["consumer", "audience", "customer", "loyalty", "behaviour", "retail"],
    Auglýsingar: ["advertising", " ads ", "programmatic", "paid media", "ad revenue", "media buying"],
    Social:      ["social media", "instagram", "tiktok", "linkedin", "youtube", "facebook", "threads"],
  };
  return Object.entries(map)
    .filter(([, kws]) => kws.some(k => text.includes(k)))
    .map(([tag]) => tag);
}

// Detect if an article belongs to a secondary category based on content
function detectSecondaryCategory(title, snippet) {
  const text = normalise(`${title} ${snippet}`);
  for (const [cat, keywords] of Object.entries(SECONDARY_CATEGORY_KEYWORDS)) {
    if (keywords.some(k => text.includes(k.toLowerCase()))) return cat;
  }
  return null;
}

const BLOCK_KW = [
  "election", "military", "war crimes", " war ", "attack", "murder", "police",
  "crime", "court ruling", "weather", " sport ", "football", "basketball",
  "olympic", "G7", "NATO", "Zelensky", "knattspyrna", "lögregla", "slys",
  "veður", "handknattleikur", "kosning", "þingræður",
];

function isRelevant(title, snippet) {
  const text = normalise(`${title} ${snippet}`);
  if (snippet.length < 60) return false;
  return !BLOCK_KW.some(kw => text.includes(kw.toLowerCase()));
}

function scoreItem(title, snippet, weight) {
  if (!isRelevant(title, snippet)) return 0;
  const text = normalise(`${title} ${snippet}`);
  const BOOST_KW = [
    "brand", "marketing", "advertising", "media", "campaign", "agency",
    "consumer", "audience", "creative", "strategy", "digital", "content",
    "social media", "pr ", "publisher", "journalism", "ad ", "ai ",
    "generative", "identity", "design", "insight", "trend", "measurement",
    "influencer", "creator", "engagement", "platform", "search",
  ];
  let score = weight;
  for (const kw of BOOST_KW) {
    if (text.includes(kw)) score += 0.2;
  }
  return score;
}

// ─── RSS fetch ────────────────────────────────────────────────────────────────

const parser = new Parser({ timeout: 12000 });

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
        const score = scoreItem(title, snippet, source.weight);
        const secondaryCat = detectSecondaryCategory(title, snippet);
        return {
          title,
          link: item.link,
          source: source.name,
          primaryCategory: source.category,
          category: source.category,
          secondaryCategory: secondaryCat,
          pubDate: item.isoDate ?? item.pubDate,
          summary: snippet,
          tags: detectTags(title, snippet),
          score,
        };
      })
      .filter(item => item.score > 0);

    console.log(`  ✓ ${source.name.padEnd(22)} ${items.length} items`);
    return items;
  } catch (err) {
    console.warn(`  ✗ ${source.name.padEnd(22)} ${err.message.split("\n")[0].slice(0, 50)}`);
    return [];
  }
}

// ─── Anthropic sitemap scraper ────────────────────────────────────────────────

function extractMeta(html, prop) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"))
           ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}

async function fetchAnthropic() {
  const SOURCE = { name: "Anthropic", primaryCategory: "AI & markaðssetning", category: "AI & markaðssetning", weight: 1.4 };
  try {
    const sitemapRes = await fetch("https://www.anthropic.com/sitemap.xml", {
      headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000),
    });
    const xml = await sitemapRes.text();
    const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
    const recentUrls = urlBlocks
      .map(block => ({
        loc: (block.match(/<loc>([^<]+)<\/loc>/) ?? [])[1] ?? "",
        lastmod: (block.match(/<lastmod>([^<]+)<\/lastmod>/) ?? [])[1] ?? "",
      }))
      .filter(({ loc, lastmod }) => {
        if (!loc.includes("/news/") || loc.endsWith("/news/")) return false;
        return !lastmod || new Date(lastmod).getTime() > CUTOFF;
      })
      .slice(0, 12);

    const articles = [];
    for (const { loc } of recentUrls) {
      try {
        const r = await fetch(loc, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
        const html = await r.text();
        const title = extractMeta(html, "og:title") || extractMeta(html, "twitter:title");
        const description = extractMeta(html, "og:description") || extractMeta(html, "twitter:description");
        const pubDate = extractMeta(html, "article:published_time");
        if (!title || !description) continue;
        const snippet = excerpt(description);
        const score = scoreItem(title, snippet, SOURCE.weight);
        if (score === 0) continue;
        articles.push({
          title: cleanText(title),
          link: loc,
          source: SOURCE.name,
          primaryCategory: SOURCE.primaryCategory,
          category: SOURCE.category,
          pubDate: pubDate || new Date().toISOString(),
          summary: snippet,
          tags: detectTags(title, snippet),
          score,
          secondaryCategory: detectSecondaryCategory(title, snippet),
        });
      } catch { /* skip */ }
    }
    console.log(`  ✓ ${"Anthropic".padEnd(22)} ${articles.length} items`);
    return articles;
  } catch (err) {
    console.warn(`  ✗ ${"Anthropic".padEnd(22)} ${err.message.slice(0, 50)}`);
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

// ─── Category-balanced selection ─────────────────────────────────────────────

function selectBalanced(allItems) {
  // Build per-category pools (sorted by score)
  const pools = {};
  for (const cat of Object.keys(CATEGORIES)) pools[cat] = [];

  for (const item of allItems) {
    // Primary bucket
    if (pools[item.primaryCategory]) {
      pools[item.primaryCategory].push({ ...item, category: item.primaryCategory });
    }
    // Secondary bucket (if different and the item might fill a gap)
    if (item.secondaryCategory && item.secondaryCategory !== item.primaryCategory && pools[item.secondaryCategory]) {
      pools[item.secondaryCategory].push({ ...item, category: item.secondaryCategory });
    }
  }

  for (const cat of Object.keys(pools)) {
    pools[cat].sort((a, b) => b.score - a.score);
  }

  const selected = [];
  const usedLinks = new Set();
  const catCounts = {};
  for (const cat of Object.keys(CATEGORIES)) catCounts[cat] = 0;

  // Pass 1: fill each category up to quota
  for (const [cat, { quota, max }] of Object.entries(CATEGORIES)) {
    for (const item of pools[cat]) {
      if (catCounts[cat] >= quota) break;
      if (catCounts[cat] >= max) break;
      if (usedLinks.has(item.link)) continue;
      selected.push(item);
      usedLinks.add(item.link);
      catCounts[cat]++;
    }
  }

  // Pass 2: fill remaining slots up to TOTAL_ITEMS from best remaining items
  if (selected.length < TOTAL_ITEMS) {
    const remaining = allItems
      .filter(item => !usedLinks.has(item.link))
      .sort((a, b) => b.score - a.score);

    for (const item of remaining) {
      if (selected.length >= TOTAL_ITEMS) break;
      const cat = item.primaryCategory;
      if (!catCounts[cat]) catCounts[cat] = 0;
      if (catCounts[cat] >= MAX_PER_CATEGORY) continue;
      selected.push({ ...item, category: cat });
      usedLinks.add(item.link);
      catCounts[cat]++;
    }
  }

  // Final sort by date
  selected.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  return { selected, catCounts };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 ÍMARK Trends – Weekly Fetch\n");

  const [rssResults, anthropicItems] = await Promise.all([
    Promise.all(RSS_SOURCES.map(fetchRSS)),
    fetchAnthropic(),
  ]);

  let allItems = deduplicate([...rssResults.flat(), ...anthropicItems]);
  console.log(`\n  ${allItems.length} unique relevant items`);

  const { selected, catCounts } = selectBalanced(allItems);

  console.log(`\n  Category breakdown:`);
  for (const [cat, count] of Object.entries(catCounts)) {
    if (count > 0) console.log(`    ${cat.padEnd(28)} ${count}`);
  }
  console.log(`\n  ${selected.length} total items selected`);

  if (selected.length === 0) {
    console.error("\n❌ No articles found. Existing data not overwritten.");
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

  console.log(`\n✅ Saved → data/latest.json`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
