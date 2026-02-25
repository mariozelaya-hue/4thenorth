const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  // Check for token in cookie, Authorization header, or query param
  let token = req.cookies?.token 
    || req.headers.authorization?.replace('Bearer ', '')
    || req.query.token;

  // Also check session cookie set during login
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, c) => {
      const [key, val] = c.trim().split('=');
      acc[key] = val;
      return acc;
    }, {});
    token = cookies.token;
  }

  if (!token) {
    // If it's a page request (not API), redirect to login
    if (req.accepts('html')) {
      return res.redirect('/admin/login');
    }
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    if (req.accepts('html')) {
      return res.redirect('/admin/login');
    }
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
