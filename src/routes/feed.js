const express = require('express');
const router = express.Router();
const prisma = require('../db');
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
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'canadianpulse-secret-key';

router.post('/stories/:id/like', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Login required' });
    jwt.verify(token, JWT_SECRET);
    const { liked } = req.body;
    await prisma.story.update({
      where: { id: req.params.id },
      data: { likes: { increment: liked ? 1 : -1 } }
    });
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Failed' });
  }
});
