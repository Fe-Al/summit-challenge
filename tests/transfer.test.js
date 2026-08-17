import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game.js';
import { createProfile } from '../src/profiles.js';
import { calculateScore } from '../src/scoring.js';
import { createExportBundle, MAX_IMPORT_BYTES, parseImportText, resolveImport, serialiseBundle } from '../src/transfer.js';

const profile = createProfile('Trail_One', [], { uuid: () => 'profile-12345678', now: () => '2026-01-01T00:00:00.000Z' });
const summary = { difficulty: 'normal', outcome: 'safe_return', summitReached: false, distanceTravelled: 4, ascentAchieved: 370, energy: 50, hydration: 55, daylightRemaining: 100, minutesMovedAfterDark: 0 };
const result = { schemaVersion: 1, id: 'result-123', profileId: profile.id, startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T01:00:00.000Z', summary, score: { ...calculateScore(summary), score: 999999 } };

describe('profile transfer', () => {
  it('round trips a profile and recalculates imported scores', () => {
    const bundle = createExportBundle({ profile, activeGame: createGame({ profileId: profile.id, id: 'game-123', seed: 2, now: '2026-01-01T00:00:00.000Z' }), results: [result] }, '2026-01-02T00:00:00.000Z');
    const parsed = parseImportText(serialiseBundle(bundle));
    expect(parsed.profile).toEqual(profile);
    expect(parsed.results[0].score.score).toBe(calculateScore(summary).score);
  });

  it('requires explicit replacement when the opaque ID exists', () => {
    const bundle = { profile, activeGame: null, results: [] };
    expect(resolveImport(bundle, [profile]).kind).toBe('replace');
  });

  it('requires renaming for a new ID with a canonical conflict', () => {
    const imported = { profile: { ...profile, id: 'different-profile' }, activeGame: null, results: [] };
    expect(resolveImport(imported, [profile]).kind).toBe('rename_required');
    expect(resolveImport(imported, [profile], 'Trail_Two').bundle.profile.username).toBe('Trail_Two');
  });

  it('rejects malformed, oversized and unsupported imports', () => {
    expect(() => parseImportText('{bad')).toThrow(/valid JSON/i);
    expect(() => parseImportText('{}', MAX_IMPORT_BYTES + 1)).toThrow(/larger/i);
    expect(() => parseImportText(JSON.stringify({ format: 'wrong', version: 1, exportedAt: new Date().toISOString(), profile, activeGame: null, results: [] }))).toThrow(/unsupported/i);
  });

  it('rejects prototype-polluting keys before modifying data', () => {
    const hostile = `{"format":"summit-challenge-profile","version":1,"exportedAt":"2026-01-01T00:00:00.000Z","profile":${JSON.stringify(profile)},"activeGame":null,"results":[],"__proto__":{"polluted":true}}`;
    expect(() => parseImportText(hostile)).toThrow(/forbidden/i);
    expect({}.polluted).toBeUndefined();
  });
});
