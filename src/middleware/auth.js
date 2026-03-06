const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'canadianpulse-secret-key';

module.exports = async function auth(req, res, next) {
  // Try session first (Google OAuth / email login)
  if (req.session?.userId) {
    req.user = { id: req.session.userId };
    return next();
  }

  // Try passport user
  if (req.user) return next();

  // Try JWT from Authorization header
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      req.admin = req.user;
      return next();
    } catch(e) {}
  }

  // Try JWT from cookie (admin)
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    try {
      req.user = jwt.verify(cookieToken, JWT_SECRET);
      req.admin = req.user;
      return next();
    } catch(e) {}
  }

  return res.status(401).json({ error: 'Login required' });
};
