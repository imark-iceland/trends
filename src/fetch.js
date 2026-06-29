/**
 * IMARK Intelligence - weekly editorial intelligence watcher.
 *
 * This is not a news dump. It gathers public source material, diagnoses every
 * source, scores items for Icelandic marketing relevance, and publishes only
 * the strongest sourced items.
 */

import Parser from "rss-parser";
import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DAYS_BACK = Number(process.env.IMARK_DAYS_BACK || 14);
const MIN_SCORE = Number(process.env.IMARK_MIN_SCORE || 35);
const MIN_ITEMS = Number(process.env.IMARK_MIN_ITEMS || 5);
const MAX_ITEMS = Number(process.env.IMARK_MAX_ITEMS || 12);
const TARGET_LOCAL_SHARE = 0.4;
const CUTOFF = Date.now() - DAYS_BACK * 86400000;
const UA = "IMARK-Intelligence/1.0 (+https://imark-iceland.github.io/trends/)";

const EDITORIAL_ITEMS_PATH = path.join(ROOT, "config/editorial-items.json");
const INTELLIGENCE_PATH = path.join(ROOT, "data/intelligence.json");
const DIAGNOSTICS_PATH = path.join(ROOT, "data/diagnostics.json");

const parser = new Parser({ timeout: 12000 });
const diagnostics = [];

