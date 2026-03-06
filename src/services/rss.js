const Parser = require('rss-parser');
const prisma = require('../db');

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'CanadianPulse/1.0 RSS Reader' },
  customFields: { item: [['media:content', 'media:content'], ['media:thumbnail', 'media:thumbnail'], 'enclosure'] }
});

// Fetch a single RSS feed, return array of items
async function fetchFeed(source) {
  try {
    const feed = await parser.parseURL(source.url);
    return feed.items.map(item => {
      const mediaContent = item['media:content'];
      const mediaThumbnail = item['media:thumbnail'];
      const imageUrl =
        (Array.isArray(mediaContent) ? mediaContent[0]?.$ : mediaContent?.$)?.url ||
        (Array.isArray(mediaThumbnail) ? mediaThumbnail[0]?.$ : mediaThumbnail?.$)?.url ||
        item.enclosure?.url ||
        (() => { const m = (item['content:encoded'] || item.content || '').match(/<img[^>]+src=["']([^"']+)["']/i); return m?.[1] || null; })() ||
        null;
      return {
        title: item.title || '',
        url: item.link || item.guid || '',
        sourceName: source.name,
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        summary: item.contentSnippet || item.content || item.summary || '',
        imageUrl: imageUrl && imageUrl.startsWith('http') ? imageUrl : null,
      };
    }).filter(item => item.url && item.title);
  } catch (err) {
    console.error(`RSS fetch failed for ${source.name}: ${err.message}`);
    return [];
  }
}

// Fetch all active sources from DB, then fetch feeds in parallel
async function fetchAllFeeds() {
  const sources = await prisma.monitorSource.findMany({ where: { isActive: true } });
  const results = await Promise.allSettled(sources.map(fetchFeed));
  const articles = [];
  results.forEach(result => {
    if (result.status === 'fulfilled') articles.push(...result.value);
  });
  console.log(`[RSS] Fetched ${articles.length} articles from ${sources.length} active sources`);
  return articles;
}

module.exports = { fetchAllFeeds };
