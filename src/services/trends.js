const prisma = require('../db');

// Cache: refresh every 60 minutes
let cache = { data: [], timestamp: 0 };
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getCanadianTrends() {
  const now = Date.now();

  // Return cache if still fresh
  if (cache.data.length > 0 && (now - cache.timestamp) < CACHE_TTL) {
    return cache.data;
  }

  try {
    const since = new Date(now - 7 * 24 * 60 * 60 * 1000); // last 7 days

    const stories = await prisma.story.findMany({
      where: {
        status: 'published',
        publishedAt: { gte: since },
      },
      select: {
        id: true,
        originalTitle: true,
        likes: true,
        dislikes: true,
        views: true,
        viralScore: true,
        publishedAt: true,
        sourceUrl: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });

    if (stories.length === 0) {
      cache = { data: [], timestamp: now };
      return [];
    }

    // Get comment counts for all stories in one query
    const commentCounts = await prisma.comment.groupBy({
      by: ['storyId'],
      where: { storyId: { in: stories.map(s => s.id) } },
      _count: { id: true },
    });
    const commentMap = {};
    commentCounts.forEach(c => { commentMap[c.storyId] = c._count.id; });

    // Normalize maximums for scoring
    const maxViews    = Math.max(...stories.map(s => s.views || 0), 1);
    const maxLikes    = Math.max(...stories.map(s => s.likes || 0), 1);
    const maxComments = Math.max(...Object.values(commentMap), 1);
    const maxViral    = Math.max(...stories.map(s => parseFloat(s.viralScore || 0)), 1);
    const ageRange    = 7 * 24 * 60 * 60 * 1000;

    const scored = stories.map(s => {
      const viewScore    = (s.views || 0) / maxViews;
      const likeScore    = (s.likes || 0) / maxLikes;
      const commentScore = (commentMap[s.id] || 0) / maxComments;
      const viralScore   = parseFloat(s.viralScore || 0) / maxViral;
      const age          = now - new Date(s.publishedAt).getTime();
      const recencyScore = Math.max(0, 1 - age / ageRange);

      const trendScore = (
        viewScore    * 0.20 +
        likeScore    * 0.25 +
        commentScore * 0.30 +
        viralScore   * 0.15 +
        recencyScore * 0.10
      );

      const totalEngagement = (s.views || 0) + (s.likes || 0) * 3 + (commentMap[s.id] || 0) * 5;
      const traffic = totalEngagement > 10000 ? '10K+ engaging'
        : totalEngagement > 5000  ? '5K+ engaging'
        : totalEngagement > 1000  ? '1K+ engaging'
        : totalEngagement > 500   ? '500+ engaging'
        : totalEngagement > 100   ? '100+ engaging'
        : 'Rising';

      return { title: s.originalTitle, traffic, url: s.sourceUrl || '#', score: trendScore };
    });

    const trends = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ title, traffic, url }) => ({ title, traffic, url }));

    cache = { data: trends, timestamp: now };
    return trends;

  } catch (err) {
    console.error('Trends algorithm error:', err.message);
    return cache.data;
  }
}

module.exports = { getCanadianTrends };
