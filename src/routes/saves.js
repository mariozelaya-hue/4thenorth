const express = require('express');
const router = express.Router();
const prisma = require('../db');


const auth = require('../middleware/auth');

// POST /api/saves/:storyId - toggle save
router.post('/:storyId', auth, async (req, res) => {
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
router.get('/ids', auth, async (req, res) => {
  try {
    const saved = await prisma.savedStory.findMany({
      where: { userId: req.user.id },
      select: { storyId: true }
    });
    res.json({ storyIds: saved.map(s => s.storyId) });
  } catch(err) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.get('/', auth, async (req, res) => {
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
