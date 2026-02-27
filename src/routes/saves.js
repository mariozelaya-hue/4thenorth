const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const prisma = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'canadianpulse-secret-key';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// POST /api/saves/:storyId - toggle save
router.post('/:storyId', authMiddleware, async (req, res) => {
  try {
    const existing = await prisma.savedStory.findUnique({
      where: { userId_storyId: { userId: req.user.id, storyId: req.params.storyId } }
    });
    if (existing) {
      await prisma.savedStory.delete({ where: { id: existing.id } });
      res.json({ saved: false });
    } else {
      await prisma.savedStory.create({ data: { userId: req.user.id, storyId: req.params.storyId } });
      res.json({ saved: true });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/saves - get all saved stories for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const saved = await prisma.savedStory.findMany({
      where: { userId: req.user.id },
      include: {
        story: {
          select: {
            id: true, originalTitle: true, commentary: true, sourceName: true,
            sourceUrl: true, imageUrl: true, category: true, viralScore: true,
            likes: true, dislikes: true, publishedAt: true, isFeatured: true,
            isBreaking: true, cardStyle: true, tags: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ stories: saved.map(s => s.story) });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
