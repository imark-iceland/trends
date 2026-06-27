/**
 * IMARK Intelligence - weekly watcher
 * Builds data/intelligence.json for a static GitHub Pages dashboard.
 */

import Parser from "rss-parser";
import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DAYS_BACK = Number(process.env.IMARK_DAYS_BACK || 14);
const MAX_ITEMS = Number(process.env.IMARK_MAX_ITEMS || 14);
const TOP_COUNT = 8;
const CUTOFF = Date.now() - DAYS_BACK * 86400000;
const UA = "IMARK-Intelligence/1.0 (+https://imark-iceland.github.io/trends/)";

const parser = new Parser({
  timeout: 12000,
  headers: { "User-Agent": UA },
});

const SOURCES = [
  { name: "Markadsmal", url: "https://markadsmal.is/feed/", type: "rss", market: "Icelandic", weight: 2.4 },
  { name: "Markadsmal", url: "https://markadsmal.is/", type: "site", market: "Icelandic", weight: 1.8 },
  { name: "VB", url: "https://vb.is/feed/", type: "rss", market: "Icelandic", weight: 2.2 },
  { name: "VB", url: "https://vb.is/", type: "site", market: "Icelandic", weight: 1.6 },

  { name: "Pipar/TBWA", url: "https://pipar-tbwa.is/", type: "site", market: "Icelandic", weight: 1.9 },
  { name: "Brandenburg", url: "https://brandenburg.is/", type: "site", market: "Icelandic", weight: 1.8 },
  { name: "Hvita husid", url: "https://www.hvitahusid.is/", type: "site", market: "Icelandic", weight: 1.8 },
  { name: "Cirkus", url: "https://cirkus.is/", type: "site", market: "Icelandic", weight: 1.6 },
  { name: "Kontor", url: "https://kontor.is/", type: "site", market: "Icelandic", weight: 1.6 },

  { name: "Icelandair", url: "https://www.icelandair.com/blog/", type: "site", market: "Icelandic", weight: 1.5 },
  { name: "Nova", url: "https://www.nova.is/frettir", type: "site", market: "Icelandic", weight: 1.6 },
  { name: "Siminn", url: "https://www.siminn.is/frettir", type: "site", market: "Icelandic", weight: 1.6 },
  { name: "Kronan", url: "https://kronan.is/frettir", type: "site", market: "Icelandic", weight: 1.6 },
  { name: "Arion banki", url: "https://www.arionbanki.is/bankinn/fjolmidlatorg/frettir/", type: "site", market: "Icelandic", weight: 1.5 },
  { name: "Landsbankinn", url: "https://www.landsbankinn.is/frettir", type: "site", market: "Icelandic", weight: 1.5 },
  { name: "Blaa lonid", url: "https://www.bluelagoon.com/news", type: "site", market: "Icelandic", weight: 1.4 },
  { name: "Islandsstofa", url: "https://www.islandsstofa.is/frettir", type: "site", market: "Icelandic", weight: 1.7 },
  { name: "Syn", url: "https://syn.is/frettir", type: "site", market: "Icelandic", weight: 1.5 },

  { name: "Marketing Week", url: "https://www.marketingweek.com/feed/", type: "rss", market: "Global", weight: 1.5 },
  { name: "Adweek", url: "https://www.adweek.com/feed/", type: "rss", market: "Global", weight: 1.4 },
  { name: "The Drum", url: "https://www.thedrum.com/rss/news", type: "rss", market: "Global", weight: 1.4 },
  { name: "Campaign", url: "https://www.campaignlive.co.uk/rss", type: "rss", market: "Global", weight: 1.3 },
  { name: "Creative Review", url: "https://www.creativereview.co.uk/feed/", type: "rss", market: "Global", weight: 1.3 },
  { name: "Design Week", url: "https://www.designweek.co.uk/feed/", type: "rss", market: "Global", weight: 1.3 },
  { name: "Marketing Brew", url: "https://www.marketingbrew.com/feed.xml", type: "rss", market: "Global", weight: 1.4 },
  { name: "OpenAI", url: "https://openai.com/blog/rss.xml", type: "rss", market: "Global", weight: 1.1, requireMarketingSignal: true },
  { name: "Anthropic", url: "https://www.anthropic.com/news", type: "site", market: "Global", weight: 1.1, requireMarketingSignal: true },
  { name: "Canva", url: "https://www.canva.com/newsroom/news/", type: "site", market: "Global", weight: 1.1, requireMarketingSignal: true },
  { name: "Adobe", url: "https://blog.adobe.com/en/topics/creative-cloud", type: "site", market: "Global", weight: 1.1, requireMarketingSignal: true },
];

