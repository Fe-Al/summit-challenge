export const SCORE_CONSTANTS = Object.freeze({
  summit: 2000,
  safeReturn: 1000,
  distancePerKm: 45,
  ascentPerMetre: 0.55,
  energyRemaining: 7,
  hydrationRemaining: 6,
  daylightMinuteRemaining: 1.5,
  rescuePenalty: 1400,
  afterDarkMinutePenalty: 8,
  abandonmentPenalty: 900,
});

export const ELIGIBLE_OUTCOMES = Object.freeze([
  'summit_safe_return',
  'safe_return',
]);

export function calculateScore(summary) {
  const difficultyMultipliers = { easy: 0.85, normal: 1, hard: 1.3 };
  if (!summary || !difficultyMultipliers[summary.difficulty]) throw new Error('Invalid score summary.');
  const eligible = ELIGIBLE_OUTCOMES.includes(summary.outcome);
  const components = {
    summit: summary.summitReached ? SCORE_CONSTANTS.summit : 0,
    safeReturn: eligible ? SCORE_CONSTANTS.safeReturn : 0,
    distance: Math.round(summary.distanceTravelled * SCORE_CONSTANTS.distancePerKm),
    ascent: Math.round(summary.ascentAchieved * SCORE_CONSTANTS.ascentPerMetre),
    energy: Math.round(summary.energy * SCORE_CONSTANTS.energyRemaining),
    hydration: Math.round(summary.hydration * SCORE_CONSTANTS.hydrationRemaining),
    daylight: Math.round(Math.max(0, summary.daylightRemaining) * SCORE_CONSTANTS.daylightMinuteRemaining),
    rescuePenalty: summary.outcome === 'rescue' ? -SCORE_CONSTANTS.rescuePenalty : 0,
    afterDarkPenalty: -Math.round(summary.minutesMovedAfterDark * SCORE_CONSTANTS.afterDarkMinutePenalty),
    abandonmentPenalty: summary.outcome === 'abandoned' ? -SCORE_CONSTANTS.abandonmentPenalty : 0,
  };
  const subtotal = Object.values(components).reduce((total, value) => total + value, 0);
  const multiplier = difficultyMultipliers[summary.difficulty];
  const calculated = Math.max(0, Math.round(subtotal * multiplier));
  return Object.freeze({
    components: Object.freeze(components),
    subtotal,
    difficultyMultiplier: multiplier,
    score: eligible ? calculated : 0,
    preEligibilityScore: calculated,
    eligible,
  });
}

export function validateResultRecord(value, expectedProfileId = null) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || value.schemaVersion !== 1) throw new Error('Unsupported result record.');
  if (typeof value.id !== 'string' || value.id.length < 8 || value.id.length > 100 || typeof value.profileId !== 'string' || value.profileId.length < 8 || value.profileId.length > 100 || (expectedProfileId && value.profileId !== expectedProfileId)) throw new Error('Invalid result ownership.');
  if (typeof value.startedAt !== 'string' || Number.isNaN(Date.parse(value.startedAt)) || typeof value.completedAt !== 'string' || Number.isNaN(Date.parse(value.completedAt))) throw new Error('Invalid result date.');
  const summary = value.summary;
  if (!summary || Object.getPrototypeOf(summary) !== Object.prototype) throw new Error('Invalid result summary.');
  if (!['easy', 'normal', 'hard'].includes(summary.difficulty) || !['summit_safe_return', 'safe_return', 'rescue', 'abandoned'].includes(summary.outcome) || typeof summary.summitReached !== 'boolean') throw new Error('Invalid result outcome.');
  for (const key of ['distanceTravelled', 'ascentAchieved', 'energy', 'hydration', 'daylightRemaining', 'minutesMovedAfterDark']) {
    if (!Number.isFinite(summary[key]) || summary[key] < 0) throw new Error(`Invalid result ${key}.`);
  }
  if (summary.energy > 100 || summary.hydration > 100) throw new Error('Invalid result resources.');
  if ((summary.outcome === 'summit_safe_return' && !summary.summitReached) || (summary.outcome === 'safe_return' && summary.summitReached)) throw new Error('Inconsistent summit result.');
  const cleanSummary = {
    difficulty: summary.difficulty, outcome: summary.outcome, summitReached: summary.summitReached,
    distanceTravelled: summary.distanceTravelled, ascentAchieved: summary.ascentAchieved,
    energy: summary.energy, hydration: summary.hydration, daylightRemaining: summary.daylightRemaining,
    minutesMovedAfterDark: summary.minutesMovedAfterDark,
  };
  return {
    schemaVersion: 1, id: value.id, profileId: value.profileId,
    startedAt: value.startedAt, completedAt: value.completedAt,
    summary: cleanSummary, score: calculateScore(cleanSummary),
  };
}

export function resultFromGame(game, completedAt = new Date().toISOString()) {
  if (!game.outcome) throw new Error('Cannot score an active game.');
  const summary = Object.freeze({
    difficulty: game.difficulty,
    outcome: game.outcome,
    summitReached: game.summitReached,
    distanceTravelled: game.stats.distanceTravelled,
    ascentAchieved: game.stats.ascentAchieved,
    energy: game.energy,
    hydration: game.hydration,
    daylightRemaining: Math.max(0, game.daylightMinutes - game.elapsedMinutes),
    minutesMovedAfterDark: game.stats.minutesMovedAfterDark,
  });
  return {
    schemaVersion: 1,
    id: game.id,
    profileId: game.profileId,
    startedAt: game.startedAt,
    completedAt,
    summary,
    score: calculateScore(summary),
  };
}

export function bestResultPerProfile(results) {
  const best = new Map();
  for (const result of results) {
    if (!result.score?.eligible) continue;
    const previous = best.get(result.profileId);
    if (!previous || result.score.score > previous.score.score ||
      (result.score.score === previous.score.score && result.completedAt < previous.completedAt)) {
      best.set(result.profileId, result);
    }
  }
  return [...best.values()].sort((a, b) => b.score.score - a.score.score || a.completedAt.localeCompare(b.completedAt));
}
