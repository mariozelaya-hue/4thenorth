const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'canadianpulse-secret-key';

module.exports = function adminAuth(req, res, next) {
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    try {
      req.admin = jwt.verify(cookieToken, JWT_SECRET);
      req.user = req.admin;
      return next();
    } catch(e) {}
  }
  // If it's an API request return JSON, otherwise redirect to login
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Login required' });
  }
  return res.redirect('/admin/login');
};
