import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGame } from '../src/game.js';
import { createProfile } from '../src/profiles.js';
import { resultFromGame } from '../src/scoring.js';
import { DATABASE_NAME, storage } from '../src/storage.js';

function profile(username, id) {
  return createProfile(username, [], { uuid: () => id, now: () => '2026-01-01T00:00:00.000Z' });
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(deleteDatabase);

describe('IndexedDB storage', () => {
  it('isolates profiles and saves at most one active game per profile', async () => {
    const a = profile('Hiker_A', 'profile-a-12345');
    const b = profile('Hiker_B', 'profile-b-12345');
    await storage.addProfile(a); await storage.addProfile(b);
    await storage.saveGame(createGame({ profileId: a.id, id: 'game-a-12345', seed: 1, now: '2026-01-01T00:00:00.000Z' }));
    await storage.saveGame(createGame({ profileId: b.id, id: 'game-b-12345', seed: 2, now: '2026-01-01T00:00:00.000Z' }));
    expect((await storage.getGame(a.id)).id).toBe('game-a-12345');
    expect((await storage.getGame(b.id)).id).toBe('game-b-12345');
    await expect(storage.saveGame(createGame({ profileId: a.id, id: 'replacement-game', seed: 3, now: '2026-01-01T00:00:00.000Z' }))).rejects.toThrow(/not confirmed/i);
  });

  it('atomically stores completion and removes the active save', async () => {
    const a = profile('Hiker_A', 'profile-a-12345');
    await storage.addProfile(a);
    const active = createGame({ profileId: a.id, id: 'game-a-12345', seed: 1, now: '2026-01-01T00:00:00.000Z' });
    await storage.saveGame(active);
    const complete = { ...active, status: 'complete', outcome: 'abandoned', updatedAt: '2026-01-01T01:00:00.000Z' };
    await storage.saveGame(complete, resultFromGame(complete, '2026-01-01T01:00:00.000Z'));
    expect(await storage.getGame(a.id)).toBeNull();
    expect(await storage.listResults(a.id)).toHaveLength(1);
  });

  it('deletes only the named profile and all of its owned records', async () => {
    const a = profile('Hiker_A', 'profile-a-12345');
    const b = profile('Hiker_B', 'profile-b-12345');
    await storage.addProfile(a); await storage.addProfile(b);
    const activeA = createGame({ profileId: a.id, id: 'game-a-12345', seed: 1, now: '2026-01-01T00:00:00.000Z' });
    const activeB = createGame({ profileId: b.id, id: 'game-b-12345', seed: 2, now: '2026-01-01T00:00:00.000Z' });
    await storage.saveGame(activeA); await storage.saveGame(activeB);
    const completeA = { ...activeA, status: 'complete', outcome: 'abandoned' };
    await storage.saveGame(completeA, resultFromGame(completeA));
    await storage.deleteProfile(a.id);
    expect((await storage.listProfiles()).map((item) => item.id)).toEqual([b.id]);
    expect(await storage.getGame(a.id)).toBeNull();
    expect(await storage.listResults(a.id)).toEqual([]);
    expect((await storage.getGame(b.id)).id).toBe(activeB.id);
  });

  it('replaces a matching import transactionally when confirmed', async () => {
    const a = profile('Hiker_A', 'profile-a-12345');
    await storage.addProfile(a);
    const oldGame = { ...createGame({ profileId: a.id, id: 'old-game-12345', seed: 1, now: '2026-01-01T00:00:00.000Z' }), status: 'complete', outcome: 'abandoned' };
    await storage.saveGame(oldGame, resultFromGame(oldGame));
    await expect(storage.importBundle({ profile: a, activeGame: null, results: [] })).rejects.toThrow(/not confirmed/i);
    const renamed = { ...a, username: 'Hiker_New', canonicalUsername: 'hiker_new' };
    const importedGame = { ...createGame({ profileId: a.id, id: 'new-game-12345', seed: 2, now: '2026-01-02T00:00:00.000Z' }), status: 'complete', outcome: 'abandoned' };
    await storage.importBundle({ profile: renamed, activeGame: null, results: [resultFromGame(importedGame)] }, { replace: true });
    expect((await storage.listProfiles())[0].username).toBe('Hiker_New');
    expect((await storage.listResults(a.id)).map((result) => result.id)).toEqual(['new-game-12345']);
  });

  it('does not let an import overwrite a result owned by another profile', async () => {
    const a = profile('Hiker_A', 'profile-a-12345');
    const b = profile('Hiker_B', 'profile-b-12345');
    await storage.addProfile(a); await storage.addProfile(b);
    const complete = { ...createGame({ profileId: a.id, id: 'shared-result-id', seed: 1, now: '2026-01-01T00:00:00.000Z' }), status: 'complete', outcome: 'abandoned' };
    await storage.saveGame(complete, resultFromGame(complete));
    const hostile = { ...resultFromGame({ ...complete, profileId: b.id }), profileId: b.id };
    await expect(storage.importBundle({ profile: b, activeGame: null, results: [hostile] }, { replace: true })).rejects.toThrow(/different local profile/i);
    expect(await storage.listResults(a.id)).toHaveLength(1);
  });
});