const SOURCES = [
  { name: "Markaðsmál", url: "https://markadsmal.is/feed/", type: "rss", market: "Icelandic", focus: "icelandic-market", fallbackUrl: "https://markadsmal.is/" },
  { name: "Markaðsmál", url: "https://www.markadsmal.is/", type: "html", market: "Icelandic", focus: "icelandic-market" },
  { name: "VB", url: "https://vb.is/feed/", type: "rss", market: "Icelandic", focus: "icelandic-market", fallbackUrl: "https://vb.is/" },
  { name: "VB", url: "https://vb.is/", type: "html", market: "Icelandic", focus: "icelandic-market" },
  { name: "Mbl Viðskipti", url: "https://www.mbl.is/feeds/vidskipti/", type: "rss", market: "Icelandic", focus: "icelandic-market", fallbackUrl: "https://www.mbl.is/vidskipti/" },
  { name: "Vísir Viðskipti", url: "https://www.visir.is/rss/section/vidskipti", type: "rss", market: "Icelandic", focus: "icelandic-market", fallbackUrl: "https://www.visir.is/vidskipti" },

  { name: "Pipar/TBWA", url: "https://pipar-tbwa.is/", type: "html", market: "Icelandic", focus: "agency" },
  { name: "Brandenburg", url: "https://brandenburg.is/", type: "html", market: "Icelandic", focus: "agency" },
  { name: "Hvíta húsið", url: "https://www.hvitahusid.is/", type: "html", market: "Icelandic", focus: "agency" },
  { name: "Cirkus", url: "https://cirkus.is/", type: "html", market: "Icelandic", focus: "agency" },
  { name: "Kontor", url: "https://kontor.is/", type: "html", market: "Icelandic", focus: "agency" },
  { name: "Google News - íslenskar auglýsingastofur", url: "https://news.google.com/rss/search?q=(%22Pipar%2FTBWA%22%20OR%20%22Pipar%20TBWA%22%20OR%20Brandenburg%20OR%20%22Hv%C3%ADta%20h%C3%BAsi%C3%B0%22%20OR%20%22Hvita%20husid%22%20OR%20Cirkus%20OR%20Kontor)%20(herfer%C3%B0%20OR%20campaign%20OR%20case%20OR%20ver%C3%B0laun%20OR%20tilnefnd%20OR%20vann%20OR%20hlaut%20OR%20r%C3%A1%C3%B0in%20OR%20r%C3%A1%C3%B0inn)&hl=is&gl=IS&ceid=IS:is", type: "rss", market: "Icelandic", focus: "agency-search", requireAgencySignal: true },

  { name: "Icelandair", url: "https://www.icelandair.com/blog/", type: "html", market: "Icelandic", focus: "brand" },
  { name: "Nova", url: "https://www.nova.is/frettir", type: "html", market: "Icelandic", focus: "brand" },
  { name: "Síminn", url: "https://www.siminn.is/frettir", type: "html", market: "Icelandic", focus: "brand" },
  { name: "Krónan", url: "https://kronan.is/frettir", type: "html", market: "Icelandic", focus: "brand" },
  { name: "Arion banki", url: "https://www.arionbanki.is/bankinn/fjolmidlatorg/frettir/", type: "html", market: "Icelandic", focus: "brand" },
  { name: "Landsbankinn", url: "https://www.landsbankinn.is/frettir", type: "html", market: "Icelandic", focus: "brand" },
  { name: "Bláa lónið", url: "https://www.bluelagoon.com/news", type: "html", market: "Icelandic", focus: "brand" },
  { name: "Íslandsstofa", url: "https://www.islandsstofa.is/frettir", type: "html", market: "Icelandic", focus: "brand" },
  { name: "Sýn", url: "https://syn.is/frettir", type: "html", market: "Icelandic", focus: "brand" },

  { name: "Adweek", url: "https://www.adweek.com/feed/", type: "rss", market: "Global", focus: "global-marketing" },
  { name: "Campaign", url: "https://www.campaignlive.co.uk/rss", type: "rss", market: "Global", focus: "global-marketing" },
  { name: "Marketing Week", url: "https://www.marketingweek.com/feed/", type: "rss", market: "Global", focus: "global-marketing" },
  { name: "The Drum", url: "https://www.thedrum.com/rss/news", type: "rss", market: "Global", focus: "global-marketing" },
  { name: "Design Week", url: "https://www.designweek.co.uk/feed/", type: "rss", market: "Global", focus: "branding-design" },
  { name: "Creative Review", url: "https://www.creativereview.co.uk/feed/", type: "rss", market: "Global", focus: "creative-case" },
  { name: "Brandingmag", url: "https://www.brandingmag.com/feed/", type: "rss", market: "Global", focus: "branding-design" },
  { name: "Marketing Brew", url: "https://www.marketingbrew.com/feed.xml", type: "rss", market: "Global", focus: "global-marketing" },
  { name: "Nieman Lab", url: "https://www.niemanlab.org/feed/", type: "rss", market: "Global", focus: "media-platform" },
  { name: "OpenAI", url: "https://openai.com/blog/rss.xml", type: "rss", market: "Global", focus: "ai-platform" },
  { name: "Anthropic", url: "https://www.anthropic.com/news", type: "html", market: "Global", focus: "ai-platform" },
  { name: "Adobe", url: "https://blog.adobe.com/en/topics/creative-cloud", type: "html", market: "Global", focus: "ai-platform" },
  { name: "Canva", url: "https://www.canva.com/newsroom/news/", type: "html", market: "Global", focus: "ai-platform" },
  { name: "Google", url: "https://blog.google/technology/ai/rss/", type: "rss", market: "Global", focus: "ai-platform" },
  { name: "Meta", url: "https://about.fb.com/news/feed/", type: "rss", market: "Global", focus: "media-platform" },
];

const CATEGORY_RULES = [
  ["Ráðningar", ["hired", "appointed", "joins", "promotion", "chief marketing", "cmo", "director", "ráðinn", "ráðning", "tekur við", "nýr framkvæmdastjóri"]],
  ["Verðlaun og tilnefningar", ["award", "awards", "shortlist", "winner", "cannes", "effie", "tilnefnd", "verðlaun", "hlaut", "vann"]],
  ["Endurmörkun og ný vörumerki", ["rebrand", "brand identity", "new identity", "visual identity", "refresh", "endurmark", "nýtt merki", "ný ásýnd"]],
  ["Herferðir", ["campaign", "ad campaign", "launches", "work by", "advert", "case", "herferð", "auglýsing", "kynningarherferð", "markaðsherferð"]],
  ["AI og tækni", ["ai", "artificial intelligence", "generative", "chatgpt", "claude", "openai", "anthropic", "canva", "adobe", "automation", "gervigreind"]],
  ["Miðlar og platform", ["google", "meta", "linkedin", "instagram", "tiktok", "youtube", "search", "algorithm", "privacy", "cookies", "media", "platform"]],
  ["Neytendur og rannsóknir", ["consumer", "research", "survey", "study", "trend", "insight", "shopper", "audience", "neytend", "rannsókn", "könnun"]],
  ["Alþjóðlegt case", ["case study", "effectiveness", "brand growth", "lessons", "learned", "strategy", "how ", "why "]],
];

