# MediBloom — Backend API

Node.js + Express REST API with Google OAuth authentication, MongoDB persistence, and session management.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express 5 |
| Database | MongoDB via Mongoose |
| Authentication | Passport.js + Google OAuth 2.0 |
| Sessions | express-session + connect-mongo |
| Security | Helmet, CORS, express-rate-limit |
| Dev tooling | nodemon, dotenv |

---

## Project Structure

```
Backend/
├── config/
│   ├── db.js              # Mongoose connection
│   └── passport.js        # Google OAuth strategy, serialize/deserialize
├── controllers/
│   ├── authController.js      # getMe, getStatus, logout, updateSettings
│   ├── surveyController.js    # submitSurvey, getSurveyHistory, getSurveyById
│   ├── analyticsController.js # getTrends, getComparison, getSummary
│   └── chatController.js      # sendMessage (context-aware Gemini chat)
├── middleware/
│   └── isAuthenticated.js # Route guard — 401 if not logged in
├── models/
│   ├── User.js            # googleId, fullName, email, avatar, provider, verified, settings
│   └── SurveyResponse.js  # All 10 survey sections + userId ref
├── routes/
│   ├── authRoutes.js      # /api/auth/*
│   ├── surveyRoutes.js    # /api/survey/*
│   ├── analyticsRoutes.js # /api/analytics/*
│   └── chatRoutes.js      # /api/chat
├── services/
│   ├── wellnessContextService.js # Builds compact wellness summary from survey history
│   └── geminiService.js          # Gemini REST API client
├── utils/
│   ├── scoring.js            # computeScores() — canonical wellness scoring
│   └── chatPromptBuilder.js  # Builds the dynamic Gemini system prompt
├── .env                   # Environment variables (never commit this)
├── package.json
└── server.js              # App entry point
```

---

## Getting Started

### 1. Prerequisites

- Node.js ≥ 18
- MongoDB (local or [MongoDB Atlas](https://cloud.mongodb.com))
- A Google Cloud project with OAuth 2.0 credentials

### 2. Install dependencies

```bash
cd Backend
npm install
```

### 3. Configure environment variables

Create a `.env` file in the `Backend/` directory:

```env
MONGODB_URI=mongodb://localhost:27017/medibloom
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
SESSION_SECRET=a_long_random_secret_string
CLIENT_URL=http://localhost:5173
PORT=5000
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

> **Never commit `.env` to version control.** It is listed in `.gitignore`.

### 4. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add to **Authorized redirect URIs**: `http://localhost:5000/api/auth/google/callback`
4. Copy the Client ID and Secret into your `.env`

### 5. Run the server

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

Server starts on `http://localhost:5000`

---

## API Reference

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/google` | — | Initiates Google OAuth flow |
| GET | `/api/auth/google/callback` | — | OAuth callback — redirects to frontend |
| GET | `/api/auth/me` | — | Returns current user or `{ authenticated: false }` |
| GET | `/api/auth/status` | — | Returns `{ authenticated: true/false }` |
| POST | `/api/auth/logout` | ✓ | Destroys session and clears cookie |

### Survey

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/survey` | Optional | Submit a survey response (attaches userId if logged in) |
| GET | `/api/survey/history` | ✓ Required | Get authenticated user's past submissions |
| GET | `/api/survey/:id` | Optional | Fetch a single response by ID |

### Analytics

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/analytics/trends` | ✓ Required | Score trends over time (supports `?range=7d\|30d\|90d\|1y\|all`) |
| GET | `/api/analytics/comparison` | ✓ Required | Latest vs. previous assessment comparison |
| GET | `/api/analytics/summary` | ✓ Required | Current/best/average score, insights, achievement badges |

### Chat

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/chat` | Optional | Send a chat message to the Gemini-powered assistant. When the caller is signed in **and** has `settings.personalizedAI` enabled, the reply is personalized using a compact summary of their wellness history (scores + trends only — never raw survey answers or full chat history sent to Gemini). Guests and users with personalization disabled receive fully generic responses. |
| PATCH | `/api/auth/settings` | ✓ Required | Update `{ personalizedAI: boolean }` — controls whether the chatbot may use the user's wellness history. |

---

## Environment Variables Reference

| Variable | Description | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/medibloom` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | OAuth redirect URL | `http://localhost:5000/api/auth/google/callback` |
| `SESSION_SECRET` | Secret for signing session cookies | Long random string |
| `CLIENT_URL` | Frontend origin for CORS + OAuth redirect | `http://localhost:5173` |
| `PORT` | Port the server listens on | `5000` |
| `GEMINI_API_KEY` | Google Gemini API key — kept server-side only, never sent to the browser | From [Google AI Studio](https://aistudio.google.com) |
| `GEMINI_MODEL` | Gemini model name (optional, defaults to `gemini-2.5-flash`) | `gemini-2.5-flash` |

---

## Security Features

- **Helmet** — sets secure HTTP headers
- **CORS** — restricted to `CLIENT_URL` origin with credentials
- **Rate limiting** — `/api/auth/google` limited to 20 requests per 15 minutes; `/api/survey` limited to 30 per hour; `/api/chat` limited to 30 per 10 minutes (LLM calls cost money)
- **HTTPOnly cookies** — session cookie not accessible from JavaScript
- **SameSite cookies** — `lax` in development, `none` (with `secure`) in production
- **Session store** — sessions persisted in MongoDB, not memory
- **isAuthenticated middleware** — protects private routes with a 401 response

---

## Data Models

### User

```js
{
  googleId:   String,   // Google profile ID
  fullName:   String,   // Display name from Google
  email:      String,   // Unique, lowercase
  avatar:     String,   // Google profile photo URL
  provider:   String,   // "google"
  verified:   Boolean,
  settings: {
    personalizedAI: Boolean // default true — allows chatbot to use wellness history
  },
  createdAt:  Date,
  updatedAt:  Date
}
```

### SurveyResponse

```js
{
  userId:     ObjectId, // Ref → User (optional for anonymous)
  email:      String,
  fullName:   String,
  basicInfo:  Object,
  lifestyle:  Object,
  stress:     Object,
  emotional:  Object,
  anxiety:    Object,
  depression: Object,
  social:     Object,
  digital:    Object,
  coping:     Object,
  history:    Object,
  consent:    Boolean,
  submittedAt: Date
}
```