const CATEGORY_RULES = [
  ["Radningar", ["hired", "appointed", "joins", "promotion", "chief marketing", "cmo", "director", "radinn", "radning", "tekur vid", "nyr framkvæmdastjori"]],
  ["Verdlaun og tilnefningar", ["award", "awards", "shortlist", "winner", "cannes", "effie", "tilnefnd", "verdlaun", "hlaut", "vann"]],
  ["Endurmarkun og ny vorumerki", ["rebrand", "brand identity", "new identity", "logo", "visual identity", "refresh", "endurmark", "nytt merki", "ny ásýnd"]],
  ["Herferdir", ["campaign", "ad campaign", "launches", "work by", "advert", "herferd", "auglýsing", "kynningarherferd", "markaðsherferd"]],
  ["AI og taekni", ["ai", "artificial intelligence", "generative", "chatgpt", "claude", "openai", "anthropic", "canva", "adobe", "automation", "gervigreind"]],
  ["Althjodleg case", ["case study", "strategy", "effectiveness", "brand growth", "lessons", "learned", "how ", "why "]],
];

const HIGH_SIGNAL = [
  "marketing", "brand", "branding", "advertising", "campaign", "agency", "creative",
  "media", "social", "content", "consumer", "customer", "commerce", "retail",
  "design", "identity", "rebrand", "pr", "communications", "sponsorship",
  "market", "markads", "markaðs", "vorumerki", "vörumerki", "augl", "herfer",
  "midl", "miðl", "samskipta", "kynning", "neytend", "honnun", "hönnun",
];

const BLOCKED = [
  "stock market", "share price", "earnings call", "football", "basketball",
  "crime", "war ", "election", "weather", "crypto", "nft", "casino",
  "lögregla", "slys", "veður", "kosning", "knattspyrna", "handbolti",
];

const SITE_NOISE = [
  "logo", "merki", "tengili", "fyrir fjölmiðla", "þjónustutilkynningar",
  "status", "privacy", "cookie", "skilmalar", "terms", "gjaldskra",
  "laus störf", "störf í boði", "opnunart", "english", "newsletter",
];

function cleanText(value = "") {
  return decodeEntities(String(value))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value = "") {
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalise(value = "") {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9áðéíóúýþæö\s-]/gi, " ").replace(/\s+/g, " ").trim();
}

function containsKeyword(text, keyword) {
  const clean = normalise(text);
  const kw = normalise(keyword);
  if (!kw) return false;
  if (/^[a-z0-9áðéíóúýþæö]{1,3}$/i.test(kw)) {
    return new RegExp(`(^|\\s)${kw}(\\s|$)`, "i").test(clean);
  }
  return clean.includes(kw);
}

function getIsoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { weekId: `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`, label: `Vika ${week}, ${d.getUTCFullYear()}` };
}

