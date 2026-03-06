const express = require('express');
const router = express.Router();
const prisma = require('../db');
const auth = require('../middleware/auth');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 10 }); // 10 second cache

// GET /api/feed - paginated public feed
router.get('/feed', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const category = req.query.category || 'all';
    const sort = req.query.sort || 'latest';
    const skip = (page - 1) * limit;

    const cacheKey = `feed:${page}:${limit}:${category}:${sort}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const where = { status: 'published' };
    if (category !== 'all') {
      where.OR = [
        { category: category },
        { tags: { has: category } }
      ];
    }

    const orderBy = sort === 'score' 
      ? { viralScore: 'desc' } 
      : { publishedAt: 'desc' };

    const [stories, total] = await Promise.all([
      prisma.story.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          originalTitle: true,
          editorialTag: true,
          commentary: true,
          sourceName: true,
          sourceUrl: true,
          imageUrl: true,
          category: true,
          viralScore: true,
          likes: true,
          dislikes: true,
          publishedAt: true,
          isFeatured: true,
          isBreaking: true,
          cardStyle: true,
          tags: true,
          _count: { select: { comments: true } },
        },
      }),
      prisma.story.count({ where }),
    ]);

    const response = {
      stories,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + limit < total,
      },
    };

    cache.set(cacheKey, response);
    res.json(response);
  } catch (err) {
    console.error('Feed error:', err);
    res.status(500).json({ error: 'Failed to load feed' });
  }
});

// GET /api/stories/:id - single story
router.get('/stories/:id', async (req, res) => {
  try {
    const story = await prisma.story.findUnique({
      where: { id: req.params.id },
    });
    if (!story || story.status !== 'published') {
      return res.status(404).json({ error: 'Story not found' });
    }
    res.json(story);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load story' });
  }
});

module.exports = router;

// POST /api/stories/:id/like
router.post("/stories/:id/like", auth, async (req, res) => {
  try {
    const user = req.user;
    const existing = await prisma.storyLike.findUnique({
      where: { userId_storyId: { userId: user.id, storyId: req.params.id } }
    });
    if (existing) {
      await prisma.storyLike.delete({ where: { id: existing.id } });
      await prisma.story.update({ where: { id: req.params.id }, data: { likes: { decrement: 1 } } });
      res.json({ liked: false });
    } else {
      await prisma.storyLike.create({ data: { userId: user.id, storyId: req.params.id } });
      await prisma.story.update({ where: { id: req.params.id }, data: { likes: { increment: 1 } } });
      res.json({ liked: true });
    }
  } catch(e) {
    console.error("LIKE ERROR:", e.message, "userId:", req.user?.id, "storyId:", req.params.id); res.status(500).json({ error: "Failed" });
  }
});
router.get('/feed/search', async (req, res) => {
  try {
    const { search } = req.query;
    if (!search) return res.json({ stories: [] });
    const stories = await prisma.story.findMany({
      where: {
        status: 'published',
        OR: [
          { originalTitle: { contains: search, mode: 'insensitive' } },
          { commentary: { contains: search, mode: 'insensitive' } },
          { editorialTag: { contains: search, mode: 'insensitive' } },
          { sourceName: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
        ],
      },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: {
        id: true, originalTitle: true, editorialTag: true, commentary: true,
        sourceName: true, sourceUrl: true, imageUrl: true, category: true,
        viralScore: true, likes: true, dislikes: true, publishedAt: true,
        isFeatured: true, isBreaking: true, cardStyle: true, tags: true,
      },
    });
    res.json({ stories });
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/stories/:id/liked - check if user liked a story
router.get('/stories/:id/liked', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = req.session?.userId ? { id: req.session.userId } : null;
    if (!user && !token) return res.json({ liked: false });
    const userId = user?.id || (() => { try { const jwt = require('jsonwebtoken'); return jwt.verify(token, process.env.JWT_SECRET || 'canadianpulse-secret-key').id; } catch(e) { return null; } })();
    if (!userId) return res.json({ liked: false });
    const like = await prisma.storyLike.findUnique({
      where: { userId_storyId: { userId, storyId: req.params.id } }
    });
    return res.json({ liked: !!like });
  } catch(e) {
    return res.json({ liked: false });
  }
});


// GET /api/likes - get all liked story IDs for current user
router.get('/likes', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const userId = req.session?.userId || (() => { try { const jwt = require('jsonwebtoken'); return jwt.verify(token, process.env.JWT_SECRET || 'canadianpulse-secret-key').id; } catch(e) { return null; } })();
    if (!userId) return res.json({ storyIds: [] });
    const user = { id: userId };
    const likes = await prisma.storyLike.findMany({
      where: { userId: user.id },
      select: { storyId: true }
    });
    res.json({ storyIds: likes.map(l => l.storyId) });
  } catch(e) {
    res.json({ storyIds: [] });
  }
});
