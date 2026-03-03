require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

const feedRoutes = require('./routes/feed');
const adminRoutes = require('./routes/admin');
const newsletterRoutes = require('./routes/newsletter');
const authRoutes = require('./routes/auth');
const commentRoutes = require('./routes/comments');
const savesRoutes = require('./routes/saves');
const trendsRoutes = require('./routes/trends');
const prisma = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (Railway/Cloudflare)
app.set('trust proxy', 1);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('short'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', generalLimiter);

// Routes
app.use('/api', feedRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/saves', savesRoutes);
app.use('/api/trends', trendsRoutes);
app.use('/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Home - public frontend
app.get('/', async (req, res) => {
  try {
    const pinnedStory = await prisma.story.findFirst({
      where: { isPinned: true, status: 'published' },
    });
    res.render('index', { pinnedStory: pinnedStory || null });
  } catch (err) {
    console.error('Home route error:', err);
    res.render('index', { pinnedStory: null });
  }
});

// Reset password page
app.get("/reset-password", (req, res) => {
  res.render("reset-password");
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`4TheNorth server running on port ${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
  console.log(`API feed: http://localhost:${PORT}/api/feed`);
});
