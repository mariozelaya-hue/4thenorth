const crypto = require('crypto');
const prisma = require('../db');
const { fetchAllFeeds } = require('./rss');
const Anthropic = require('@anthropic-ai/sdk');
const fetch = require('node-fetch');

const client = new Anthropic();


// Fetch og:image from article URL as fallback
async function fetchOgImage(url) {
  try {
    const res = await fetch(url, { timeout: 5000, headers: { 'User-Agent': 'CanadianPulse/1.0' } });
    const html = await res.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? m[1] : null;
  } catch { return null; }
}

// How long to cache articles before re-fetching (48 hours)
const CACHE_TTL_HOURS = 48;

// Minimum score (1-10) to auto-promote to pending stories
const PROMOTE_THRESHOLD = 7;

// Hash a URL for deduplication
function hashUrl(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

// Check if article matches any active topic keyword
function matchesTopics(article, topics) {
  if (!topics.length) return true; // if no topics set, accept all
  const text = (article.title + ' ' + article.summary).toLowerCase();
  return topics.some(t => text.includes(t.keyword.toLowerCase()));
}

// Trim text to avoid large token usage
function trimText(text, maxChars = 800) {
  if (!text) return '';
  return text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
}

// Analyze a batch of up to 30 articles
async function analyzeBatch(batch) {
  const numbered = batch.map((a, i) =>
    `[${i}] Title: ${a.title}\nSource: ${a.sourceName}\nSummary: ${trimText(a.summary)}`
  ).join('\n\n');

  const prompt = `You are an editor for CanadianPulse, a Canadian political news aggregator.

Analyze each article below and return ONLY a JSON array, no other text.
Each element must have: score (1-10), category, editorialTag, commentary.

Categories: Federal, Provincial, Economy, U.S. Politics, Healthcare, Climate & Energy, News, Opinion
score: 1-10 (10 = maximum shock/engagement for Canadian political audience)
editorialTag: 2-4 word punchy tag
commentary: one sentence, max 120 chars

Articles:
${numbered}

Return ONLY a JSON array with ${batch.length} objects in the same order.`;

  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return batch.map((a, i) => ({ ...a, ...(parsed[i] || {}), analyzed: true }));
  } catch (err) {
    console.error(`[Monitor] Batch AI analysis failed: ${err.message}`);
    return batch.map(a => ({ ...a, score: 0, analyzed: true }));
  }
}

// Split into batches of 30 and analyze each
async function analyzeArticles(articles) {
  const batchSize = 30;
  const results = [];
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    console.log(`[Monitor] Analyzing batch ${Math.floor(i/batchSize)+1}/${Math.ceil(articles.length/batchSize)} (${batch.length} articles)...`);
    const analyzed = await analyzeBatch(batch);
    results.push(...analyzed);
  }
  return results;
}

// Main monitor run
async function runMonitor() {
  console.log('[Monitor] Starting run...');

  // 1. Load active topics
  const topics = await prisma.monitorTopic.findMany({ where: { isActive: true } });
  console.log(`[Monitor] ${topics.length} active topics`);

  // 2. Fetch all RSS feeds
  const articles = await fetchAllFeeds();

  // 3. Filter by topics
  const relevant = articles.filter(a => matchesTopics(a, topics));
  console.log(`[Monitor] ${relevant.length} relevant articles after topic filter`);

  // 4. Deduplicate against cache
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000);
  const newArticles = [];

  for (const article of relevant) {
    const urlHash = hashUrl(article.url);
    const existing = await prisma.monitorCache.findUnique({ where: { urlHash } });
    if (!existing) {
      newArticles.push({ ...article, urlHash, expiresAt });
    }
  }
  console.log(`[Monitor] ${newArticles.length} new articles to analyze`);

  if (newArticles.length === 0) {
    console.log('[Monitor] Nothing new. Done.');
    return { analyzed: 0, promoted: 0 };
  }

  // 5. Analyze with Claude
  const analyzed = await analyzeArticles(newArticles);

  // 5b. Fetch og:images in parallel for articles missing images
  console.log('[Monitor] Fetching og:images...');
  await Promise.all(analyzed.map(async (article) => {
    if (!article.imageUrl) {
      article.imageUrl = await fetchOgImage(article.url);
    }
  }));

  // 6. Save to cache + promote high scorers
  let promoted = 0;
  for (const article of analyzed) {
    // Save to monitor cache
    const cached = await prisma.monitorCache.upsert({
      where: { urlHash: article.urlHash },
      update: {
        aiScore: article.score || 0,
        aiCategory: article.category || null,
        aiCommentary: article.commentary || null,
        aiTag: article.editorialTag || null,
        analyzed: true,
      },
      create: {
        urlHash: article.urlHash,
        url: article.url,
        title: article.title,
        sourceName: article.sourceName,
        publishedAt: article.publishedAt,
        rawText: trimText(article.summary, 2000),
        aiScore: article.score || 0,
        aiCategory: article.category || null,
        aiCommentary: article.commentary || null,
        aiTag: article.editorialTag || null,
        analyzed: true,
        promoted: false,
        expiresAt: article.expiresAt,
      },
    });

    // Auto-promote high scoring articles to story pipeline
    if ((article.score || 0) >= PROMOTE_THRESHOLD) {
      try {
        const sourceHash = hashUrl(article.url + '-monitor');
        await prisma.story.create({
          data: {
            originalTitle: article.title,
            originalDescription: article.summary || '',
            sourceName: article.sourceName,
            sourceUrl: article.url,
            imageUrl: article.imageUrl || null,
            editorialTag: article.editorialTag || null,
            commentary: article.commentary || null,
            category: article.category || null,
            status: 'pending',
            sourceHash,
            viralScore: parseFloat((article.score || 5).toFixed(1)),
            isBreaking: (article.score || 0) >= 9,
            isFeatured: (article.score || 0) >= 8,
            publishedAt: article.publishedAt || new Date(),
          },
        });
        await prisma.monitorCache.update({
          where: { id: cached.id },
          data: { promoted: true },
        });
        promoted++;
        console.log(`[Monitor] Promoted: "${article.title}" (score: ${article.score})`);
      } catch (err) {
        // Duplicate story hash — already exists, skip
      }
    }
  }

  console.log(`[Monitor] Done. Analyzed: ${analyzed.length}, Promoted: ${promoted}`);
  return { analyzed: analyzed.length, promoted };
}

module.exports = { runMonitor };
