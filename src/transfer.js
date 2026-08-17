import { validateGame } from './game.js';
import { MAX_PROFILES, normaliseUsername, validateProfile } from './profiles.js';
import { calculateScore } from './scoring.js';

export const TRANSFER_FORMAT = 'summit-challenge-profile';
export const TRANSFER_VERSION = 1;
export const MAX_IMPORT_BYTES = 1024 * 1024;

function rejectDangerousKeys(value) {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('The file contains a forbidden object key.');
    rejectDangerousKeys(value[key]);
  }
}

function exactKeys(object, allowed, label) {
  if (!object || Object.getPrototypeOf(object) !== Object.prototype) throw new Error(`${label} must be an object.`);
  const extras = Object.keys(object).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`${label} contains unsupported fields.`);
}

function validateSummary(summary) {
  exactKeys(summary, ['difficulty', 'outcome', 'summitReached', 'distanceTravelled', 'ascentAchieved', 'energy', 'hydration', 'daylightRemaining', 'minutesMovedAfterDark'], 'Result summary');
  if (!['easy', 'normal', 'hard'].includes(summary.difficulty) || !['summit_safe_return', 'safe_return', 'rescue', 'abandoned'].includes(summary.outcome)) throw new Error('Invalid result outcome or difficulty.');
  for (const key of ['distanceTravelled', 'ascentAchieved', 'energy', 'hydration', 'daylightRemaining', 'minutesMovedAfterDark']) {
    if (!Number.isFinite(summary[key]) || summary[key] < 0) throw new Error(`Invalid result ${key}.`);
  }
  if (summary.energy > 100 || summary.hydration > 100 || typeof summary.summitReached !== 'boolean') throw new Error('Invalid result resources.');
  if ((summary.outcome === 'summit_safe_return' && !summary.summitReached) || (summary.outcome === 'safe_return' && summary.summitReached)) throw new Error('Inconsistent summit result.');
  const score = calculateScore(summary);
  return { ...summary, score };
}

function validateResult(value, profileId) {
  exactKeys(value, ['schemaVersion', 'id', 'profileId', 'startedAt', 'completedAt', 'summary', 'score'], 'Result');
  if (value.schemaVersion !== 1 || typeof value.id !== 'string' || value.profileId !== profileId) throw new Error('Invalid imported result identity.');
  if (Number.isNaN(Date.parse(value.startedAt)) || Number.isNaN(Date.parse(value.completedAt))) throw new Error('Invalid result date.');
  const { score, ...summary } = validateSummary(value.summary);
  return { schemaVersion: 1, id: value.id, profileId, startedAt: value.startedAt, completedAt: value.completedAt, summary, score };
}

export function createExportBundle({ profile, activeGame, results }, now = new Date().toISOString()) {
  return {
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    exportedAt: now,
    profile: validateProfile(profile),
    activeGame: activeGame ? validateGame(activeGame, profile.id) : null,
    results: results.map((result) => validateResult(result, profile.id)),
  };
}

export function serialiseBundle(bundle) {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function safeExportFilename(username) {
  const safe = username.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20) || 'profile';
  return `summit-challenge-profile-${safe}.json`;
}

export function parseImportText(text, byteLength = new TextEncoder().encode(text).byteLength) {
  if (byteLength > MAX_IMPORT_BYTES) throw new Error('The selected file is larger than 1 MiB.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('The selected file is not valid JSON.'); }
  rejectDangerousKeys(parsed);
  exactKeys(parsed, ['format', 'version', 'exportedAt', 'profile', 'activeGame', 'results'], 'Import file');
  if (parsed.format !== TRANSFER_FORMAT || parsed.version !== TRANSFER_VERSION) throw new Error('Unsupported Summit Challenge export format or version.');
  if (Number.isNaN(Date.parse(parsed.exportedAt))) throw new Error('Invalid export date.');
  const profile = validateProfile(parsed.profile);
  if (!Array.isArray(parsed.results) || parsed.results.length > 10000) throw new Error('Invalid or excessive result history.');
  return {
    profile,
    activeGame: parsed.activeGame ? validateGame(parsed.activeGame, profile.id) : null,
    results: parsed.results.map((result) => validateResult(result, profile.id)),
  };
}

export function resolveImport(bundle, existingProfiles, requestedUsername = null) {
  const byId = existingProfiles.find((profile) => profile.id === bundle.profile.id);
  if (byId) return { kind: 'replace', bundle };
  if (existingProfiles.length >= MAX_PROFILES) throw new Error('This browser already has the maximum of eight local profiles.');
  const conflict = existingProfiles.some((profile) => profile.canonicalUsername === bundle.profile.canonicalUsername);
  if (!conflict) return { kind: 'new', bundle };
  if (!requestedUsername) return { kind: 'rename_required', bundle };
  const name = normaliseUsername(requestedUsername);
  if (!name || existingProfiles.some((profile) => profile.canonicalUsername === name.canonicalUsername)) throw new Error('Choose a valid, unused username of 3–20 letters, digits or underscores.');
  const renamed = { ...bundle, profile: { ...bundle.profile, ...name } };
  return { kind: 'new', bundle: renamed };
}
