import { describe, expect, it } from 'vitest';
import { bestResultPerProfile, calculateScore } from '../src/scoring.js';

const summary = {
  difficulty: 'normal', outcome: 'summit_safe_return', summitReached: true,
  distanceTravelled: 14, ascentAchieved: 1260, energy: 45, hydration: 50,
  daylightRemaining: 20, minutesMovedAfterDark: 0,
};

describe('scoring', () => {
  it('returns a named arithmetic breakdown', () => {
    const result = calculateScore(summary);
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(Object.values(result.components).reduce((sum, value) => sum + value, 0));
  });

  it('makes rescue and abandonment ineligible with a leaderboard score of zero', () => {
    const rescue = calculateScore({ ...summary, outcome: 'rescue' });
    const abandoned = calculateScore({ ...summary, outcome: 'abandoned' });
    expect(rescue.score).toBe(0);
    expect(abandoned.score).toBe(0);
    expect(rescue.components.rescuePenalty).toBeLessThan(0);
  });

  it('applies difficulty and darkness adjustments', () => {
    const easy = calculateScore({ ...summary, difficulty: 'easy' });
    const hard = calculateScore({ ...summary, difficulty: 'hard', minutesMovedAfterDark: 10 });
    expect(easy.difficultyMultiplier).toBe(.85);
    expect(hard.components.afterDarkPenalty).toBe(-80);
  });

  it('chooses one eligible best per profile and uses date as a tie breaker', () => {
    const score = calculateScore(summary);
    const rows = [
      { id: 'late', profileId: 'a', completedAt: '2026-01-02T00:00:00.000Z', score },
      { id: 'early', profileId: 'a', completedAt: '2026-01-01T00:00:00.000Z', score },
      { id: 'none', profileId: 'b', completedAt: '2026-01-01T00:00:00.000Z', score: calculateScore({ ...summary, outcome: 'rescue' }) },
    ];
    expect(bestResultPerProfile(rows).map((row) => row.id)).toEqual(['early']);
  });
});