const AGENCY_SIGNALS = ["pipar", "tbwa", "pipar/tbwa", "brandenburg", "hvíta húsið", "hvita husid", "cirkus", "kontor"];
const ICELAND_SIGNALS = ["iceland", "íslensk", "íslenskur", "íslenskt", "ísland", "reykjavik", "reykjavík", "icelandair", "nova", "síminn", "siminn", "krónan", "kronan", "arion", "landsbankinn", "bláa lónið", "blue lagoon", "islandsstofa", "sýn", ...AGENCY_SIGNALS];
const LEARNING_SIGNALS = ["case", "strategy", "effectiveness", "growth", "research", "study", "trend", "insight", "measurement", "consumer", "creator", "retail media", "loyalty", "brand platform", "ai", "automation", "search", "privacy", "algorithm", "social", "media"];
const MARKETING_ROLE_SIGNALS = ["marketing", "markaðs", "markaðsstjóri", "cmo", "brand", "vörumerki", "communications", "samskipta", "samskiptastjóri", "pr", "almannatengsl", "creative", "agency", "auglýsing", "miðlun", "media", "content"];
const AI_MARKETING_SIGNALS = ["marketing", "markaðs", "brand", "vörumerki", "creative", "content", "advertising", "auglýsing", "media", "miðla", "search", "commerce", "customer", "consumer", "creator", "design", "workflow", "campaign", "personalization", "measurement", "analytics"];
const BLOCKED = ["stock market", "share price", "earnings call", "football", "basketball", "crime", "war ", "election", "weather", "crypto", "nft", "casino", "transfermarkt", "squad", "league", "match", "player", "verein", "lögregla", "slys", "veður", "kosning", "knattspyrna", "handbolti", "data center", "data centre", "google finance", "new investments and community support"];
const SITE_NOISE = ["logo", "merki", "tengili", "fyrir fjölmiðla", "þjónustutilkynningar", "status", "privacy", "cookie", "skilmalar", "terms", "gjaldskra", "laus störf", "störf í boði", "opnunart", "english", "newsletter", "subscribe", "youtube rás", "linkedin síða", "instagram síða", "tiktok síða", "facebook síða", "samfélagsmiðlar"];

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

function cleanText(value = "") {
  return decodeEntities(String(value))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalise(value = "") {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9áðéíóúýþæö\s/-]/gi, " ").replace(/\s+/g, " ").trim();
}

function containsKeyword(text, keyword) {
  const clean = normalise(text);
  const kw = normalise(keyword);
  if (!kw) return false;
  if (/^[a-z0-9áðéíóúýþæö/-]+$/i.test(kw)) return new RegExp(`(^|\\s)${kw}(\\s|$)`, "i").test(clean);
  return clean.includes(kw);
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => containsKeyword(text, keyword));
}

function getIsoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { weekId: `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`, label: `Vika ${week}, ${d.getUTCFullYear()}` };
}

function excerpt(text, max = 320) {
  const clean = cleanText(text);
  if (clean.length <= max) return clean;
  const cut = clean.lastIndexOf(" ", max);
  return `${clean.slice(0, cut > 100 ? cut : max)}...`;
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
    return String(url).trim();
  }
}

function titleSimilarity(a, b) {
  const aw = new Set(normalise(a).split(" ").filter((word) => word.length > 3));
  const bw = new Set(normalise(b).split(" ").filter((word) => word.length > 3));
  if (!aw.size || !bw.size) return 0;
  return [...aw].filter((word) => bw.has(word)).length / Math.max(aw.size, bw.size);
}

function diagnosticsType(source) {
  return source.type === "html" ? "html" : source.type;
}

function createDiagnostic(source) {
  return {
    name: source.name,
    url: source.url,
    type: diagnosticsType(source),
    market: source.market || "Manual",
    focus: source.focus || "",
    status: "skipped",
    httpStatus: null,
    itemsFound: 0,
    itemsAfterFilter: 0,
    itemsRejected: 0,
    rejectionReasons: {},
    errorMessage: "",
    lastChecked: new Date().toISOString(),
  };
}

