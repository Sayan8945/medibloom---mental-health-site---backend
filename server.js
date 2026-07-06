require('dotenv').config();

const express        = require('express');
const cors           = require('cors');
const helmet         = require('helmet');
const cookieParser   = require('cookie-parser');
const session        = require('express-session');
const { MongoStore }   = require('connect-mongo');
const rateLimit      = require('express-rate-limit');
const connectDB      = require('./config/db');
const passport       = require('./config/passport');
const authRoutes     = require('./routes/authRoutes');
const surveyRoutes   = require('./routes/surveyRoutes');

// ── Connect to MongoDB ─────────────────────────────────────────
connectDB();

const app = express();

// ── Security headers ───────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── CORS — must be before session/passport ─────────────────────
app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,                   // required for cookies/sessions
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting ──────────────────────────────────────────────
app.use('/api/auth/google', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many login attempts. Please try again later.' },
}));

// ── Body parsers ───────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Session (stored in MongoDB) ────────────────────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl:   process.env.MONGODB_URI,
    ttl:        7 * 24 * 60 * 60, // 7 days
    autoRemove: 'native',
  }),
  cookie: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
  },
  name: 'medibloom.sid',
}));

// ── Passport ───────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/auth',   authRoutes);
app.use('/api/survey', surveyRoutes);

// Legacy root route (kept for backwards compat)
app.get('/', (req, res) => res.json({ message: 'MediBloom API', version: '2.0' }));

// ── Global error handler ───────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Something went wrong. Please try again.'
      : err.message,
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`MediBloom server running on port ${PORT}`));
