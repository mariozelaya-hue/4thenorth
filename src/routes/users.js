const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const prisma = require('../db');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password || !username) return res.status(400).json({ error: 'All fields required' });
    const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
    if (existing) return res.status(409).json({ error: 'Email or username already taken' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, username, passwordHash } });
    req.session.userId = user.id;
    res.json({ success: true, user: { id: user.id, email: user.email, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.userId = user.id;
    res.json({ success: true, user: { id: user.id, email: user.email, username: user.username, avatarUrl: user.avatarUrl } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    if (!req.session.userId && !req.user) return res.status(401).json({ error: 'Not authenticated' });
    const userId = req.session.userId || req.user?.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ user: { id: user.id, email: user.email, username: user.username, avatarUrl: user.avatarUrl } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// GET /api/auth/me-full
router.get("/me-full", async (req, res) => {
  try {
    const userId = req.session?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json({ hasPassword: !!user.passwordHash, hasGoogle: !!user.googleId });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

// PUT /api/auth/update
router.put("/update", async (req, res) => {
  try {
    const userId = req.session?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: "User not found" });
    const { username, password, avatarColor } = req.body;
    const updates = {};
    if (username && username !== user.username) {
      const taken = await prisma.user.findUnique({ where: { username } });
      if (taken && taken.id !== user.id) return res.status(409).json({ error: "Username already taken" });
      updates.username = username;
    }
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      updates.passwordHash = await bcrypt.hash(password, 10);
    }
    if (avatarColor) updates.avatarUrl = avatarColor;
    if (Object.keys(updates).length === 0) return res.json({ user: { id: user.id, email: user.email, username: user.username, avatarUrl: user.avatarUrl } });
    const updated = await prisma.user.update({ where: { id: userId }, data: updates });
    req.session.userId = updated.id;
    res.json({ user: { id: updated.id, email: updated.email, username: updated.username, avatarUrl: updated.avatarUrl } });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Failed to update" });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
});

module.exports = router;