function addRejection(diag, reason) {
  diag.itemsRejected += 1;
  diag.rejectionReasons[reason] = (diag.rejectionReasons[reason] || 0) + 1;
}

function finishDiagnostic(diag) {
  if (diag.status === "skipped") diag.status = "success";
  diagnostics.push(diag);
}

function detectCategory(title, summary) {
  const text = `${title} ${summary}`;
  for (const [category, keywords] of CATEGORY_RULES) {
    if (hasAny(text, keywords)) return category;
  }
  return "Markaðsfréttir";
}

function parseDateFromText(title) {
  const text = cleanText(title).toLowerCase();
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) return new Date(Date.UTC(Number(slash[3]), Number(slash[1]) - 1, Number(slash[2]), 12)).toISOString();

  const months = { januar: 0, janúar: 0, februar: 1, febrúar: 1, mars: 2, april: 3, apríl: 3, mai: 4, maí: 4, juni: 5, júní: 5, juli: 6, júlí: 6, agust: 7, ágúst: 7, september: 8, oktober: 9, október: 9, november: 10, desember: 11 };
  const monthNames = Object.keys(months).join("|");
  const named = text.match(new RegExp(`\\b(\\d{1,2})\\.\\s*(${monthNames})\\s+(20\\d{2})\\b`, "i"));
  if (named) return new Date(Date.UTC(Number(named[3]), months[named[2]], Number(named[1]), 12)).toISOString();
  return "";
}

function isBlocked(title, summary, url = "") {
  return hasAny(`${title} ${summary} ${url}`, BLOCKED);
}

function isNoiseLink(title, url) {
  const text = `${title} ${url}`;
  if (hasAny(text, SITE_NOISE)) return true;
  if (normalise(title).split(" ").length < 3) return true;
  return false;
}

function isIcelandic(item) {
  return item.market_relevance === "Icelandic" || hasAny(`${item.title} ${item.rawSummary} ${item.url}`, ICELAND_SIGNALS);
}

function isAgencyItem(item) {
  return item.focus === "agency" || item.focus === "agency-search" || hasAny(`${item.title} ${item.rawSummary} ${item.url}`, AGENCY_SIGNALS);
}

function scoreItem(item) {
  const text = `${item.title} ${item.rawSummary}`;
  const local = isIcelandic(item);
  const agency = isAgencyItem(item);
  const platformMarketingSignal = hasAny(text, ["advertising", "ads", "ad ", "marketing", "brand", "creator", "content", "social", "media", "search", "algorithm", "privacy", "cookies", "measurement", "instagram", "tiktok", "youtube", "linkedin", "reels", "influencer"]);

  let score = 0;
  let scoreReason = "Almenn frétt";

  if (local && item.category === "Herferðir") {
    score = 60;
    scoreReason = agency ? "Íslenskt agency case" : "Íslensk markaðsherferð";
  } else if (local && item.category === "Endurmörkun og ný vörumerki") {
    score = 60;
    scoreReason = "Íslensk endurmörkun";
  } else if (local && item.category === "Verðlaun og tilnefningar") {
    score = 55;
    scoreReason = "Íslensk verðlaun eða tilnefning";
  } else if (local && item.category === "Ráðningar") {
    score = 45;
    scoreReason = "Íslensk ráðning í markaðs- eða samskiptastarf";
  } else if (!local && item.category === "Alþjóðlegt case" && hasAny(text, LEARNING_SIGNALS)) {
    score = 45;
    scoreReason = "Alþjóðlegt case með sterkum lærdómi";
  } else if (item.category === "AI og tækni" && hasAny(text, AI_MARKETING_SIGNALS)) {
    score = 40;
    scoreReason = "AI sem getur breytt markaðsstarfi";
  } else if (item.category === "Miðlar og platform" && platformMarketingSignal) {
    score = 40;
    scoreReason = "Mikilvæg breyting á miðli eða platformi";
  } else if (item.category === "Neytendur og rannsóknir") {
    score = 35;
    scoreReason = "Rannsókn eða neytendatrend";
  } else if (!local && hasAny(text, LEARNING_SIGNALS) && hasAny(text, ["brand", "campaign", "creative", "media", "consumer", "retail", "strategy"])) {
    score = 35;
    scoreReason = "Alþjóðleg þróun með nothæfum lærdómi";
  } else if (!local) {
    score = 5;
    scoreReason = "Almenn erlend markaðsfrétt";
  }

  const age = Date.now() - new Date(item.date || Date.now()).getTime();
  if (Number.isFinite(age) && age > 0) score += Math.max(0, 4 - age / 86400000);
  if (agency) score += 8;
  if (local) score += 4;
  if (item.editorial) score += 100;

  return { score: Math.round(score), scoreReason };
}