function excerpt(text, max = 260) {
  const clean = cleanText(text);
  if (clean.length <= max) return clean;
  const cut = clean.lastIndexOf(" ", max);
  return `${clean.slice(0, cut > 80 ? cut : max)}...`;
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

function linkKey(url) {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

function titleSimilarity(a, b) {
  const aw = new Set(normalise(a).split(" ").filter((w) => w.length > 3));
  const bw = new Set(normalise(b).split(" ").filter((w) => w.length > 3));
  if (!aw.size || !bw.size) return 0;
  return [...aw].filter((w) => bw.has(w)).length / Math.max(aw.size, bw.size);
}

function detectCategory(title, summary) {
  const text = `${title} ${summary}`;
  for (const [category, keywords] of CATEGORY_RULES) {
    if (keywords.some((kw) => containsKeyword(text, kw))) return category;
  }
  return "Markadsfrettir";
}

function hasSignal(title, summary) {
  const text = `${title} ${summary}`;
  if (BLOCKED.some((kw) => containsKeyword(text, kw))) return false;
  return HIGH_SIGNAL.some((kw) => containsKeyword(text, kw));
}

function scoreItem(item, source) {
  const text = `${item.title} ${item.rawSummary}`;
  let score = source.weight;

  if (source.market === "Icelandic") score += 1.4;
  if (item.category === "Herferdir") score += 0.8;
  if (item.category === "Endurmarkun og ny vorumerki") score += 0.7;
  if (item.category === "Radningar") score += 0.6;
  if (item.category === "Verdlaun og tilnefningar") score += 0.6;
  if (item.category === "AI og taekni" && hasSignal(item.title, item.rawSummary)) score += 0.5;
  if (["Icelandair", "Nova", "Siminn", "Kronan", "Arion banki", "Landsbankinn", "Islandsstofa", "Syn"].includes(source.name)) score += 0.4;

  for (const keyword of HIGH_SIGNAL) {
    if (containsKeyword(text, keyword)) score += 0.08;
  }

  const age = Date.now() - new Date(item.date || Date.now()).getTime();
  if (Number.isFinite(age) && age > 0) score += Math.max(0, 0.5 - age / (DAYS_BACK * 86400000));
  return score;
}

function summaryIs(item) {
  const sourceText = item.rawSummary || item.title;
  if (sourceText && sourceText !== item.title) return excerpt(sourceText, 230);

  const categoryLead = {
    "Herferdir": "Ny herferd eða kynning sem vert er að fylgjast með.",
    "Endurmarkun og ny vorumerki": "Breyting á vörumerki, ásýnd eða stöðu sem getur gefið vísbendingu um nýja stefnu.",
    "Radningar": "Mannauðs- eða leiðtogabreyting í markaðs- og samskiptum.",
    "Verdlaun og tilnefningar": "Viðurkenning eða tilnefning sem varpar ljósi á árangur og faglega þróun.",
    "AI og taekni": "Tæknifrétt með möguleg áhrif á efnisgerð, greiningu eða markaðsstarf.",
    "Althjodleg case": "Alþjóðlegt dæmi sem getur nýst sem lærdómur fyrir íslenskt markaðsfólk.",
    "Markadsfrettir": "Frétt sem tengist vörumerkjum, miðlum, neytendum eða markaðsstarfi.",
  };
  return `${categoryLead[item.category]} Heimild: ${item.source}.`;
}

function whyItMattersIs(item) {
  const localPrefix = item.market_relevance === "Icelandic"
    ? "Þetta skiptir íslenskt markaðsfólk máli vegna þess að þetta gerist á heimamarkaði og getur haft bein áhrif á samkeppni, miðlun eða væntingar neytenda."
    : "Þetta skiptir íslenskt markaðsfólk máli vegna þess að dæmið sýnir þróun sem getur haft áhrif á stefnu, skapandi vinnu eða miðlanotkun hér heima.";

  const categoryWhy = {
    "Herferdir": "Það gefur vísbendingu um hvaða skilaboð, rásir og menningarleg tenging eru að virka.",
    "Endurmarkun og ny vorumerki": "Það hjálpar fólki að lesa hvernig vörumerki eru að skerpa stöðu sína og aðgreiningu.",
    "Radningar": "Mannauðsbreytingar sýna hvar hæfni, ábyrgð og áherslur í markaðsstarfi eru að færast.",
    "Verdlaun og tilnefningar": "Viðurkenningar draga fram vinnubrögð og hugmyndir sem fagið getur lært af.",
    "AI og taekni": "Tæknin getur breytt hraða, kostnaði og gæðum í efnisgerð, greiningu og þjónustuupplifun.",
    "Althjodleg case": "Skýrt alþjóðlegt dæmi hjálpar teymum að þýða lærdóm yfir í íslenskan veruleika.",
    "Markadsfrettir": "Fréttin gefur samhengi um breytingar á neytendahegðun, miðlum eða vörumerkjastjórnun.",
  };

  return `${localPrefix} ${categoryWhy[item.category]}`;
}

function parseDateFromText(title) {
  const text = cleanText(title).toLowerCase();
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) {
    const [, month, day, year] = slash;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)).toISOString();
  }

  const months = {
    januar: 0, janúar: 0, februar: 1, febrúar: 1, mars: 2, april: 3, apríl: 3,
    mai: 4, maí: 4, juni: 5, júní: 5, juli: 6, júlí: 6, agust: 7, ágúst: 7,
    september: 8, oktober: 9, október: 9, november: 10, desember: 11,
  };
  const monthNames = Object.keys(months).join("|");
  const named = text.match(new RegExp(`\\b(\\d{1,2})\\.\\s*(${monthNames})\\s+(20\\d{2})\\b`, "i"));
  if (named) {
    const [, day, monthName, year] = named;
    return new Date(Date.UTC(Number(year), months[monthName], Number(day), 12)).toISOString();
  }
  return "";
}

