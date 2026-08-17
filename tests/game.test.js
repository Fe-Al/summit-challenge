import { describe, expect, it } from 'vitest';
import { ACTIONS, advanceGenerator, applyAction, createGame, estimatedDistanceRemaining, walkingPreview } from '../src/game.js';

const base = () => createGame({ profileId: 'profile-123', difficulty: 'normal', seed: 4000, id: 'game-123', now: '2026-01-01T00:00:00.000Z' });
const apply = (game, action) => applyAction(game, action, '2026-01-01T00:01:00.000Z');

function avoidEvent(game) {
  let rngState = game.rngState;
  while (advanceGenerator(rngState).value < .8) rngState = advanceGenerator(rngState).state;
  return { ...game, rngState };
}

function walk(game) {
  const prepared = avoidEvent(game);
  const next = apply(prepared, { type: ACTIONS.WALK, confirmDark: true });
  return next.pendingEvent ? apply(next, { type: ACTIONS.RESOLVE_EVENT }) : next;
}

describe('game engine', () => {
  it('consumes resources, clamps them, and advances one segment', () => {
    const before = base();
    const after = walk(before);
    expect(after.position).toBe('forest_gate');
    expect(after.energy).toBeLessThan(before.energy);
    expect(after.hydration).toBeLessThan(before.hydration);
    expect(after.stats.distanceTravelled).toBe(1.5);
  });

  it('eats, drinks and rests with the configured rules', () => {
    const depleted = { ...base(), energy: 50, hydration: 50 };
    const eaten = apply(depleted, { type: ACTIONS.EAT });
    const drank = apply(eaten, { type: ACTIONS.DRINK });
    const rested = apply(avoidEvent(drank), { type: ACTIONS.REST });
    expect(eaten.food).toBe(2);
    expect(drank.water).toBe(2);
    expect(rested.elapsedMinutes).toBe(20);
    expect(rested.energy).toBeGreaterThan(drank.energy);
  });

  it('rejects supplies that cannot have an effect', () => {
    expect(() => apply({ ...base(), energy: 100 }, { type: ACTIONS.EAT })).toThrow(/already full/i);
    expect(() => apply({ ...base(), hydration: 100 }, { type: ACTIONS.DRINK })).toThrow(/already full/i);
  });

  it('path selection does not advance time or the generator', () => {
    let game = walk(walk(base()));
    expect(game.position).toBe('lower_junction');
    const selected = apply(game, { type: ACTIONS.CHOOSE_PATH, segmentId: 'valley_curve' });
    expect(selected.elapsedMinutes).toBe(game.elapsedMinutes);
    expect(selected.rngState).toBe(game.rngState);
    expect(walk(selected).position).toBe('valley_camp');
  });

  it('turns back along the actual journey without jumps', () => {
    let game = walk(walk(base()));
    game = apply(game, { type: ACTIONS.TURN_BACK });
    game = walk(game);
    expect(game.position).toBe('forest_gate');
    expect(game.journey).toEqual(['pine_track']);
    game = walk(game);
    expect(game.position).toBe('carpark');
    expect(game.outcome).toBe('safe_return');
  });

  it('calculates remaining distance for unresolved and selected paths', () => {
    expect(estimatedDistanceRemaining(base())).toBe(13.4);
    let game = walk(walk(base()));
    expect(estimatedDistanceRemaining(game)).toBe(10.6);
    game = apply(game, { type: ACTIONS.CHOOSE_PATH, segmentId: 'valley_curve' });
    expect(estimatedDistanceRemaining(game)).toBe(13.2);
  });

  it('restores deterministic generator and event results', () => {
    const state = { ...base(), rngState: 1 };
    expect(apply(state, { type: ACTIONS.WALK })).toEqual(apply(structuredClone(state), { type: ACTIONS.WALK }));
  });

  it('does not reroll on food, drink or path choices', () => {
    const state = { ...base(), energy: 50, hydration: 50 };
    expect(apply(state, { type: ACTIONS.EAT }).rngState).toBe(state.rngState);
    expect(apply(state, { type: ACTIONS.DRINK }).rngState).toBe(state.rngState);
  });

  it('limits event equipment to a relevant pending event and consumes first aid', () => {
    const ankle = { ...base(), pendingEvent: { id: 'ankle' } };
    expect(() => apply(ankle, { type: ACTIONS.USE_EQUIPMENT, equipment: 'rainJacket' })).toThrow(/not useful/i);
    const treated = apply(ankle, { type: ACTIONS.USE_EQUIPMENT, equipment: 'firstAid' });
    expect(treated.equipment.firstAid).toBe(false);
    expect(treated.pendingEvent).toBeNull();
  });

  it('requires darkness confirmation and enforces torch capacity', () => {
    const nearDark = { ...base(), elapsedMinutes: 470 };
    expect(walkingPreview(nearDark).afterDarkMinutes).toBe(25);
    expect(() => apply(nearDark, { type: ACTIONS.WALK })).toThrow(/confirm/i);
    const moved = apply(nearDark, { type: ACTIONS.WALK, confirmDark: true });
    expect(moved.torchMinutesRemaining).toBe(95);
    const stranded = { ...nearDark, torchMinutesRemaining: 20 };
    expect(walkingPreview(stranded).canWalk).toBe(false);
  });

  it('uses explicit abandonment precedence', () => {
    const ended = apply({ ...base(), energy: 0 }, { type: ACTIONS.ABANDON });
    expect(ended.outcome).toBe('abandoned');
  });

  it('produces both rescue and summit-safe-return terminal outcomes', () => {
    const exhausted = apply({ ...base(), energy: 1 }, { type: ACTIONS.WALK });
    expect(exhausted.outcome).toBe('rescue');
    const returningWinner = {
      ...base(), position: 'forest_gate', mode: 'return', summitReached: true,
      journey: ['pine_track'], stats: { ...base().stats, distanceTravelled: 12, ascentAchieved: 1260 },
    };
    expect(walk(returningWinner).outcome).toBe('summit_safe_return');
  });

  it('requires rescue when darkness leaves no legal movement', () => {
    const atSunset = { ...base(), elapsedMinutes: 480, torchMinutesRemaining: 35 };
    const stranded = apply(atSunset, { type: ACTIONS.WALK, confirmDark: true });
    expect(stranded.outcome).toBe('rescue');
  });

  it('rejects actions after completion and unresolved-event bypasses', () => {
    expect(() => apply({ ...base(), status: 'complete', outcome: 'rescue' }, { type: ACTIONS.EAT })).toThrow(/ended/i);
    expect(() => apply({ ...base(), pendingEvent: { id: 'fog' } }, { type: ACTIONS.DRINK })).toThrow(/pending event/i);
  });
});