function summaryIs(item) {
  const sourceText = item.rawSummary && item.rawSummary !== item.title ? item.rawSummary : "";
  const base = sourceText ? excerpt(sourceText, 260) : `${item.source} birtir atriði sem tengist ${item.category.toLowerCase()}.`;
  if (item.market_relevance === "Icelandic") return `${base} Atriðið er tekið með vegna þess að það tengist íslenskum markaði, íslensku vörumerki eða íslenskri stofu.`;
  return `${base} Atriðið er tekið með vegna þess að það sýnir þróun sem íslensk markaðsteymi geta lært af eða þurfa að fylgjast með.`;
}

function whyItMattersIs(item) {
  const source = item.source;
  const title = item.title;
  const local = item.market_relevance === "Icelandic";

  if (item.category === "Herferðir") return local
    ? `Þetta skiptir máli vegna þess að ${source} sýnir hvernig herferð eða skapandi vinna er að birtast á íslenskum markaði. Íslensk fyrirtæki geta skoðað hvaða innsýn, rásir og skilaboð eru notuð og borið saman við eigin markhópa.`
    : `Lærdómurinn fyrir íslensk teymi er að skoða hvernig ${source} rammar inn hugmynd, miðlanotkun og árangur. Ef nálgunin er yfirfæranleg getur hún hjálpað við að skerpa brief, channel planning eða skapandi framkvæmd hér heima.`;
  if (item.category === "Endurmörkun og ný vörumerki") return local
    ? "Endurmörkun á íslenskum markaði getur haft bein áhrif á samkeppni, væntingar neytenda og hvernig flokkurinn talar um virði. Markaðsfólk getur lært af því hvaða stöðu vörumerkið er að taka og hvaða merki um breytingu eru sýnileg."
    : "Fyrir íslensk vörumerki er lærdómurinn að skoða hvernig staðfærsla, auðkenni og upplifun vinna saman. Slík dæmi hjálpa teymum að forðast yfirborðslega ásýndarbreytingu og tengja endurmörkun við stefnu.";
  if (item.category === "Verðlaun og tilnefningar") return local
    ? "Íslenskur árangur eða tilnefning skiptir máli vegna þess að hann sýnir hvaða vinnubrögð standast samanburð utan heimamarkaðar. Fyrirtæki geta lært af því hvaða hugmynd, árangur eða framkvæmd var metin nógu sterk til að vekja athygli."
    : "Verðlaunaumræða er aðeins tekin með þegar hún bendir á vinnubrögð sem hægt er að læra af. Hér er gagnlegt að spyrja hvað gerði verkefnið eftirtektarvert og hvort sömu prinsipp eigi við í smærri íslenskum markaði.";
  if (item.category === "Ráðningar") return "Ráðningar í markaðs- og samskiptastörf gefa vísbendingu um hvaða hæfni fyrirtæki telja mikilvæga næst. Fyrir íslensk teymi er þetta merki um hvort áherslan sé að færast í gögn, vörumerkjastefnu, samskipti, vöxt eða stafræna upplifun.";
  if (item.category === "AI og tækni") return "Þetta skiptir máli ef tæknin breytir hraða, kostnaði eða gæðum í efnisgerð, greiningu, leitarhegðun eða þjónustuupplifun. Íslensk fyrirtæki ættu að spyrja hvar þetta getur bætt vinnuferli án þess að veikja traust eða sérstöðu vörumerkisins.";
  if (item.category === "Miðlar og platform") return "Breytingar á miðlum og platformum geta haft bein áhrif á dreifingu, mælingar, kostnað og sýnileika. Íslensk markaðsteymi þurfa að meta hvort þetta kalli á breytingar í miðlaplani, efnisgerð eða gagnasöfnun.";
  if (item.category === "Neytendur og rannsóknir") return "Rannsóknir og neytendatrend eru gagnleg þegar þau hjálpa teymum að endurmeta forsendur um kauphegðun, traust eða athygli. Lærdómurinn er að bera innsýnina saman við íslenskan veruleika áður en hún er sett í stefnu eða herferð.";
  return `Atriðið er valið vegna þess að það getur haft áhrif á hvernig íslensk fyrirtæki hugsa um markaðsstarf, vörumerki eða miðlun. Lærdómurinn er að skoða hvort þróunin í "${title}" breyti forsendum fyrir eigin stefnu, skilaboð eða framkvæmd.`;
}

