export const PROFILE_SCHEMA_VERSION = 1;
export const MAX_PROFILES = 8;
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export function normaliseUsername(input) {
  if (typeof input !== 'string') return null;
  const username = input.trim();
  if (!USERNAME_PATTERN.test(username)) return null;
  return { username, canonicalUsername: username.toLowerCase() };
}

export function createProfile(usernameInput, existingProfiles = [], options = {}) {
  const normalised = normaliseUsername(usernameInput);
  if (!normalised) throw new Error('Username must be 3–20 ASCII letters, digits or underscores.');
  if (existingProfiles.length >= MAX_PROFILES) throw new Error('This browser already has the maximum of eight local profiles.');
  if (existingProfiles.some((profile) => profile.canonicalUsername === normalised.canonicalUsername)) throw new Error('That username is already used in this browser.');
  const uuid = options.uuid ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: uuid(),
    username: normalised.username,
    canonicalUsername: normalised.canonicalUsername,
    createdAt: now(),
  };
}

export function validateProfile(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || value.schemaVersion !== PROFILE_SCHEMA_VERSION) throw new Error('Unsupported profile record.');
  const name = normaliseUsername(value.username);
  if (!name || name.username !== value.username || name.canonicalUsername !== value.canonicalUsername) throw new Error('Invalid profile username.');
  if (typeof value.id !== 'string' || value.id.length < 8 || value.id.length > 100) throw new Error('Invalid profile identifier.');
  if (!isIsoDate(value.createdAt)) throw new Error('Invalid profile creation date.');
  return { schemaVersion: PROFILE_SCHEMA_VERSION, id: value.id, username: value.username, canonicalUsername: value.canonicalUsername, createdAt: value.createdAt };
}

export function isIsoDate(value) {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}
