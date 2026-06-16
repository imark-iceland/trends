/**
 * ÍMARK Trends – Weekly Fetch Script
 * Fetches RSS feeds, scores relevance, deduplicates, generates AI summaries,
 * and saves weekly JSON archives.
 *
 * Run: node src/fetch.js
 * Env: ANTHROPIC_API_KEY required
 */

import Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";
import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const config = JSON.parse(
  await fs.readFile(path.join(ROOT, "config/sources.json"), "utf-8")
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const parser = new Parser({
  customFields: { item: ["media:content", "enclosure"] },
  timeout: 10000,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function getWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normaliseText(str) {
  return str?.toLowerCase().replace(/[^a-záðéíóúýþæö\s]/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function titleSimilarity(a, b) {
  const wa = new Set(normaliseText(a).split(" ").filter((w) => w.length > 3));
  const wb = new Set(normaliseText(b).split(" ").filter((w) => w.length > 3));
  if (!wa.size || !wb.size) return 0;
  const intersection = [...wa].filter((w) => wb.has(w)).length;
  return intersection / Math.max(wa.size, wb.size);
}

function scoreRelevance(item, source) {
  const text = normaliseText(`${item.title} ${item.contentSnippet ?? ""}`);
  let score = source.weight ?? 1.0;

  for (const kw of config.relevanceKeywords.high) {
    if (text.includes(kw.toLowerCase())) score += 0.3;
  }
  for (const kw of config.relevanceKeywords.medium) {
    if (text.includes(kw.toLowerCase())) score += 0.1;
  }

  // Recency boost — newer is slightly better within the week
  const ageHours = (Date.now() - new Date(item.isoDate ?? item.pubDate).getTime()) / 3600000;
  score += Math.max(0, (168 - ageHours) / 168) * 0.5;

  // Blocked keyword penalty
  for (const kw of config.blockedKeywords) {
    if (text.includes(kw.toLowerCase())) score = 0;
  }

  return score;
}

function isDomainBlocked(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return config.blockedDomains.includes(host);
  } catch {
    return true;
  }
}

function detectTags(title, snippet) {
  const text = `${title} ${snippet}`.toLowerCase();
  const tagMap = {
    AI: ["ai", "artificial intelligence", "generative", "llm", "gpt", "machine learning", "claude", "openai", "gemini"],
    Branding: ["brand", "branding", "identity", "positioning", "logo"],
    Miðlar: ["media", "platform", "streaming", "publishing", "newsletter", "podcast"],
    PR: ["pr", "public relations", "reputation", "crisis", "communications", "press"],
    Sköpun: ["creative", "design", "campaign", "copy", "visual", "art direction"],
    Stefna: ["strategy", "strategic", "growth", "transformation", "leadership"],
    Neytendur: ["consumer", "audience", "behaviour", "customer", "loyalty", "trust"],
    Auglýsingar: ["advertising", "ads", "programmatic", "media buy", "paid", "display", "cpc", "cpm"],
    Social: ["social media", "instagram", "tiktok", "linkedin", "youtube", "x.com", "twitter", "facebook"],
  };

  return Object.entries(tagMap)
    .filter(([, keywords]) => keywords.some((k) => text.includes(k)))
    .map(([tag]) => tag);
}

// ─── Fetch feeds ────────────────────────────────────────────────────────────

async function fetchSource(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const cutoff = Date.now() - config.settings.fetchDaysBack * 86400000;

    return feed.items
      .filter((item) => {
        const pub = new Date(item.isoDate ?? item.pubDate ?? 0).getTime();
        return pub > cutoff && item.link && !isDomainBlocked(item.link);
      })
      .map((item) => ({
        title: item.title?.trim(),
        link: item.link,
        source: source.name,
        category: source.category,
        language: source.language,
        pubDate: item.isoDate ?? item.pubDate,
        snippet: item.contentSnippet?.slice(0, 400) ?? "",
        score: scoreRelevance(item, source),
        tags: detectTags(item.title ?? "", item.contentSnippet ?? ""),
      }));
  } catch (err) {
    console.warn(`⚠️  ${source.name}: ${err.message}`);
    return [];
  }
}

// ─── Deduplication ──────────────────────────────────────────────────────────

function deduplicate(items) {
  const kept = [];
  for (const item of items) {
    const duplicate = kept.some(
      (k) => titleSimilarity(k.title, item.title) >= config.settings.deduplicationThreshold
    );
    if (!duplicate) kept.push(item);
  }
  return kept;
}

// ─── AI enrichment ──────────────────────────────────────────────────────────

async function enrichItem(item) {
  const summaryLang = item.language === "is" ? "Icelandic" : "English";
  const prompt = `You are an editor at ÍMARK, the Icelandic marketing industry association. Your audience is marketing professionals, brand managers, media people, PR consultants and agency leaders in Iceland.

Article title: "${item.title}"
Source: ${item.source}
Source language: ${summaryLang}
Snippet: ${item.snippet}

Rules:
- Never change or translate the article title — it must stay exactly as published.
- Never invent or infer facts not present in the snippet above.
- Only summarise what is actually stated in the snippet.

Write a JSON object with exactly these two keys:
- "summary": 2–3 sentences written in ${summaryLang} (same language as the source). Factual, concise, no hype. Only include information present in the snippet.
- "insight": 1–2 sentences in Icelandic only. Explain why this specific development matters for marketing professionals in Iceland. Be direct and slightly opinionated. Do not repeat the summary.

Respond with only the raw JSON object. No markdown, no code fences, no extra text.`;

  try {
    const msg = await anthropic.messages.create({
      model: config.settings.ai.model,
      max_tokens: config.settings.ai.summaryMaxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    const json = JSON.parse(msg.content[0].text);
    return { ...item, summary: json.summary, insight: json.insight };
  } catch (err) {
    console.warn(`⚠️  AI enrichment failed for "${item.title}": ${err.message}`);
    return { ...item, summary: item.snippet, insight: "" };
  }
}

// ─── Editor's note ──────────────────────────────────────────────────────────

async function generateEditorsNote(items) {
  const headlines = items.map((i, n) => `${n + 1}. ${i.title} (${i.source})`).join("\n");

  const prompt = `You are the editor of ÍMARK's weekly marketing intelligence digest for Icelandic marketing professionals, agencies and brand managers.

This week's selected stories:
${headlines}

Write a short editor's note in Icelandic as 4–5 bullet points (using – as bullet). Each bullet should name a key signal or trend from this week's content. Be sharp, slightly opinionated, and useful. No fluff. Think: what would a senior marketing strategist say are the real takeaways this week?

Respond with only the bullet points, one per line, starting each with –`;

  try {
    const msg = await anthropic.messages.create({
      model: config.settings.ai.model,
      max_tokens: config.settings.ai.editorNoteMaxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content[0].text.trim();
  } catch (err) {
    console.warn(`⚠️  Editor's note failed: ${err.message}`);
    return "– Ekki tókst að búa til ritstjóranótu þessa viku.";
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 ÍMARK Trends – Weekly Fetch\n");

  // 1. Fetch all sources in parallel
  console.log(`Fetching ${config.sources.length} sources…`);
  const results = await Promise.all(config.sources.map(fetchSource));
  let allItems = results.flat();
  console.log(`  → ${allItems.length} raw items found`);

  // 2. Sort by score, deduplicate
  allItems.sort((a, b) => b.score - a.score);
  allItems = deduplicate(allItems);
  console.log(`  → ${allItems.length} items after deduplication`);

  // 3. Take top N
  const topItems = allItems.slice(0, config.settings.maxItemsPerWeek);
  console.log(`  → ${topItems.length} items selected for this week`);

  if (topItems.length < config.settings.minItemsPerWeek) {
    console.warn(`⚠️  Only ${topItems.length} items – less than minimum ${config.settings.minItemsPerWeek}`);
  }

  // 4. Enrich with AI summaries (sequentially to avoid rate limits)
  console.log("\nGenerating AI summaries…");
  const enriched = [];
  for (const [i, item] of topItems.entries()) {
    process.stdout.write(`  [${i + 1}/${topItems.length}] ${item.title?.slice(0, 60)}…\r`);
    enriched.push(await enrichItem(item));
  }
  console.log("\n  → Summaries done");

  // 5. Editor's note
  console.log("\nGenerating editor's note…");
  const editorsNote = await generateEditorsNote(enriched);

  // 6. Build output object
  const weekId = getWeekId();
  const output = {
    weekId,
    generatedAt: new Date().toISOString(),
    editorsNote,
    items: enriched,
    disclaimer:
      "Yfirlit unnið með aðstoð gervigreindar. Tenglar vísa á upprunalegar heimildir.",
  };

  // 7. Save
  const weeksDir = path.join(ROOT, "data/weeks");
  await fs.mkdir(weeksDir, { recursive: true });
  await fs.mkdir(path.join(ROOT, "public"), { recursive: true });

  const weekFile = path.join(weeksDir, `${weekId}.json`);
  const latestFile = path.join(ROOT, "data/latest.json");

  await fs.writeFile(weekFile, JSON.stringify(output, null, 2), "utf-8");
  await fs.writeFile(latestFile, JSON.stringify(output, null, 2), "utf-8");

  console.log(`\n✅ Saved: data/weeks/${weekId}.json`);
  console.log("✅ Saved: data/latest.json");
  console.log("\nRun `npm run generate` to build the dashboard HTML.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
