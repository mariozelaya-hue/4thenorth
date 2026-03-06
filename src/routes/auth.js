const express = require('express');
const router = express.Router();
const passport = require('passport');

// GET /auth/google - initiate Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// GET /auth/google/callback - Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/?error=auth_failed' }),
  (req, res) => {
    // Sync passport user to session
    if (req.user) req.session.userId = req.user.id;
    res.redirect('/');
  }
);

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.redirect('/');
  });
});

module.exports = router;