function evaluateCandidate(source, entry) {
  if (!entry.title || !entry.url) return { item: null, reason: "missing-title-or-url" };
  const dateMs = new Date(entry.date || 0).getTime();
  if (source.type === "rss" && (!dateMs || dateMs < CUTOFF)) return { item: null, reason: "no-new-articles-in-window" };
  if (source.type === "html" && dateMs && dateMs < CUTOFF) return { item: null, reason: "no-new-articles-in-window" };
  if (isBlocked(entry.title, entry.rawSummary, entry.url)) return { item: null, reason: "blocked-keyword-or-topic" };

  const category = detectCategory(entry.title, entry.rawSummary);
  const base = {
    title: cleanText(entry.title),
    source: entry.sourceName || source.name,
    url: entry.url.trim(),
    date: new Date(entry.date || Date.now()).toISOString(),
    category,
    rawSummary: entry.rawSummary,
    market_relevance: source.market,
    focus: source.focus,
    editorial: source.type === "manual",
  };

  if (source.requireAgencySignal && !hasAny(`${base.title} ${base.rawSummary} ${base.url}`, AGENCY_SIGNALS)) return { item: null, reason: "agency-signal-missing" };
  if (category === "Ráðningar" && !hasAny(`${base.title} ${base.rawSummary}`, MARKETING_ROLE_SIGNALS)) return { item: null, reason: "hiring-not-marketing-or-communications" };
  if (category === "AI og tækni" && !hasAny(`${base.title} ${base.rawSummary}`, AI_MARKETING_SIGNALS)) return { item: null, reason: "ai-not-marketing-related" };
  if (category === "Markaðsfréttir" && !hasAny(`${base.title} ${base.rawSummary}`, [...LEARNING_SIGNALS, ...ICELAND_SIGNALS])) return { item: null, reason: "weak-market-relevance" };

  const { score, scoreReason } = scoreItem(base);
  if (score < MIN_SCORE) return { item: null, reason: "score-below-threshold" };

  return {
    item: {
      ...base,
      score,
      score_reason: scoreReason,
      summary_is: summaryIs(base),
      why_it_matters_is: whyItMattersIs(base),
    },
    reason: null,
  };
}

async function loadEditorialItems() {
  const source = { name: "Manual editorial items", url: "config/editorial-items.json", type: "manual", market: "Icelandic", focus: "editorial" };
  const diag = createDiagnostic(source);
  try {
    const raw = await fs.readFile(EDITORIAL_ITEMS_PATH, "utf-8");
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) throw new Error("manual file is not an array");
    diag.itemsFound = rows.length;
    const items = [];
    for (const row of rows) {
      if (row.enabled === false) {
        addRejection(diag, "manual-item-disabled");
        continue;
      }
      const result = evaluateCandidate({ ...source, market: row.market_relevance || "Icelandic" }, {
        title: row.title,
        url: row.url,
        date: row.date || new Date().toISOString(),
        rawSummary: row.summary_is || row.summary || "",
        sourceName: row.source,
      });
      if (result.item) {
        result.item.score = Number(row.score || result.item.score + 100);
        result.item.score_reason = row.score_reason || "Handvalið ritstjórnaratriði";
        if (row.summary_is) result.item.summary_is = row.summary_is;
        if (row.why_it_matters_is) result.item.why_it_matters_is = row.why_it_matters_is;
        items.push(result.item);
      } else {
        addRejection(diag, result.reason);
      }
    }
    diag.status = "success";
    diag.itemsAfterFilter = items.length;
    finishDiagnostic(diag);
    return items;
  } catch (error) {
    diag.status = "failed";
    diag.errorMessage = error.message;
    finishDiagnostic(diag);
    return [];
  }
}

