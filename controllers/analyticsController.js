const SurveyResponse = require('../models/SurveyResponse');
const { computeScores } = require('../utils/scoring');

// ── Date-range filter from ?range= query ───────────────────────
function buildDateFilter(range, from, to) {
  const now = new Date();
  let start = null;

  switch (range) {
    case '7d':  start = new Date(now - 7  * 24 * 60 * 60 * 1000); break;
    case '30d': start = new Date(now - 30 * 24 * 60 * 60 * 1000); break;
    case '90d': start = new Date(now - 90 * 24 * 60 * 60 * 1000); break;
    case '1y':  start = new Date(now - 365 * 24 * 60 * 60 * 1000); break;
    case 'custom':
      if (from) start = new Date(from);
      break;
    default: start = null; // all time
  }

  const filter = {};
  if (start) filter.$gte = start;
  if (range === 'custom' && to) filter.$lte = new Date(to);
  return Object.keys(filter).length ? filter : null;
}

// Fetch scored, chronologically-ordered responses for the user
async function getScoredResponses(userId, dateFilter) {
  const query = { userId };
  if (dateFilter) query.submittedAt = dateFilter;

  const responses = await SurveyResponse
    .find(query)
    .select('submittedAt createdAt emotional anxiety depression social lifestyle stress')
    .sort({ submittedAt: 1, createdAt: 1 }) // oldest → newest for trends
    .lean();

  return responses.map((r) => {
    const scores = computeScores(r);
    const date = r.submittedAt || r.createdAt;
    return { date, ...scores };
  });
}

// ── GET /api/analytics/trends ───────────────────────────────────
const getTrends = async (req, res) => {
  try {
    const { range = 'all', from, to } = req.query;
    const dateFilter = buildDateFilter(range, from, to);
    const scored = await getScoredResponses(req.user._id, dateFilter);

    // Time-series points for line charts
    const series = scored.map((s, i) => ({
      index: i + 1,
      date: s.date,
      label: new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      overall: s.overall,
      stress: s.stress,
      anxiety: s.anxiety,
      depression: s.depression,
      sleep: s.sleep,
      lifestyle: s.lifestyle,
      social: s.social,
      emotional: s.emotional,
    }));

    // Monthly average wellness (bar chart)
    const monthMap = {};
    scored.forEach((s) => {
      const d = new Date(s.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[key]) monthMap[key] = { sum: 0, count: 0 };
      monthMap[key].sum += s.overall;
      monthMap[key].count += 1;
    });
    const monthlyAverages = Object.entries(monthMap).map(([key, v]) => {
      const [year, month] = key.split('-');
      const label = new Date(year, month - 1).toLocaleDateString('en-GB', {
        month: 'short', year: '2-digit',
      });
      return { month: label, average: Math.round(v.sum / v.count) };
    });

    // Latest radar snapshot
    const latest = scored[scored.length - 1] || null;
    const radar = latest
      ? [
          { dimension: 'Wellness',  value: latest.overall },
          { dimension: 'Sleep',     value: latest.sleep },
          { dimension: 'Lifestyle', value: latest.lifestyle },
          { dimension: 'Social',    value: latest.social },
          { dimension: 'Stress',    value: latest.stress },
          { dimension: 'Anxiety',   value: latest.anxiety },
        ]
      : [];

    return res.json({ success: true, series, monthlyAverages, radar, count: scored.length });
  } catch (err) {
    console.error('[analytics] Trends error:', err.message);
    return res.status(500).json({ error: 'Failed to compute trends.' });
  }
};

// ── GET /api/analytics/comparison ───────────────────────────────
const getComparison = async (req, res) => {
  try {
    const scored = await getScoredResponses(req.user._id, null);

    if (scored.length < 1) {
      return res.json({ success: true, hasComparison: false, latest: null, previous: null });
    }

    const latest   = scored[scored.length - 1];
    const previous = scored.length >= 2 ? scored[scored.length - 2] : null;

    const dims = ['overall', 'stress', 'anxiety', 'depression', 'sleep', 'lifestyle'];
    const labels = {
      overall: 'Wellness Score', stress: 'Stress Score', anxiety: 'Anxiety Score',
      depression: 'Depression Score', sleep: 'Sleep Score', lifestyle: 'Lifestyle Score',
    };

    const comparison = dims.map((d) => {
      const current = latest[d];
      const prev = previous ? previous[d] : null;
      const change = prev !== null ? current - prev : null;
      return {
        key: d,
        label: labels[d],
        current,
        previous: prev,
        change,
        // For all these dimensions higher = better, so positive change = improvement
        improved: change !== null ? change > 0 : null,
      };
    });

    return res.json({
      success: true,
      hasComparison: previous !== null,
      latestDate: latest.date,
      previousDate: previous ? previous.date : null,
      comparison,
    });
  } catch (err) {
    console.error('[analytics] Comparison error:', err.message);
    return res.status(500).json({ error: 'Failed to compute comparison.' });
  }
};

