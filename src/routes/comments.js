const express = require('express');
const router = express.Router();
const prisma = require('../db');


const auth = require('../middleware/auth');

router.get('/:storyId', async (req, res) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { storyId: req.params.storyId, parentId: null },
      include: {
        user: { select: { username: true } },
        replies: {
          include: { user: { select: { username: true } } },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

router.post('/:storyId', auth, async (req, res) => {
  try {
    const { body, parentId } = req.body;
    if (!body || body.trim().length === 0) return res.status(400).json({ error: 'Comment cannot be empty' });
    if (body.length > 1000) return res.status(400).json({ error: 'Comment too long' });
    const comment = await prisma.comment.create({
      data: { storyId: req.params.storyId, userId: req.user.id, body: body.trim(), parentId: parentId || null },
      include: { user: { select: { username: true } } }
    });
    res.json({ comment });
  } catch (err) {
    console.error('Comment error:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

router.delete('/:commentId', auth, async (req, res) => {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.userId !== req.user.id) return res.status(403).json({ error: 'Not your comment' });
    await prisma.comment.deleteMany({ where: { parentId: req.params.commentId } });
    await prisma.comment.delete({ where: { id: req.params.commentId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

module.exports = router;
