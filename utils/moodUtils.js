/**
 * Mood check-in utilities — shared constants and pure helper functions used
 * by the mood controller and the mood context service (Gemini integration).
 * Kept dependency-free (native Date only) to match the rest of the backend.
 */

// Mood scale: higher = better, mirrors the "higher = better" convention used
// throughout utils/scoring.js for consistency across the app.
const MOOD_SCALE = {
  5: { label: 'Very Happy', emoji: '😊' },
  4: { label: 'Happy', emoji: '🙂' },
  3: { label: 'Neutral', emoji: '😐' },
  2: { label: 'Sad', emoji: '😔' },
  1: { label: 'Very Stressed', emoji: '😰' },
};

const NOTES_MAX_LENGTH = 250;

/**
 * Normalize any Date/date-string to a UTC midnight Date representing "the
 * day" it falls on. Used as the uniqueness key for one check-in per day.
 * Falls back to the current server day if `input` is missing/invalid.
 */
function startOfDay(input) {
  const d = input ? new Date(input) : new Date();
  if (isNaN(d.getTime())) return startOfDay();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/**
 * Validate a mood check-in payload. Returns { valid, errors, data } where
 * `data` contains only the sanitized/coerced allowed fields — never trust
 * unknown fields from the client (no validation library in this project,
 * so this mirrors the manual-allowlist style used in surveyController.js).
 */
function validateMoodPayload(body = {}) {
  const errors = [];
  const data = {};

  const mood = Number(body.mood);
  if (!Number.isInteger(mood) || mood < 1 || mood > 5) {
    errors.push('mood must be an integer between 1 and 5.');
  } else {
    data.mood = mood;
  }

  const numericFields = [
    ['energyLevel', 1, 10],
    ['stressLevel', 1, 10],
    ['sleepQuality', 1, 10],
  ];
  numericFields.forEach(([field, min, max]) => {
    const val = Number(body[field]);
    if (!Number.isInteger(val) || val < min || val > max) {
      errors.push(`${field} must be an integer between ${min} and ${max}.`);
    } else {
      data[field] = val;
    }
  });

  if (body.notes !== undefined && body.notes !== null) {
    const notes = String(body.notes).trim();
    if (notes.length > NOTES_MAX_LENGTH) {
      errors.push(`notes must be ${NOTES_MAX_LENGTH} characters or fewer.`);
    } else {
      data.notes = notes;
    }
  } else {
    data.notes = '';
  }

  return { valid: errors.length === 0, errors, data };
}

/**
 * Direction of change between the first and second half of a chronological
 * (oldest → newest) array of numeric values. Used for both rule-based
 * insights and the Gemini mood context.
 */
function trendDirection(values, threshold = 1) {
  const clean = values.filter((v) => v !== null && v !== undefined && !isNaN(v));
  if (clean.length < 2) return 'stable';

  const mid = Math.ceil(clean.length / 2);
  const firstHalf = clean.slice(0, mid);
  const secondHalf = clean.slice(mid);
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const delta = avg(secondHalf.length ? secondHalf : firstHalf) - avg(firstHalf);
  if (delta >= threshold) return 'increasing';
  if (delta <= -threshold) return 'decreasing';
  return 'stable';
}

/**
 * Compute the current streak (consecutive days up to today/yesterday) and
 * the longest streak ever, from a set of check-in dates.
 * @param {Date[]} dates - unnormalized dates, any order
 */
function computeStreaks(dates) {
  if (!dates.length) return { current: 0, longest: 0 };

  const dayMs = 24 * 60 * 60 * 1000;
  const uniqueDays = [...new Set(dates.map((d) => startOfDay(d).getTime()))].sort((a, b) => a - b);

  let longest = 1;
  let run = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    if (uniqueDays[i] - uniqueDays[i - 1] === dayMs) {
      run += 1;
    } else {
      longest = Math.max(longest, run);
      run = 1;
    }
  }
  longest = Math.max(longest, run);

  // Current streak: walk backwards from today/yesterday while consecutive.
  // Allows the streak to survive until the user has actually missed a day.
  const today = startOfDay(new Date()).getTime();
  const lastDay = uniqueDays[uniqueDays.length - 1];
  let current = 0;
  if (lastDay === today || lastDay === today - dayMs) {
    current = 1;
    for (let i = uniqueDays.length - 1; i > 0; i--) {
      if (uniqueDays[i] - uniqueDays[i - 1] === dayMs) {
        current += 1;
      } else {
        break;
      }
    }
  }

  return { current, longest };
}

module.exports = {
  MOOD_SCALE,
  NOTES_MAX_LENGTH,
  startOfDay,
  isSameDay,
  validateMoodPayload,
  trendDirection,
  computeStreaks,
};
