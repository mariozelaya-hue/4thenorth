# 4TheNorth

Canadian news aggregation platform with AI-powered editorial voice.

**Phase 1**: Admin pastes a URL → AI generates editorial tag + commentary → Admin approves → Story goes live.

## Quick Start (Local Development)

### Prerequisites
- **Node.js 18+** — [Download](https://nodejs.org/)
- **PostgreSQL** — [Download](https://www.postgresql.org/download/) or use [Supabase](https://supabase.com/) free tier

### 1. Install dependencies
```bash
cd 4thenorth
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Edit `.env` with your values:
- `DATABASE_URL` — your PostgreSQL connection string
- `ANTHROPIC_API_KEY` — get one at [console.anthropic.com](https://console.anthropic.com/)
- `JWT_SECRET` — run `openssl rand -hex 32` to generate
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — your admin login

### 3. Set up database
```bash
npx prisma generate
npx prisma db push
node scripts/seed-admin.js
```

### 4. Run
```bash
npm run dev
```

Open **http://localhost:3000/admin** and log in.

## How to Use

1. **Log in** at `/admin`
2. **Paste any article URL** in the "Add Story" field
3. **Click "Process with AI"** — waits ~3 seconds while Claude generates 3 editorial options
4. **Pick an option** (or edit the tag/commentary manually)
5. **Click "Publish Now"** — story is immediately live in the feed

The public feed API is at `GET /api/feed?page=1&limit=20`.

## Deploy to Railway (Recommended)

### 1. Create Railway project
- Go to [railway.app](https://railway.app/) and sign up
- Click "New Project" → "Deploy from GitHub"
- Connect your repo (or use "Deploy from Template" → "Empty Project")

### 2. Add PostgreSQL
- In your Railway project, click "New" → "Database" → "PostgreSQL"
- Railway auto-generates `DATABASE_URL`

### 3. Set environment variables
In Railway dashboard → your service → Variables:
```
DATABASE_URL          → (auto-set by Railway PostgreSQL)
ANTHROPIC_API_KEY     → sk-ant-your-key
JWT_SECRET            → (run: openssl rand -hex 32)
ADMIN_USERNAME        → admin
ADMIN_PASSWORD        → your-secure-password
NODE_ENV              → production
FRONTEND_URL          → https://your-domain.com
```

### 4. Deploy
Railway auto-deploys on push. The `railway.toml` handles Prisma setup automatically.

### 5. Seed admin
In Railway → your service → click "Shell" (or connect via Railway CLI):
```bash
node scripts/seed-admin.js
```

## Project Structure

```
4thenorth/
├── prisma/
│   └── schema.prisma          # Database schema
├── scripts/
│   └── seed-admin.js          # Create admin user
├── src/
│   ├── server.js              # Express app entry point
│   ├── db.js                  # Prisma client singleton
│   ├── middleware/
│   │   └── auth.js            # JWT authentication
│   ├── routes/
│   │   ├── admin.js           # Admin dashboard + API
│   │   ├── feed.js            # Public feed API
│   │   └── newsletter.js      # Newsletter signup
│   ├── services/
│   │   ├── ai.js              # Claude API integration
│   │   ├── audit.js           # Audit logging
│   │   └── scraper.js         # URL metadata scraper
│   ├── views/
│   │   ├── dashboard.ejs      # Main admin dashboard
│   │   ├── login.ejs          # Login page
│   │   ├── settings.ejs       # AI prompt settings
│   │   └── error.ejs          # Error page
│   └── public/
│       ├── css/admin.css      # Dashboard styles
│       └── js/admin.js        # Dashboard interactivity
├── .env.example               # Environment template
├── package.json
├── Procfile                   # Railway process
├── railway.toml               # Railway config
└── README.md
```

## API Endpoints

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/feed?page=1&limit=20&category=all` | Paginated feed |
| GET | `/api/stories/:id` | Single story |
| POST | `/api/newsletter/subscribe` | Subscribe email |
| GET | `/api/health` | Health check |

### Admin (requires login)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/stories/process` | Process URL with AI |
| PUT | `/admin/stories/:id` | Update/publish/reject story |
| POST | `/admin/stories/:id/regenerate` | Re-run AI |
| GET | `/admin/stats` | Dashboard stats |

## Cost

Phase 1 runs at **~$20–35/month**:
- Railway: $5–10/mo
- Claude API (30–50 stories/day): $15–25/mo
- Everything else: free tier