function isNoiseLink(title, url) {
  const text = `${title} ${url}`;
  if (SITE_NOISE.some((kw) => containsKeyword(text, kw))) return true;
  if (normalise(title).split(" ").length < 3) return true;
  return false;
}

async function fetchRSS(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = feed.items
      .map((entry) => {
        const date = entry.isoDate || entry.pubDate || entry.date || new Date().toISOString();
        const rawSummary = excerpt(entry.contentSnippet || entry.summary || entry.content || "", 280);
        return makeCandidate(source, {
          title: cleanText(entry.title),
          url: cleanText(entry.link),
          date,
          rawSummary,
        });
      })
      .filter(Boolean);
    console.log(`OK  ${source.name.padEnd(18)} ${items.length}`);
    return items;
  } catch (error) {
    console.warn(`--  ${source.name.padEnd(18)} ${error.message.split("\n")[0].slice(0, 80)}`);
    return [];
  }
}

async function fetchSite(source) {
  try {
    const response = await fetch(source.url, {
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(([, href, label]) => ({
        url: absoluteUrl(href, source.url),
        title: cleanText(label),
      }))
      .filter((link) => link.url && link.title.length >= 12)
      .filter((link) => !link.url.includes("#") && !/\.(pdf|jpg|jpeg|png|gif|svg)$/i.test(link.url))
      .slice(0, 40);

    const unique = [];
    const seen = new Set();
    for (const link of links) {
      const key = linkKey(link.url);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(link);
      }
    }

    const items = unique
      .filter((link) => !isNoiseLink(link.title, link.url))
      .map((link) => makeCandidate(source, {
        ...link,
        date: parseDateFromText(link.title),
        rawSummary: "",
      }))
      .filter(Boolean)
      .slice(0, 8);

    console.log(`OK  ${source.name.padEnd(18)} ${items.length}`);
    return items;
  } catch (error) {
    console.warn(`--  ${source.name.padEnd(18)} ${error.message.split("\n")[0].slice(0, 80)}`);
    return [];
  }
}

function makeCandidate(source, entry) {
  if (!entry.title || !entry.url) return null;
  const dateMs = new Date(entry.date || 0).getTime();
  if (source.type === "rss" && (!dateMs || dateMs < CUTOFF)) return null;
  if (source.type === "site" && dateMs && dateMs < CUTOFF) return null;

  const category = detectCategory(entry.title, entry.rawSummary);
  const base = {
    title: cleanText(entry.title),
    source: source.name,
    url: entry.url.trim(),
    date: new Date(entry.date || Date.now()).toISOString(),
    category,
    rawSummary: entry.rawSummary,
    market_relevance: source.market,
  };

  if (!hasSignal(base.title, base.rawSummary) && category === "Markadsfrettir") return null;
  if (source.type === "site" && !entry.date && category === "Markadsfrettir") return null;
  if (source.requireMarketingSignal && !hasSignal(base.title, base.rawSummary)) return null;

  const score = scoreItem(base, source);
  return {
    ...base,
    score,
    summary_is: summaryIs(base),
    why_it_matters_is: whyItMattersIs(base),
  };
}

function dedupe(items) {
  const kept = [];
  const seenUrls = new Set();
  for (const item of items.sort((a, b) => b.score - a.score)) {
    const key = linkKey(item.url);
    if (seenUrls.has(key)) continue;
    if (kept.some((existing) => titleSimilarity(existing.title, item.title) >= 0.68)) continue;
    seenUrls.add(key);
    kept.push(item);
  }
  return kept;
}

function selectItems(items) {
  const deduped = dedupe(items);
  const local = deduped.filter((item) => item.market_relevance === "Icelandic");
  const global = deduped.filter((item) => item.market_relevance !== "Icelandic");
  const neededLocal = local.length >= Math.ceil(TOP_COUNT * 0.4) ? Math.ceil(TOP_COUNT * 0.4) : local.length;

  const selected = [];
  const add = (item) => {
    if (selected.length >= MAX_ITEMS) return;
    if (!selected.some((existing) => linkKey(existing.url) === linkKey(item.url))) selected.push(item);
  };

  local.slice(0, neededLocal).forEach(add);
  [...deduped].forEach(add);

  const top = selected
    .slice(0, MAX_ITEMS)
    .map((item, index) => ({
      title: item.title,
      source: item.source,
      url: item.url,
      date: item.date,
      category: item.category,
      summary_is: item.summary_is,
      why_it_matters_is: item.why_it_matters_is,
      market_relevance: item.market_relevance,
      priority: index + 1,
    }));

  return top;
}

async function main() {
  console.log("IMARK Intelligence - weekly watch\n");

  const batches = await Promise.all(SOURCES.map((source) => (
    source.type === "rss" ? fetchRSS(source) : fetchSite(source)
  )));
  const candidates = batches.flat();
  const topItems = selectItems(candidates);

  if (topItems.length < 5) {
    console.error(`Only ${topItems.length} usable sourced items found. Existing intelligence.json was not overwritten.`);
    process.exit(1);
  }

  const { weekId, label } = getIsoWeek();
  const output = {
    week: label,
    updatedAt: new Date().toISOString(),
    topItems,
  };

  await fs.mkdir(path.join(ROOT, "data/weeks"), { recursive: true });
  await fs.mkdir(path.join(ROOT, "docs"), { recursive: true });
  await fs.writeFile(path.join(ROOT, "data/intelligence.json"), `${JSON.stringify(output, null, 2)}\n`, "utf-8");
  await fs.writeFile(path.join(ROOT, `data/weeks/${weekId}-intelligence.json`), `${JSON.stringify(output, null, 2)}\n`, "utf-8");

  console.log(`\nSaved data/intelligence.json with ${topItems.length} sourced items.`);
  console.log(`Icelandic share in top ${Math.min(TOP_COUNT, topItems.length)}: ${
    topItems.slice(0, TOP_COUNT).filter((item) => item.market_relevance === "Icelandic").length
  }/${Math.min(TOP_COUNT, topItems.length)}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
