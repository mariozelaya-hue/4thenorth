const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const prisma = require('../db');

// POST /api/newsletter/subscribe
router.post('/subscribe',
  body('email').isEmail().normalizeEmail(),
  body('source').optional().isString().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    try {
      const { email, source } = req.body;

      // Upsert - reactivate if previously unsubscribed
      await prisma.newsletterSubscriber.upsert({
        where: { email },
        update: { isActive: true, source: source || 'unknown' },
        create: { email, source: source || 'unknown' },
      });

      res.json({ success: true, message: 'Subscribed successfully' });
    } catch (err) {
      console.error('Newsletter subscribe error:', err);
      res.status(500).json({ error: 'Failed to subscribe' });
    }
  }
);

module.exports = router;
