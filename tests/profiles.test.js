import { describe, expect, it } from 'vitest';
import { createProfile, normaliseUsername } from '../src/profiles.js';

const options = { uuid: () => '12345678-test-id', now: () => '2026-01-01T00:00:00.000Z' };

describe('local profiles', () => {
  it('trims and canonicalises a valid username', () => {
    expect(normaliseUsername('  Hiker_7 ')).toEqual({ username: 'Hiker_7', canonicalUsername: 'hiker_7' });
  });

  it.each(['ab', 'spaces fail', 'ábc', 'name-with-dash', 'a'.repeat(21)])('rejects invalid username %s', (name) => {
    expect(() => createProfile(name, [], options)).toThrow();
  });

  it('enforces case-insensitive uniqueness', () => {
    const first = createProfile('Alpine', [], options);
    expect(() => createProfile('ALPINE', [first], options)).toThrow(/already used/i);
  });

  it('enforces eight profiles per local origin', () => {
    const existing = Array.from({ length: 8 }, (_, index) => ({ canonicalUsername: `user${index}` }));
    expect(() => createProfile('ninth', existing, options)).toThrow(/maximum of eight/i);
  });
});
