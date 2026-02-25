const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const auth = require('../middleware/auth');
const { scrapeUrl } = require('../services/scraper');
const { generateEditorial, DEFAULT_SYSTEM_PROMPT } = require('../services/ai');
const audit = require('../services/audit');

// =========================================================================
// AUTH (no middleware)
// =========================================================================

// GET /admin/login - login page
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// POST /admin/login - authenticate
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await prisma.adminUser.findUnique({ where: { username } });

    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return res.render('login', { error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    await audit.log('admin.login', admin.username);
    res.redirect('/admin');
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { error: 'Login failed. Try again.' });
  }
});

// GET /admin/logout
router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/admin/login');
});

// =========================================================================
// DASHBOARD (auth required)
// =========================================================================

// GET /admin - main dashboard
router.get('/', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [publishedToday, pendingCount, totalSubscribers, recentStories] = await Promise.all([
      prisma.story.count({ where: { status: 'published', publishedAt: { gte: today } } }),
      prisma.story.count({ where: { status: 'pending' } }),
      prisma.newsletterSubscriber.count({ where: { isActive: true } }),
      prisma.story.findMany({
        where: { status: { in: ['published', 'pending'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    res.render('dashboard', {
      admin: req.admin,
      stats: { publishedToday, pendingCount, totalSubscribers },
      stories: recentStories,
      tab: req.query.tab || 'all',
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).render('error', { message: 'Failed to load dashboard' });
  }
});

// =========================================================================
// STORY MANAGEMENT
// =========================================================================

// GET /admin/stories - filtered story list (JSON)
router.get('/stories', auth, async (req, res) => {
  try {
    const status = req.query.status;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;

    const where = {};
    if (status && status !== 'all') where.status = status;

    const stories = await prisma.story.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    res.json({ stories });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stories' });
  }
});

// POST /admin/stories/process - the core Phase 1 workflow
// Admin pastes URL → scrape → AI → return options
router.post('/stories/process', auth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    // 1. Check for duplicate
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(url).digest('hex');
    const existing = await prisma.story.findUnique({ where: { sourceHash: hash } });
    if (existing) {
      return res.status(409).json({ error: 'This story has already been added', storyId: existing.id });
    }

    // 2. Scrape metadata
    const metadata = await scrapeUrl(url);

    // 3. Call AI
    const aiResult = await generateEditorial(metadata.title, metadata.description, metadata.sourceName);

    // 4. Create story in pending state
    const story = await prisma.story.create({
      data: {
        originalTitle: metadata.title,
        originalDescription: metadata.description,
        sourceName: metadata.sourceName,
        sourceUrl: metadata.sourceUrl,
        imageUrl: metadata.imageUrl,
        sourceHash: metadata.sourceHash,
        editorialTag: aiResult.editorialTag,
        commentary: aiResult.commentary,
        aiConfidence: aiResult.confidence,
        aiAlternatives: aiResult.alternatives,
        category: aiResult.category,
        status: 'pending',
      },
    });

    await audit.log('story.processed', req.admin.username, {
      storyId: story.id,
      url,
      confidence: aiResult.confidence,
    });

    res.json({
      story,
      ai: {
        primary: {
          editorialTag: aiResult.editorialTag,
          commentary: aiResult.commentary,
          confidence: aiResult.confidence,
        },
        alternatives: aiResult.alternatives,
        category: aiResult.category,
        error: aiResult.error || null,
      },
    });
  } catch (err) {
    console.error('Process error:', err);
    res.status(500).json({ error: 'Failed to process story: ' + err.message });
  }
});

// POST /admin/stories/:id/regenerate - re-run AI
router.post('/stories/:id/regenerate', auth, async (req, res) => {
  try {
    const story = await prisma.story.findUnique({ where: { id: req.params.id } });
    if (!story) return res.status(404).json({ error: 'Story not found' });

    const aiResult = await generateEditorial(story.originalTitle, story.originalDescription, story.sourceName);

    await prisma.story.update({
      where: { id: story.id },
      data: {
        editorialTag: aiResult.editorialTag,
        commentary: aiResult.commentary,
        aiConfidence: aiResult.confidence,
        aiAlternatives: aiResult.alternatives,
        category: aiResult.category,
      },
    });

    await audit.log('story.regenerated', req.admin.username, { storyId: story.id });

    res.json({
      primary: {
        editorialTag: aiResult.editorialTag,
        commentary: aiResult.commentary,
        confidence: aiResult.confidence,
      },
      alternatives: aiResult.alternatives,
      category: aiResult.category,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to regenerate' });
  }
});

// PUT /admin/stories/:id - update story
router.put('/stories/:id', auth, async (req, res) => {
  try {
    const { editorialTag, commentary, category, status, isFeatured, isBreaking } = req.body;

    const data = {};
    if (editorialTag !== undefined) data.editorialTag = editorialTag;
    if (commentary !== undefined) data.commentary = commentary;
    if (category !== undefined) data.category = category;
    if (isFeatured !== undefined) data.isFeatured = isFeatured;
    if (isBreaking !== undefined) data.isBreaking = isBreaking;

    if (status === 'published') {
      data.status = 'published';
      data.publishedAt = new Date();
    } else if (status === 'rejected') {
      data.status = 'rejected';
    } else if (status === 'pending') {
      data.status = 'pending';
      data.publishedAt = null;
    }

    const story = await prisma.story.update({
      where: { id: req.params.id },
      data,
    });

    await audit.log(`story.${status || 'updated'}`, req.admin.username, { storyId: story.id });

    res.json({ story });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: 'Failed to update story' });
  }
});

// DELETE /admin/stories/:id - soft delete (reject)
router.delete('/stories/:id', auth, async (req, res) => {
  try {
    await prisma.story.update({
      where: { id: req.params.id },
      data: { status: 'rejected' },
    });
    await audit.log('story.rejected', req.admin.username, { storyId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete story' });
  }
});

// =========================================================================
// SETTINGS
// =========================================================================

// GET /admin/settings - settings page
router.get('/settings', auth, async (req, res) => {
  try {
    const promptSetting = await prisma.setting.findUnique({ where: { key: 'ai_prompt' } });
    res.render('settings', {
      admin: req.admin,
      aiPrompt: promptSetting?.value || DEFAULT_SYSTEM_PROMPT,
    });
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to load settings' });
  }
});

// POST /admin/settings/prompt - save AI prompt
router.post('/settings/prompt', auth, async (req, res) => {
  try {
    const { prompt } = req.body;
    await prisma.setting.upsert({
      where: { key: 'ai_prompt' },
      update: { value: prompt },
      create: { key: 'ai_prompt', value: prompt },
    });
    await audit.log('settings.prompt_updated', req.admin.username);
    res.redirect('/admin/settings?saved=1');
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to save settings' });
  }
});

// =========================================================================
// STATS API
// =========================================================================

router.get('/stats', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [published, pending, rejected, subscribers] = await Promise.all([
      prisma.story.count({ where: { status: 'published' } }),
      prisma.story.count({ where: { status: 'pending' } }),
      prisma.story.count({ where: { status: 'rejected' } }),
      prisma.newsletterSubscriber.count({ where: { isActive: true } }),
    ]);

    res.json({ published, pending, rejected, subscribers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /admin/logs
router.get('/logs', auth, async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: parseInt(req.query.limit) || 50,
    });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

module.exports = router;
