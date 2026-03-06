require('dotenv').config();
const session = require('express-session');
const cookieParser = require('cookie-parser');
const passport = require('./config/passport');
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
const userRoutes = require('./routes/users');
const commentRoutes = require('./routes/comments');
const savesRoutes = require('./routes/saves');
const trendsRoutes = require('./routes/trends');
const monitorRoutes = require('./routes/monitor');
const cron = require('node-cron');
const { runMonitor } = require('./services/monitor');
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
app.use(session({
  secret: process.env.SESSION_SECRET || 'canadianpulse_dev_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(morgan('short'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
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
app.use('/api/comments', commentRoutes);
app.use('/api/saves', savesRoutes);
app.use('/api/trends', trendsRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/monitor', monitorRoutes);
app.use('/auth', authRoutes);
app.use('/api/auth', userRoutes);

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

// Legal pages
app.get("/terms", (req, res) => res.render("terms"));
app.get("/privacy", (req, res) => res.render("privacy"));

// Reset password page
app.get("/reset-password", (req, res) => {
  res.render("reset-password");
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Run monitor every 4 hours
cron.schedule('0 */4 * * *', () => {
  console.log('[Cron] Running scheduled monitor...');
  runMonitor().catch(err => console.error('[Cron] Monitor error:', err));
});

app.listen(PORT, () => {
  console.log(`4TheNorth server running on port ${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
  console.log(`API feed: http://localhost:${PORT}/api/feed`);
});
