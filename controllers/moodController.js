const MoodEntry = require('../models/MoodEntry');
const {
  startOfDay,
  validateMoodPayload,
  trendDirection,
  computeStreaks,
} = require('../utils/moodUtils');

// ── POST /api/mood ───────────────────────────────────────────────
// Create today's check-in. Fails with 409 if one already exists — the
// client should call PUT /api/mood/:id (via GET /api/mood/today) to edit.
const createMoodEntry = async (req, res) => {
  try {
    const { valid, errors, data } = validateMoodPayload(req.body);
    if (!valid) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const today = startOfDay(new Date());

    const existing = await MoodEntry.findOne({ userId: req.user._id, date: today }).lean();
    if (existing) {
      return res.status(409).json({
        error: "You've already checked in today. Edit today's entry instead.",
        entryId: existing._id,
      });
    }

    const entry = await MoodEntry.create({
      userId: req.user._id,
      date: today,
      ...data,
    });

    return res.status(201).json({ success: true, entry });
  } catch (err) {
    // Race condition safety net — the unique index may reject a duplicate
    // that slipped past the findOne check under concurrent requests.
    if (err.code === 11000) {
      return res.status(409).json({ error: "You've already checked in today." });
    }
    console.error('[mood] Create error:', err.message);
    return res.status(500).json({ error: 'Failed to save your check-in.' });
  }
};

// ── GET /api/mood/today ──────────────────────────────────────────
const getTodayEntry = async (req, res) => {
  try {
    const today = startOfDay(new Date());
    const entry = await MoodEntry.findOne({ userId: req.user._id, date: today }).lean();
    return res.json({ success: true, entry: entry || null, completed: !!entry });
  } catch (err) {
    console.error('[mood] Today fetch error:', err.message);
    return res.status(500).json({ error: "Failed to fetch today's check-in." });
  }
};

// ── GET /api/mood/history ─────────────────────────────────────────
// Paginated, newest-first. ?page=1&limit=20
const getMoodHistory = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip  = (page - 1) * limit;

    const query = { userId: req.user._id };

    const [entries, total] = await Promise.all([
      MoodEntry.find(query).sort({ date: -1 }).skip(skip).limit(limit).lean(),
      MoodEntry.countDocuments(query),
    ]);

    return res.json({
      success: true,
      entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasMore: skip + entries.length < total,
      },
    });
  } catch (err) {
    console.error('[mood] History error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch check-in history.' });
  }
};

// ── PUT /api/mood/:id ──────────────────────────────────────────────
// Edit an existing entry. Only today's entry is editable, and only the
// owner may edit it — ownership + "today only" are both enforced here.
const updateMoodEntry = async (req, res) => {
  try {
    const entry = await MoodEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Check-in not found.' });

    if (entry.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const today = startOfDay(new Date());
    if (entry.date.getTime() !== today.getTime()) {
      return res.status(403).json({ error: 'Only today\u2019s check-in can be edited.' });
    }

    const { valid, errors, data } = validateMoodPayload(req.body);
    if (!valid) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    entry.mood = data.mood;
    entry.energyLevel = data.energyLevel;
    entry.stressLevel = data.stressLevel;
    entry.sleepQuality = data.sleepQuality;
    entry.notes = data.notes;
    await entry.save();

    return res.json({ success: true, entry });
  } catch (err) {
    console.error('[mood] Update error:', err.message);
    return res.status(500).json({ error: 'Failed to update your check-in.' });
  }
};

// ── Rule-based AI insights ─────────────────────────────────────────
// Chronological (oldest -> newest) list of scored entries in.
function generateMoodInsights(entries) {
  const insights = [];
  if (entries.length < 3) return insights;

  const stressValues = entries.map((e) => e.stressLevel);
  const sleepValues   = entries.map((e) => e.sleepQuality);
  const energyValues  = entries.map((e) => e.energyLevel);
  const moodValues    = entries.map((e) => e.mood);

  const stressTrend = trendDirection(stressValues);
  if (stressTrend === 'increasing') {
    insights.push({ type: 'warning', icon: 'trending-up', text: 'Your stress has increased over the last week.' });
  } else if (stressTrend === 'decreasing') {
    insights.push({ type: 'positive', icon: 'trending-down', text: 'Your stress has decreased recently — great progress.' });
  }

  const sleepTrend = trendDirection(sleepValues);
  const last30 = entries.slice(-30);
  const first30 = entries.slice(0, Math.max(1, entries.length - 30));
  const sleepMonthDelta = last30.length && first30.length
    ? (last30.reduce((a, e) => a + e.sleepQuality, 0) / last30.length) -
      (first30.reduce((a, e) => a + e.sleepQuality, 0) / first30.length)
    : 0;
  if (entries.length >= 14 && sleepMonthDelta >= 1) {
    insights.push({ type: 'positive', icon: 'moon', text: 'Sleep quality improved compared to last month.' });
  } else if (sleepTrend === 'decreasing') {
    insights.push({ type: 'warning', icon: 'moon', text: 'Your sleep quality has been declining recently.' });
  }

  const energyTrend = trendDirection(energyValues);
  const avgRecentEnergy = energyValues.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, energyValues.length);
  if (energyTrend === 'stable' && avgRecentEnergy >= 7) {
    insights.push({ type: 'positive', icon: 'sparkles', text: 'Energy levels have been consistently high.' });
  } else if (energyTrend === 'decreasing') {
    insights.push({ type: 'warning', icon: 'trending-down', text: 'Your energy levels have been dipping lately.' });
  }

  const moodTrend = trendDirection(moodValues, 0.5);
  if (moodTrend === 'stable') {
    insights.push({ type: 'positive', icon: 'shield', text: 'Mood appears stable recently.' });
  } else if (moodTrend === 'decreasing') {
    insights.push({ type: 'warning', icon: 'alert', text: 'Your mood has been trending lower recently. Be gentle with yourself.' });
  } else if (moodTrend === 'increasing') {
    insights.push({ type: 'positive', icon: 'trending-up', text: 'Your mood has been improving recently.' });
  }

  return insights;
}

