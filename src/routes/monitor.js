const express = require('express');
const router = express.Router();
const prisma = require('../db');
const auth = require('../middleware/adminAuth');
const { runMonitor } = require('../services/monitor');

// GET /admin/monitor - monitor dashboard page
router.get('/', auth, async (req, res) => {
  try {
    const [topics, recentCache, stats] = await Promise.all([
      prisma.monitorTopic.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.monitorCache.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.monitorCache.aggregate({
        _count: { id: true },
        where: { analyzed: true },
      }),
    ]);
    const promoted = await prisma.monitorCache.count({ where: { promoted: true } });
    res.render('monitor', { topics, recentCache, stats, promoted, admin: req.admin });
  } catch (err) {
    console.error('Monitor page error:', err);
    res.status(500).render('error', { message: 'Failed to load monitor' });
  }
});

// POST /admin/monitor/run - manually trigger a run
router.post('/run', auth, async (req, res) => {
  try {
    const result = await runMonitor();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Monitor run error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/monitor/topics - add a topic
router.post('/topics', auth, async (req, res) => {
  try {
    const { keyword } = req.body;
    if (!keyword || !keyword.trim()) return res.status(400).json({ error: 'Keyword required' });
    const topic = await prisma.monitorTopic.create({
      data: { keyword: keyword.trim() },
    });
    res.json({ success: true, topic });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add topic' });
  }
});

// DELETE /admin/monitor/topics/:id - remove a topic
router.delete('/topics/:id', auth, async (req, res) => {
  try {
    await prisma.monitorTopic.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete topic' });
  }
});

// PATCH /admin/monitor/topics/:id - toggle active
router.patch('/topics/:id', auth, async (req, res) => {
  try {
    const topic = await prisma.monitorTopic.findUnique({ where: { id: req.params.id } });
    const updated = await prisma.monitorTopic.update({
      where: { id: req.params.id },
      data: { isActive: !topic.isActive },
    });
    res.json({ success: true, topic: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle topic' });
  }
});

// DELETE /admin/monitor/cache - clear expired cache
router.delete('/cache', auth, async (req, res) => {
  try {
    const result = await prisma.monitorCache.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    res.json({ success: true, deleted: result.count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});


// GET /admin/monitor/articles - search and paginate articles
router.get("/articles", auth, async (req, res) => {
  try {
    const { search, limit = 50, page = 1, from, to } = req.query;
    const take = Math.min(parseInt(limit) || 50, 200);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;
    const conditions = [];
    if (search) {
      conditions.push({ OR: [
        { title: { contains: search, mode: "insensitive" } },
        { sourceName: { contains: search, mode: "insensitive" } },
        { aiCategory: { contains: search, mode: "insensitive" } },
        { aiCommentary: { contains: search, mode: "insensitive" } },
      ] });
    }
    if (from) conditions.push({ createdAt: { gte: new Date(from) } });
    if (to) conditions.push({ createdAt: { lte: new Date(to + "T23:59:59Z") } });
    const where = conditions.length ? { AND: conditions } : {};
    const [articles, total] = await Promise.all([
      prisma.monitorCache.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
      prisma.monitorCache.count({ where })
    ]);
    res.json({ articles, total, page: parseInt(page) || 1, limit: take, pages: Math.ceil(total / take) });
  } catch (e) {
    console.error("Articles search error:", e);
    res.status(500).json({ error: "Failed" });
  }
});
module.exports = router;

// GET /admin/monitor/sources - list all sources
router.get('/sources', auth, async (req, res) => {
  try {
    const sources = await prisma.monitorSource.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, sources });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load sources' });
  }
});

// PATCH /admin/monitor/sources/:id - toggle active
router.patch('/sources/:id', auth, async (req, res) => {
  try {
    const source = await prisma.monitorSource.findUnique({ where: { id: req.params.id } });
    const updated = await prisma.monitorSource.update({
      where: { id: req.params.id },
      data: { isActive: !source.isActive },
    });
    res.json({ success: true, source: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle source' });
  }
});

// POST /admin/monitor/sources - add a new source
router.post('/sources', auth, async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Name and URL required' });
    const source = await prisma.monitorSource.create({ data: { name, url } });
    res.json({ success: true, source });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add source' });
  }
});

// DELETE /admin/monitor/sources/:id - remove a source
router.delete('/sources/:id', auth, async (req, res) => {
  try {
    await prisma.monitorSource.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete source' });
  }
});