async function fetchRSS(source) {
  const diag = createDiagnostic(source);
  try {
    const response = await fetch(source.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
    diag.httpStatus = response.status;
    if (!response.ok) throw new Error(`RSS URL responded HTTP ${response.status}`);
    const xml = await response.text();
    const feed = await parser.parseString(xml);
    diag.itemsFound = feed.items.length;
    const items = [];
    for (const entry of feed.items) {
      const result = evaluateCandidate(source, {
        title: cleanText(entry.title),
        url: cleanText(entry.link),
        date: entry.isoDate || entry.pubDate || entry.date || new Date().toISOString(),
        rawSummary: excerpt(entry.contentSnippet || entry.summary || entry.content || "", 320),
        sourceName: cleanText(entry.source?.title || entry.source || source.name),
      });
      if (result.item) items.push(result.item);
      else addRejection(diag, result.reason);
    }
    diag.status = "success";
    diag.itemsAfterFilter = items.length;
    finishDiagnostic(diag);
    console.log(`OK  ${source.name.padEnd(34)} ${items.length}/${diag.itemsFound}`);
    return items;
  } catch (error) {
    diag.status = "failed";
    diag.errorMessage = error.message;
    if (source.market === "Icelandic" && source.fallbackUrl) {
      diag.errorMessage = `${error.message}; attempted HTML fallback ${source.fallbackUrl}`;
      try {
        const fallback = await fetchHTML({ ...source, type: "html", url: source.fallbackUrl, fallbackOf: source.url }, diag);
        finishDiagnostic(diag);
        return fallback;
      } catch {
        // fetchHTML already recorded the failure in the shared diagnostic.
      }
    }
    finishDiagnostic(diag);
    console.warn(`--  ${source.name.padEnd(34)} ${diag.errorMessage.slice(0, 90)}`);
    return [];
  }
}

async function fetchHTML(source, existingDiagnostic = null) {
  const diag = existingDiagnostic || createDiagnostic(source);
  try {
    const response = await fetch(source.url, {
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(12000),
    });
    diag.httpStatus = response.status;
    if (!response.ok) throw new Error(`HTML URL responded HTTP ${response.status}`);
    const html = await response.text();
    const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(([, href, label]) => ({ url: absoluteUrl(href, source.url), title: cleanText(label) }))
      .filter((link) => link.url && link.title.length >= 12)
      .filter((link) => !link.url.includes("#") && !/\.(pdf|jpg|jpeg|png|gif|svg)$/i.test(link.url));
    diag.itemsFound = links.length;
    if (!links.length && /<script|__NEXT_DATA__|window\.__/i.test(html)) {
      diag.errorMessage = "HTML fetched, but no article links matched; page may rely on JavaScript or unsupported selectors.";
    }

    const seen = new Set();
    const items = [];
    const linksToProcess = links.slice(0, 80);
    const skippedByLimit = Math.max(0, links.length - linksToProcess.length);
    if (skippedByLimit) {
      diag.itemsRejected += skippedByLimit;
      diag.rejectionReasons["source-item-limit"] = skippedByLimit;
    }
    for (const link of linksToProcess) {
      const key = linkKey(link.url);
      if (seen.has(key)) {
        addRejection(diag, "duplicate-url");
        continue;
      }
      seen.add(key);
      if (isNoiseLink(link.title, link.url)) {
        addRejection(diag, "navigation-or-non-article-link");
        continue;
      }
      const result = evaluateCandidate(source, {
        ...link,
        date: parseDateFromText(link.title),
        rawSummary: "",
      });
      if (result.item) items.push(result.item);
      else addRejection(diag, result.reason);
      if (items.length >= 10) break;
    }
    diag.status = "success";
    diag.itemsAfterFilter = items.length;
    if (!existingDiagnostic) finishDiagnostic(diag);
    console.log(`OK  ${source.name.padEnd(34)} ${items.length}/${diag.itemsFound}`);
    return items;
  } catch (error) {
    diag.status = "failed";
    diag.errorMessage = diag.errorMessage ? `${diag.errorMessage}; ${error.message}` : error.message;
    if (!existingDiagnostic) finishDiagnostic(diag);
    console.warn(`--  ${source.name.padEnd(34)} ${diag.errorMessage.slice(0, 90)}`);
    return [];
  }
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
  const localTarget = Math.min(local.length, Math.ceil(MAX_ITEMS * TARGET_LOCAL_SHARE));
  const selected = [];
  const add = (item) => {
    if (selected.length >= MAX_ITEMS) return;
    if (!selected.some((existing) => linkKey(existing.url) === linkKey(item.url))) selected.push(item);
  };
  local.slice(0, localTarget).forEach(add);
  [...local.slice(localTarget), ...global].sort((a, b) => b.score - a.score).forEach(add);
  return selected
    .slice(0, MAX_ITEMS)
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({
      title: item.title,
      source: item.source,
      url: item.url,
      date: item.date,
      category: item.category,
      summary_is: item.summary_is,
      why_it_matters_is: item.why_it_matters_is,
      market_relevance: item.market_relevance,
      score: item.score,
      score_reason: item.score_reason,
      priority: index + 1,
    }));
}

