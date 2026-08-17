import { validateGame } from './game.js';
import { validateProfile } from './profiles.js';
import { validateResultRecord } from './scoring.js';

export const DATABASE_NAME = 'summit-challenge-v3';
export const DATABASE_VERSION = 1;
export const STORES = Object.freeze({ profiles: 'profiles', games: 'activeGames', results: 'results' });

export class StorageError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'StorageError';
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function deleteIndexRecords(index, key) {
  return new Promise((resolve, reject) => {
    const request = index.openCursor(IDBKeyRange.only(key));
    request.onerror = () => reject(request.error ?? new Error('Could not delete indexed records.'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(); return; }
      cursor.delete();
      cursor.continue();
    };
  });
}

export function openDatabase(indexedDBObject = globalThis.indexedDB) {
  if (!indexedDBObject) return Promise.reject(new StorageError('Local browser storage is unavailable. Try a normal browsing window or adjust browser storage settings.'));
  return new Promise((resolve, reject) => {
    const request = indexedDBObject.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.profiles)) {
        const profiles = db.createObjectStore(STORES.profiles, { keyPath: 'id' });
        profiles.createIndex('canonicalUsername', 'canonicalUsername', { unique: true });
      }
      if (!db.objectStoreNames.contains(STORES.games)) db.createObjectStore(STORES.games, { keyPath: 'profileId' });
      if (!db.objectStoreNames.contains(STORES.results)) {
        const results = db.createObjectStore(STORES.results, { keyPath: 'id' });
        results.createIndex('profileId', 'profileId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StorageError('Summit Challenge could not open local storage.', request.error));
    request.onblocked = () => reject(new StorageError('A database update is blocked. Close other Summit Challenge tabs and reload.'));
  });
}

async function withDatabase(work) {
  let db;
  try {
    db = await openDatabase();
    return await work(db);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    const quota = error?.name === 'QuotaExceededError' ? ' Browser storage quota was exceeded.' : '';
    throw new StorageError(`The local data operation failed.${quota} Existing data was not intentionally discarded.`, error);
  } finally {
    db?.close();
  }
}

export const storage = {
  async listProfiles() {
    return withDatabase(async (db) => {
      const values = await requestResult(db.transaction(STORES.profiles).objectStore(STORES.profiles).getAll());
      return values.map(validateProfile).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  },
  async addProfile(profile) {
    const clean = validateProfile(profile);
    return withDatabase(async (db) => {
      const tx = db.transaction(STORES.profiles, 'readwrite');
      const profiles = tx.objectStore(STORES.profiles);
      const count = await requestResult(profiles.count());
      if (count >= 8) { tx.abort(); throw new StorageError('This browser already has the maximum of eight local profiles.'); }
      profiles.add(clean);
      await transactionDone(tx);
      return clean;
    });
  },
  async getGame(profileId) {
    return withDatabase(async (db) => {
      const value = await requestResult(db.transaction(STORES.games).objectStore(STORES.games).get(profileId));
      return value ? validateGame(value, profileId) : null;
    });
  },
  async saveGame(game, result = null, { replaceActive = false } = {}) {
    const clean = validateGame(game, game.profileId);
    return withDatabase(async (db) => {
      const tx = db.transaction([STORES.games, STORES.results], 'readwrite');
      const games = tx.objectStore(STORES.games);
      if (clean.status === 'complete') {
        const cleanResult = validateResultRecord(result, clean.profileId);
        if (cleanResult.id !== clean.id) throw new Error('A completed game requires its matching result.');
        tx.objectStore(STORES.results).add(cleanResult);
        games.delete(clean.profileId);
      } else {
        const existing = await requestResult(games.get(clean.profileId));
        if (existing && existing.id !== clean.id && !replaceActive) { tx.abort(); throw new StorageError('An active game already exists and replacement was not confirmed.'); }
        games.put(clean);
      }
      await transactionDone(tx);
    });
  },
  async listResults(profileId = null) {
    return withDatabase(async (db) => {
      const store = db.transaction(STORES.results).objectStore(STORES.results);
      const values = profileId ? await requestResult(store.index('profileId').getAll(profileId)) : await requestResult(store.getAll());
      return values.map((value) => validateResultRecord(value, profileId));
    });
  },
  async deleteProfile(profileId) {
    return withDatabase(async (db) => {
      const tx = db.transaction([STORES.profiles, STORES.games, STORES.results], 'readwrite');
      tx.objectStore(STORES.profiles).delete(profileId);
      tx.objectStore(STORES.games).delete(profileId);
      const index = tx.objectStore(STORES.results).index('profileId');
      await deleteIndexRecords(index, profileId);
      await transactionDone(tx);
    });
  },
  async getBundle(profileId) {
    return withDatabase(async (db) => {
      const tx = db.transaction([STORES.profiles, STORES.games, STORES.results]);
      const profileRequest = tx.objectStore(STORES.profiles).get(profileId);
      const gameRequest = tx.objectStore(STORES.games).get(profileId);
      const resultsRequest = tx.objectStore(STORES.results).index('profileId').getAll(profileId);
      const [profile, activeGame, results] = await Promise.all([requestResult(profileRequest), requestResult(gameRequest), requestResult(resultsRequest)]);
      await transactionDone(tx);
      if (!profile) throw new Error('Profile not found.');
      return { profile: validateProfile(profile), activeGame: activeGame ? validateGame(activeGame, profileId) : null, results: results.map((result) => validateResultRecord(result, profileId)) };
    });
  },
  async importBundle(bundle, { replace = false } = {}) {
    const profile = validateProfile(bundle?.profile);
    const activeGame = bundle.activeGame ? validateGame(bundle.activeGame, profile.id) : null;
    if (!Array.isArray(bundle.results)) throw new Error('Invalid imported result collection.');
    const results = bundle.results.map((result) => validateResultRecord(result, profile.id));
    return withDatabase(async (db) => {
      const tx = db.transaction([STORES.profiles, STORES.games, STORES.results], 'readwrite');
      const profilesStore = tx.objectStore(STORES.profiles);
      const existing = await requestResult(profilesStore.get(profile.id));
      if (existing && !replace) { tx.abort(); throw new StorageError('This profile ID already exists and replacement was not confirmed.'); }
      const nameOwner = await requestResult(profilesStore.index('canonicalUsername').get(profile.canonicalUsername));
      if (nameOwner && nameOwner.id !== profile.id) { tx.abort(); throw new StorageError('That username is already used in this browser.'); }
      const count = await requestResult(profilesStore.count());
      if (!existing && count >= 8) { tx.abort(); throw new StorageError('This browser already has the maximum of eight local profiles.'); }
      for (const result of results) {
        const storedResult = await requestResult(tx.objectStore(STORES.results).get(result.id));
        if (storedResult && storedResult.profileId !== profile.id) { tx.abort(); throw new StorageError('An imported result ID belongs to a different local profile. No data was changed.'); }
      }
      if (replace) {
        profilesStore.delete(profile.id);
        tx.objectStore(STORES.games).delete(profile.id);
        await deleteIndexRecords(tx.objectStore(STORES.results).index('profileId'), profile.id);
      }
      profilesStore.put(profile);
      if (activeGame) tx.objectStore(STORES.games).put(activeGame);
      for (const result of results) tx.objectStore(STORES.results).put(result);
      await transactionDone(tx);
    });
  },
};
