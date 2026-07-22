require('dotenv').config();

// ── Startup env validation ─────────────────────────────────────
const REQUIRED_ENV = [
  'MONGODB_URI',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',
  'SESSION_SECRET',
  'CLIENT_URL',
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[startup] Missing required env variables: ${missing.join(', ')}`);
  process.exit(1);
}

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const session      = require('express-session');
const { MongoStore } = require('connect-mongo');
const rateLimit    = require('express-rate-limit');
const connectDB    = require('./config/db');
const passport     = require('./config/passport');
const authRoutes      = require('./routes/authRoutes');
const surveyRoutes    = require('./routes/surveyRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const chatRoutes      = require('./routes/chatRoutes');
const recommendationsRoutes = require('./routes/recommendationsRoutes');
const moodRoutes      = require('./routes/moodRoutes');

const isProd = process.env.NODE_ENV === 'production';

// ── Connect to MongoDB ─────────────────────────────────────────
connectDB();

const app = express();

// ── Trust reverse proxy (Render, Railway, Heroku, etc.) ───────
// Required for session cookie `secure: true` to work behind HTTPS proxies
if (isProd) app.set('trust proxy', 1);

// ── Security headers ───────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // handled by frontend
}));

// ── CORS ───────────────────────────────────────────────────────
const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))  // strip trailing slash
  .filter(Boolean);

// Log on startup so you can verify Railway has the right value
console.log('[cors] Allowed origins:', allowedOrigins);

const corsOptions = {
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, curl, mobile)
    if (!origin) return cb(null, true);
    // Normalize incoming origin the same way (strip trailing slash)
    const normalizedOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(normalizedOrigin)) return cb(null, true);
    console.warn(`[cors] Blocked origin: "${origin}"`);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Answer preflight OPTIONS immediately, before session/passport can crash it
app.options(/.*/, cors(corsOptions));

// ── Rate limiting ──────────────────────────────────────────────
app.use('/api/auth/google', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
}));

app.use('/api/survey', rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many survey submissions. Please try again later.' },
}));

// Mood check-ins are lightweight and daily, but still cap create/update
// bursts (one real check-in per day is expected, this just guards abuse).
app.use('/api/mood', rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
}));

// LLM calls cost money — cap chat usage per IP regardless of auth state
app.use('/api/chat', rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages. Please wait a moment before trying again.' },
}));

// Recommendations also call Gemini — cap regeneration requests per IP
app.use('/api/recommendations', rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment before trying again.' },
}));

// ── Body parsers ───────────────────────────────────────────────
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true, limit: '512kb' }));
app.use(cookieParser());

// ── Session ────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl:   process.env.MONGODB_URI,
    ttl:        7 * 24 * 60 * 60,
    autoRemove: 'native',
  }),
  cookie: {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000,
  },
  name: 'medibloom.sid',
}));

// ── Passport ───────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/survey',    surveyRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/chat',      chatRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/mood',      moodRoutes);

app.get('/health', ((req,res) => res.json({ check: 'working correctly' }));
app.get('/', (_req, res) => res.json({ message: 'MediBloom API', version: '2.0' }));

// ── 404 handler ────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

// ── Global error handler ───────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (isProd) {
    console.error(`[error] ${err.status || 500} — ${err.message}`);
  } else {
    console.error(err.stack);
  }
  res.status(err.status || 500).json({
    error: isProd ? 'Something went wrong. Please try again.' : err.message,
  });
});

// ── Start server ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () =>
  console.log(`[server] Running on port ${PORT} (${process.env.NODE_ENV || 'development'})`)
);

// ── Graceful shutdown ──────────────────────────────────────────
const shutdown = (signal) => {
  console.log(`[server] ${signal} received — shutting down gracefully`);
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });
  // Force exit after 10s if connections hang
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