async function writeDiagnostics(topItems) {
  const icelandicSourceDiagnostics = diagnostics.filter((diag) => {
    const source = SOURCES.find((item) => item.name === diag.name && item.url === diag.url);
    return source?.market === "Icelandic" || diag.name === "Manual editorial items";
  });
  const workingIcelandicSources = icelandicSourceDiagnostics.filter((diag) => diag.status === "success" && diag.itemsFound > 0).length;
  const icelandicItemsFound = topItems.filter((item) => item.market_relevance === "Icelandic").length;
  const output = {
    generatedAt: new Date().toISOString(),
    noIcelandicItems: icelandicItemsFound === 0,
    summary: {
      totalSources: diagnostics.length,
      totalSourcesSuccessful: diagnostics.filter((diag) => diag.status === "success").length,
      icelandicSources: icelandicSourceDiagnostics.length,
      icelandicSourcesWorking: workingIcelandicSources,
      icelandicItemsSelected: icelandicItemsFound,
    },
    sources: diagnostics,
  };
  await fs.mkdir(path.dirname(DIAGNOSTICS_PATH), { recursive: true });
  await fs.writeFile(DIAGNOSTICS_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
  return output;
}

async function main() {
  console.log("IMARK Intelligence - weekly watch\n");
  const [manualItems, batches] = await Promise.all([
    loadEditorialItems(),
    Promise.all(SOURCES.map((source) => source.type === "rss" ? fetchRSS(source) : fetchHTML(source))),
  ]);

  const topItems = selectItems([...manualItems, ...batches.flat()]);
  const diagnosticsOutput = await writeDiagnostics(topItems);
  const localCount = diagnosticsOutput.summary.icelandicItemsSelected;

  if (localCount === 0) {
    console.warn("WARNING: Engin íslensk atriði fundust í þessari keyrslu — athuga þarf íslensku heimildirnar.");
  }

  if (topItems.length < MIN_ITEMS) {
    console.error(`Only ${topItems.length} strong intelligence items found. Existing intelligence.json was not overwritten.`);
    process.exit(1);
  }

  const { weekId, label } = getIsoWeek();
  const output = {
    week: label,
    updatedAt: new Date().toISOString(),
    topItems,
  };

  await fs.mkdir(path.join(ROOT, "data/weeks"), { recursive: true });
  await fs.writeFile(INTELLIGENCE_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
  await fs.writeFile(path.join(ROOT, `data/weeks/${weekId}-intelligence.json`), `${JSON.stringify(output, null, 2)}\n`, "utf-8");

  console.log(`\nSources read: ${diagnosticsOutput.summary.totalSources}`);
  console.log(`Icelandic sources working: ${diagnosticsOutput.summary.icelandicSourcesWorking}/${diagnosticsOutput.summary.icelandicSources}`);
  console.log(`Icelandic items selected: ${localCount}`);
  console.log(`Saved data/intelligence.json and data/diagnostics.json.`);
}

main().catch(async (error) => {
  console.error("Fatal:", error);
  await writeDiagnostics([]);
  process.exit(1);
});