// ── Achievement badges ───────────────────────────────────────────
// Full catalog always returned (earned + locked), same pattern as
// analyticsController.js#BADGE_CATALOG.
const MOOD_BADGE_CATALOG = [
  {
    id: 'first-checkin', label: 'First Check-in', icon: 'star',
    desc: 'Complete your first daily check-in.',
    check: (entries) => entries.length >= 1,
  },
  {
    id: 'week-streak', label: '7 Day Streak', icon: 'fire',
    desc: 'Check in for 7 consecutive days.',
    check: (entries, streaks) => streaks.longest >= 7,
  },
  {
    id: 'month-streak', label: '30 Day Streak', icon: 'trophy',
    desc: 'Check in for 30 consecutive days.',
    check: (entries, streaks) => streaks.longest >= 30,
  },
  {
    id: 'consistency-badge', label: 'Consistency Badge', icon: 'medal',
    desc: 'Log 20 total check-ins.',
    check: (entries) => entries.length >= 20,
  },
  {
    id: 'wellness-tracker-badge', label: 'Wellness Tracker Badge', icon: 'leaf',
    desc: 'Log 50 total check-ins.',
    check: (entries) => entries.length >= 50,
  },
];

function generateMoodBadges(entries, streaks) {
  return MOOD_BADGE_CATALOG.map(({ id, label, icon, desc, check }) => ({
    id, label, icon, desc,
    earned: entries.length > 0 ? check(entries, streaks) : false,
  }));
}

// ── GET /api/mood/analytics ─────────────────────────────────────
// Trend series for charts + weekly average + heatmap + insights + badges.
const getMoodAnalytics = async (req, res) => {
  try {
    const entries = await MoodEntry
      .find({ userId: req.user._id })
      .sort({ date: 1 }) // oldest -> newest for trend computation
      .lean();

    if (entries.length === 0) {
      return res.json({
        success: true,
        hasData: false,
        series: [],
        weeklyAverages: [],
        heatmap: [],
        insights: [],
        badges: generateMoodBadges([], { current: 0, longest: 0 }),
        streaks: { current: 0, longest: 0 },
      });
    }

    // Line chart series (mood/energy/stress/sleep trends)
    const series = entries.map((e) => ({
      date: e.date,
      label: new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      mood: e.mood,
      energyLevel: e.energyLevel,
      stressLevel: e.stressLevel,
      sleepQuality: e.sleepQuality,
    }));

    // Weekly average mood (bar chart) — bucket by ISO week start (Monday)
    const weekMap = {};
    entries.forEach((e) => {
      const d = new Date(e.date);
      const weekday = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
      const weekStart = new Date(d);
      weekStart.setUTCDate(d.getUTCDate() - weekday);
      const key = weekStart.toISOString().slice(0, 10);
      if (!weekMap[key]) weekMap[key] = { sum: 0, count: 0, start: weekStart };
      weekMap[key].sum += e.mood;
      weekMap[key].count += 1;
    });
    const weeklyAverages = Object.values(weekMap)
      .sort((a, b) => a.start - b.start)
      .map((w) => ({
        week: w.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        average: Math.round((w.sum / w.count) * 10) / 10,
      }));

    // Monthly wellness heatmap — one cell per day with an average "wellness"
    // proxy combining mood (scaled to 10) + energy - stress-impact + sleep.
    const heatmap = entries.map((e) => {
      const moodOn10 = e.mood * 2; // 1-5 -> 2-10
      const stressInverted = 11 - e.stressLevel; // higher stress = lower wellness
      const value = Math.round(((moodOn10 + e.energyLevel + stressInverted + e.sleepQuality) / 4) * 10) / 10;
      return { date: e.date, value };
    });

    const streaks = computeStreaks(entries.map((e) => e.date));
    const insights = generateMoodInsights(entries);
    const badges = generateMoodBadges(entries, streaks);

    return res.json({
      success: true,
      hasData: true,
      series,
      weeklyAverages,
      heatmap,
      insights,
      badges,
      streaks,
      count: entries.length,
    });
  } catch (err) {
    console.error('[mood] Analytics error:', err.message);
    return res.status(500).json({ error: 'Failed to compute mood analytics.' });
  }
};

module.exports = {
  createMoodEntry,
  getTodayEntry,
  getMoodHistory,
  updateMoodEntry,
  getMoodAnalytics,
  generateMoodInsights,
  generateMoodBadges,
};
