const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const prisma = require('../db');
const { google } = require('googleapis');

// Google Sheets setup
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

async function appendToSheet(email, source) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:C',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[email, source || 'unknown', new Date().toISOString()]],
      },
    });
  } catch (err) {
    console.error('Google Sheets append error:', err.message);
    // Don't throw — DB save still succeeded
  }
}

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

      // Save to DB
      await prisma.newsletterSubscriber.upsert({
        where: { email },
        update: { isActive: true, source: source || 'unknown' },
        create: { email, source: source || 'unknown' },
      });

      // Save to Google Sheets (non-blocking)
      appendToSheet(email, source);

      res.json({ success: true, message: 'Subscribed successfully' });
    } catch (err) {
      console.error('Newsletter subscribe error:', err);
      res.status(500).json({ error: 'Failed to subscribe' });
    }
  }
);

module.exports = router;