// ── AI-style insight generation (rule-based) ────────────────────
function generateInsights(scored) {
  const insights = [];
  if (scored.length < 2) return insights;

  const latest = scored[scored.length - 1];
  const prev   = scored[scored.length - 2];
  const first  = scored[0];

  // Overall change latest vs previous
  const overallDelta = latest.overall - prev.overall;
  if (overallDelta >= 5) {
    insights.push({ type: 'positive', icon: 'trending-up',
      text: `Your wellness score improved by ${overallDelta} points since your last assessment.` });
  } else if (overallDelta <= -5) {
    insights.push({ type: 'warning', icon: 'trending-down',
      text: `Your wellness score dropped by ${Math.abs(overallDelta)} points. Consider revisiting your self-care routine.` });
  }

  // Overall change over the whole period (%)
  if (first.overall > 0) {
    const pct = Math.round(((latest.overall - first.overall) / first.overall) * 100);
    if (pct >= 10) {
      insights.push({ type: 'positive', icon: 'sparkles',
        text: `Your wellness has improved by ${pct}% since your first assessment.` });
    }
  }

  // Stress trend across last 3
  if (scored.length >= 3) {
    const last3 = scored.slice(-3);
    const stressImproving = last3[0].stress < last3[1].stress && last3[1].stress < last3[2].stress;
    if (stressImproving) {
      insights.push({ type: 'positive', icon: 'shield',
        text: 'Your stress resilience has improved across your last 3 assessments.' });
    }
  }

  // Sleep consistency
  if (scored.length >= 3) {
    const last3 = scored.slice(-3);
    const sleepImproving = last3.every((s, i) => i === 0 || s.sleep >= last3[i - 1].sleep);
    if (sleepImproving && last3[2].sleep > last3[0].sleep) {
      insights.push({ type: 'positive', icon: 'moon',
        text: 'Your sleep quality has consistently improved recently.' });
    }
  }

  // Anxiety slight increase
  const anxietyDelta = latest.anxiety - prev.anxiety;
  if (anxietyDelta <= -5) {
    insights.push({ type: 'warning', icon: 'alert',
      text: 'Your anxiety management score has decreased slightly. Breathing exercises may help.' });
  }

  return insights;
}

// ── Achievement badges ──────────────────────────────────────────
// Full catalog is always returned (earned + locked) so the UI can show
// upcoming achievements as "locked" targets to work towards.
const BADGE_CATALOG = [
  {
    id: 'first-improvement', label: 'First Improvement', icon: 'star',
    desc: 'Improve your wellness score for the first time.',
    check: (scored) => scored.some((s, i) => i > 0 && s.overall > scored[i - 1].overall),
  },
  {
    id: 'three-consecutive', label: '3 Consecutive Improvements', icon: 'fire',
    desc: 'Improve your score three assessments in a row.',
    check: (scored) => {
      let streak = 1, max = 1;
      for (let i = 1; i < scored.length; i++) {
        streak = scored[i].overall > scored[i - 1].overall ? streak + 1 : 1;
        max = Math.max(max, streak);
      }
      return max >= 3;
    },
  },
  {
    id: 'wellness-streak', label: 'Wellness Streak', icon: 'medal',
    desc: 'Complete 5 assessments to build your streak.',
    check: (scored) => scored.length >= 5,
  },
  {
    id: 'sleep-improvement', label: 'Consistent Sleep Improvement', icon: 'moon',
    desc: 'Improve your sleep quality across 3 assessments.',
    check: (scored) => scored.length >= 3 && scored.slice(-3)[2].sleep > scored.slice(-3)[0].sleep,
  },
  {
    id: 'reduced-stress', label: 'Reduced Stress Milestone', icon: 'leaf',
    desc: 'Reach a strong stress resilience score (70+).',
    check: (scored) => scored.length > 0 && scored[scored.length - 1].stress >= 70,
  },
  {
    id: 'dedicated-tracker', label: 'Dedicated Tracker', icon: 'trophy',
    desc: 'Complete 10 assessments.',
    check: (scored) => scored.length >= 10,
  },
  {
    id: 'full-bloom', label: 'Full Bloom', icon: 'flower',
    desc: 'Achieve a perfect wellness score of 100.',
    check: (scored) => scored.some((s) => s.overall >= 100),
  },
];

function generateBadges(scored) {
  return BADGE_CATALOG.map(({ id, label, icon, desc, check }) => ({
    id, label, icon, desc,
    earned: scored.length > 0 ? check(scored) : false,
  }));
}

// ── GET /api/analytics/summary ──────────────────────────────────
const getSummary = async (req, res) => {
  try {
    const scored = await getScoredResponses(req.user._id, null);

    if (scored.length === 0) {
      return res.json({
        success: true, hasData: false,
        summary: { current: 0, best: 0, average: 0, count: 0, improvement: 0 },
        insights: [], badges: generateBadges([]),
      });
    }

    const overalls = scored.map((s) => s.overall);
    const current  = overalls[overalls.length - 1];
    const best      = Math.max(...overalls);
    const average   = Math.round(overalls.reduce((a, b) => a + b, 0) / overalls.length);
    const first     = overalls[0];
    const improvement = first > 0 ? Math.round(((current - first) / first) * 100) : 0;

    return res.json({
      success: true,
      hasData: true,
      summary: { current, best, average, count: scored.length, improvement },
      insights: generateInsights(scored),
      badges: generateBadges(scored),
    });
  } catch (err) {
    console.error('[analytics] Summary error:', err.message);
    return res.status(500).json({ error: 'Failed to compute summary.' });
  }
};

module.exports = { getTrends, getComparison, getSummary };
