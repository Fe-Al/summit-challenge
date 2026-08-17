import { DIFFICULTIES, DIFFICULTY_IDS } from './data/difficulty.js';
import { EVENTS, EVENT_BY_ID } from './data/events.js';
import { NODES, SEGMENTS, SEGMENT_BY_ID, outgoingSegments } from './data/route.js';

export const GAME_SCHEMA_VERSION = 1;
export const OUTCOMES = Object.freeze(['summit_safe_return', 'safe_return', 'rescue', 'abandoned']);
export const ACTIONS = Object.freeze({
  CHOOSE_PATH: 'choose_path', WALK: 'walk', REST: 'rest', EAT: 'eat', DRINK: 'drink',
  USE_EQUIPMENT: 'use_equipment', RESOLVE_EVENT: 'resolve_event', TURN_BACK: 'turn_back', ABANDON: 'abandon',
});

const clamp = (value) => Math.min(100, Math.max(0, Math.round(value * 10) / 10));
const round = (value) => Math.round(value * 10) / 10;

export function createSeed(cryptoObject = globalThis.crypto) {
  const values = new Uint32Array(1);
  cryptoObject.getRandomValues(values);
  return values[0] || 0x6d2b79f5;
}

export function advanceGenerator(state) {
  const nextState = (Math.imul(1664525, state >>> 0) + 1013904223) >>> 0;
  return { state: nextState, value: nextState / 4294967296 };
}

export function createGame({ profileId, difficulty = 'normal', seed = createSeed(), id = crypto.randomUUID(), now = new Date().toISOString() }) {
  if (!DIFFICULTY_IDS.includes(difficulty)) throw new Error('Unknown difficulty.');
  const config = DIFFICULTIES[difficulty];
  return {
    schemaVersion: GAME_SCHEMA_VERSION, id, profileId, difficulty, status: 'active', outcome: null,
    startedAt: now, updatedAt: now, seed: seed >>> 0, rngState: seed >>> 0,
    position: 'carpark', mode: 'outbound', journey: [], selectedSegmentId: null,
    summitReached: false, turnedBack: false, pendingEvent: null,
    energy: config.energy, hydration: config.hydration, food: config.food, water: config.water,
    daylightMinutes: config.daylightMinutes, elapsedMinutes: 0, torchMinutesRemaining: 120,
    equipment: { rainJacket: true, firstAid: true }, weather: 'Clear',
    stats: { distanceTravelled: 0, ascentAchieved: 0, minutesMovedAfterDark: 0, rests: 0, events: 0 },
    messages: ['You are ready at Pine Hollow Car Park. Reach the summit and return safely.'],
  };
}

function nextSegment(state) {
  if (state.mode === 'return') {
    const id = state.journey[state.journey.length - 1];
    return id ? SEGMENT_BY_ID[id] : null;
  }
  if (state.selectedSegmentId) return SEGMENT_BY_ID[state.selectedSegmentId];
  const choices = outgoingSegments(state.position);
  return choices.length === 1 ? choices[0] : null;
}

export function availablePathChoices(state) {
  if (state.status !== 'active' || state.pendingEvent || state.mode !== 'outbound') return [];
  const choices = outgoingSegments(state.position);
  return choices.length > 1 && !state.selectedSegmentId ? choices : [];
}

export function walkingPreview(state) {
  const segment = nextSegment(state);
  if (!segment) return null;
  const daylightLeft = Math.max(0, state.daylightMinutes - state.elapsedMinutes);
  const afterDarkMinutes = Math.max(0, segment.minutes - daylightLeft);
  return {
    segment,
    reverse: state.mode === 'return',
    afterDarkMinutes,
    requiresDarkConfirmation: afterDarkMinutes > 0,
    canWalk: afterDarkMinutes <= state.torchMinutesRemaining,
  };
}

function shortestDistance(from, target = 'summit') {
  if (from === target) return 0;
  const distances = { [from]: 0 };
  const unsettled = new Set(Object.keys(NODES));
  while (unsettled.size) {
    let current = null;
    for (const id of unsettled) if (distances[id] !== undefined && (current === null || distances[id] < distances[current])) current = id;
    if (current === null) break;
    unsettled.delete(current);
    if (current === target) return distances[current];
    for (const segment of outgoingSegments(current)) {
      const candidate = distances[current] + segment.distance;
      if (distances[segment.to] === undefined || candidate < distances[segment.to]) distances[segment.to] = candidate;
    }
  }
  return Infinity;
}

export function estimatedDistanceRemaining(state) {
  const traversed = state.journey.reduce((sum, id) => sum + SEGMENT_BY_ID[id].distance, 0);
  if (state.mode === 'return') return round(traversed);
  if (state.position === 'summit') return round(traversed);
  if (state.selectedSegmentId) {
    const selected = SEGMENT_BY_ID[state.selectedSegmentId];
    const onward = shortestDistance(selected.to);
    const outbound = selected.distance + onward;
    return round(outbound + traversed + outbound);
  }
  const outbound = shortestDistance(state.position);
  return round(outbound + traversed + outbound);
}

function withMessage(state, message) {
  return { ...state, messages: [...state.messages.slice(-5), message] };
}

function complete(state, outcome, message) {
  return withMessage({ ...state, status: 'complete', outcome, pendingEvent: null }, message);
}

function checkTerminal(state) {
  if (state.outcome) return state;
  if (state.energy <= 0 || state.hydration <= 0) return complete(state, 'rescue', 'Rescue is required because a vital resource reached zero.');
  if (state.position === 'carpark' && state.stats.distanceTravelled > 0) {
    return complete(state, state.summitReached ? 'summit_safe_return' : 'safe_return', state.summitReached ? 'You reached the summit and returned safely!' : 'You returned safely without reaching the summit.');
  }
  const preview = walkingPreview(state);
  if (!state.pendingEvent && state.position !== 'carpark' && preview && !preview.canWalk) {
    return complete(state, 'rescue', 'Rescue is required: the remaining torch time cannot cover the next movement after dark.');
  }
  return state;
}

function rollEvent(state, actionType) {
  const generated = advanceGenerator(state.rngState);
  let next = { ...state, rngState: generated.state };
  const eligible = EVENTS.filter((event) => event.conditions.includes(actionType));
  const multiplier = DIFFICULTIES[state.difficulty].eventMultiplier;
  let cursor = generated.value;
  for (const event of eligible) {
    cursor -= event.probability * multiplier;
    if (cursor < 0) {
      next = { ...next, pendingEvent: { id: event.id }, stats: { ...next.stats, events: next.stats.events + 1 } };
      return withMessage(next, `${event.name}: ${event.message} Choose how to respond.`);
    }
  }
  return withMessage(next, 'No unexpected event occurred.');
}

function applyEvent(state, mitigated) {
  const event = EVENT_BY_ID[state.pendingEvent?.id];
  if (!event) throw new Error('There is no event to resolve.');
  const severity = DIFFICULTIES[state.difficulty].eventSeverity;
  const factor = mitigated ? (event.mitigation ?? 1) : 1;
  const effects = event.effects;
  const next = {
    ...state,
    energy: clamp(state.energy + (effects.energy ?? 0) * severity * factor),
    hydration: clamp(state.hydration + (effects.hydration ?? 0) * severity * factor),
    elapsedMinutes: round(state.elapsedMinutes + Math.max(0, (effects.minutes ?? 0) * severity * factor)),
    weather: event.id === 'favourable' ? 'Clear and calm' : event.name,
    pendingEvent: null,
  };
  return checkTerminal(withMessage(next, mitigated ? `${event.name} resolved with equipment; its effects were reduced.` : `${event.name} resolved. Resources and time were updated.`));
}

function assertAction(state) {
  if (!state || state.status !== 'active' || state.outcome) throw new Error('The game has already ended.');
}

export function applyAction(state, action, now = new Date().toISOString()) {
  assertAction(state);
  if (!action || typeof action.type !== 'string') throw new Error('Invalid action.');
  if (state.pendingEvent && ![ACTIONS.RESOLVE_EVENT, ACTIONS.USE_EQUIPMENT].includes(action.type)) throw new Error('Resolve the pending event first.');
  let next;
  switch (action.type) {
    case ACTIONS.CHOOSE_PATH: {
      const choice = availablePathChoices(state).find((segment) => segment.id === action.segmentId);
      if (!choice) throw new Error('That path is not available.');
      next = withMessage({ ...state, selectedSegmentId: choice.id }, `${choice.name} selected. Choosing a path does not advance time.`);
      break;
    }
    case ACTIONS.WALK: {
      const preview = walkingPreview(state);
      if (!preview) throw new Error('Choose a path before continuing.');
      if (!preview.canWalk) throw new Error('There is not enough torch time for this segment.');
      if (preview.requiresDarkConfirmation && action.confirmDark !== true) throw new Error('Confirm movement after dark before continuing.');
      const segment = preview.segment;
      const config = DIFFICULTIES[state.difficulty];
      const riskCost = 1 + segment.terrainRisk * 0.2 + segment.exposure * 0.15;
      const destination = preview.reverse ? segment.from : segment.to;
      const journey = preview.reverse ? state.journey.slice(0, -1) : [...state.journey, segment.id];
      const summitReached = state.summitReached || destination === 'summit';
      const mode = summitReached || state.mode === 'return' ? 'return' : 'outbound';
      next = {
        ...state, position: destination, journey, summitReached, mode, selectedSegmentId: null,
        energy: clamp(state.energy - segment.energy * config.costMultiplier * riskCost),
        hydration: clamp(state.hydration - segment.hydration * config.costMultiplier),
        elapsedMinutes: state.elapsedMinutes + segment.minutes,
        torchMinutesRemaining: state.torchMinutesRemaining - preview.afterDarkMinutes,
        stats: {
          ...state.stats,
          distanceTravelled: round(state.stats.distanceTravelled + segment.distance),
          ascentAchieved: round(state.stats.ascentAchieved + (preview.reverse ? 0 : segment.ascent)),
          minutesMovedAfterDark: state.stats.minutesMovedAfterDark + preview.afterDarkMinutes,
        },
      };
      next = withMessage(next, `${preview.reverse ? 'Returned along' : 'Completed'} ${segment.name}: ${segment.distance.toFixed(1)} km, ${segment.minutes} minutes.`);
      next = checkTerminal(next);
      if (!next.outcome) next = rollEvent(next, 'walk');
      break;
    }
    case ACTIONS.REST: {
      if (state.elapsedMinutes >= state.daylightMinutes) throw new Error('You cannot rest after sunset.');
      const config = DIFFICULTIES[state.difficulty];
      next = { ...state, elapsedMinutes: state.elapsedMinutes + 20, energy: clamp(state.energy + config.restGain), hydration: clamp(state.hydration - 3 * config.costMultiplier), stats: { ...state.stats, rests: state.stats.rests + 1 } };
      next = rollEvent(withMessage(next, `Rested for 20 minutes: energy +${config.restGain}, with a small hydration cost.`), 'rest');
      break;
    }
    case ACTIONS.EAT: {
      if (state.food <= 0) throw new Error('No food rations remain.');
      if (state.energy >= 100) throw new Error('Energy is already full.');
      const gain = DIFFICULTIES[state.difficulty].eatGain;
      next = withMessage({ ...state, food: state.food - 1, energy: clamp(state.energy + gain) }, `Ate one ration and restored ${gain} energy.`);
      break;
    }
    case ACTIONS.DRINK: {
      if (state.water <= 0) throw new Error('No water portions remain.');
      if (state.hydration >= 100) throw new Error('Hydration is already full.');
      const gain = DIFFICULTIES[state.difficulty].drinkGain;
      next = withMessage({ ...state, water: state.water - 1, hydration: clamp(state.hydration + gain) }, `Drank one water portion and restored ${gain} hydration.`);
      break;
    }
    case ACTIONS.TURN_BACK:
      if (state.position === 'carpark' || state.position === 'summit' || state.mode === 'return' || state.journey.length === 0) throw new Error('You cannot turn back here.');
      next = withMessage({ ...state, mode: 'return', turnedBack: true, selectedSegmentId: null }, 'You turned back. The return follows your actual route in reverse.');
      break;
    case ACTIONS.USE_EQUIPMENT: {
      const event = EVENT_BY_ID[state.pendingEvent?.id];
      if (!event || event.equipment !== action.equipment) throw new Error('That equipment is not useful right now.');
      if (action.equipment === 'rainJacket' && !state.equipment.rainJacket) throw new Error('The rain jacket is unavailable.');
      if (action.equipment === 'firstAid' && !state.equipment.firstAid) throw new Error('The first-aid kit has already been used.');
      const equipment = action.equipment === 'firstAid' ? { ...state.equipment, firstAid: false } : state.equipment;
      next = applyEvent({ ...state, equipment }, true);
      break;
    }
    case ACTIONS.RESOLVE_EVENT:
      next = applyEvent(state, false);
      break;
    case ACTIONS.ABANDON:
      next = complete(state, 'abandoned', 'You abandoned the route. This result is not leaderboard eligible.');
      break;
    default:
      throw new Error('Unknown action.');
  }
  return { ...checkTerminal(next), updatedAt: now };
}

export function validateGame(value, expectedProfileId = null) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Invalid saved game object.');
  const allowed = ['schemaVersion', 'id', 'profileId', 'difficulty', 'status', 'outcome', 'startedAt', 'updatedAt', 'seed', 'rngState', 'position', 'mode', 'journey', 'selectedSegmentId', 'summitReached', 'turnedBack', 'pendingEvent', 'energy', 'hydration', 'food', 'water', 'daylightMinutes', 'elapsedMinutes', 'torchMinutesRemaining', 'equipment', 'weather', 'stats', 'messages'];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Saved game contains unsupported fields.');
  if (value.schemaVersion !== GAME_SCHEMA_VERSION) throw new Error('Unsupported saved-game version.');
  if (typeof value.id !== 'string' || value.id.length < 8 || value.id.length > 100 || typeof value.profileId !== 'string' || value.profileId.length < 8 || value.profileId.length > 100 || (expectedProfileId && value.profileId !== expectedProfileId)) throw new Error('Invalid game ownership.');
  if (typeof value.startedAt !== 'string' || Number.isNaN(Date.parse(value.startedAt)) || typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt))) throw new Error('Invalid game timestamp.');
  if (!DIFFICULTY_IDS.includes(value.difficulty) || !['active', 'complete'].includes(value.status)) throw new Error('Invalid game status.');
  if (!NODES[value.position] || !['outbound', 'return'].includes(value.mode)) throw new Error('Invalid route state.');
  if (!Array.isArray(value.journey) || value.journey.some((id) => !SEGMENT_BY_ID[id])) throw new Error('Invalid journey.');
  let journeyNode = 'carpark';
  for (const id of value.journey) { const segment = SEGMENT_BY_ID[id]; if (segment.from !== journeyNode) throw new Error('Impossible journey order.'); journeyNode = segment.to; }
  if (value.journey.length && journeyNode !== value.position) throw new Error('Journey does not match the current position.');
  if (!value.journey.length && value.position !== 'carpark') throw new Error('Journey does not reach the current position.');
  for (const key of ['energy', 'hydration']) if (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 100) throw new Error(`Invalid ${key}.`);
  for (const key of ['food', 'water', 'elapsedMinutes', 'daylightMinutes', 'torchMinutesRemaining']) if (!Number.isFinite(value[key]) || value[key] < 0) throw new Error(`Invalid ${key}.`);
  const config = DIFFICULTIES[value.difficulty];
  if (!Number.isInteger(value.food) || value.food > config.food || !Number.isInteger(value.water) || value.water > config.water || value.daylightMinutes !== config.daylightMinutes || value.torchMinutesRemaining > 120) throw new Error('Invalid bounded resource state.');
  if (value.selectedSegmentId !== null && !SEGMENT_BY_ID[value.selectedSegmentId]) throw new Error('Invalid selected path.');
  if (value.selectedSegmentId && (value.mode !== 'outbound' || SEGMENT_BY_ID[value.selectedSegmentId].from !== value.position)) throw new Error('Selected path does not start here.');
  if (value.pendingEvent !== null && (!EVENT_BY_ID[value.pendingEvent?.id] || Object.keys(value.pendingEvent).some((key) => key !== 'id'))) throw new Error('Invalid pending event.');
  if (value.outcome !== null && !OUTCOMES.includes(value.outcome)) throw new Error('Invalid outcome.');
  if (typeof value.summitReached !== 'boolean' || typeof value.turnedBack !== 'boolean' || !Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff || !Number.isInteger(value.rngState) || value.rngState < 0 || value.rngState > 0xffffffff) throw new Error('Invalid deterministic state.');
  if (value.summitReached && value.mode !== 'return' || value.mode === 'return' && !value.summitReached && !value.turnedBack) throw new Error('Inconsistent route direction.');
  if (!value.equipment || Object.keys(value.equipment).some((key) => !['rainJacket', 'firstAid'].includes(key)) || typeof value.equipment.rainJacket !== 'boolean' || typeof value.equipment.firstAid !== 'boolean') throw new Error('Invalid equipment state.');
  const statKeys = ['distanceTravelled', 'ascentAchieved', 'minutesMovedAfterDark', 'rests', 'events'];
  if (!value.stats || Object.keys(value.stats).some((key) => !statKeys.includes(key)) || statKeys.some((key) => !Number.isFinite(value.stats[key]) || value.stats[key] < 0)) throw new Error('Invalid game statistics.');
  if (!Array.isArray(value.messages) || value.messages.length > 6 || value.messages.some((message) => typeof message !== 'string' || message.length > 500) || typeof value.weather !== 'string' || value.weather.length > 80) throw new Error('Invalid game messages.');
  if ((value.status === 'complete') !== Boolean(value.outcome)) throw new Error('Inconsistent terminal state.');
  return {
    schemaVersion: GAME_SCHEMA_VERSION, id: value.id, profileId: value.profileId, difficulty: value.difficulty, status: value.status, outcome: value.outcome,
    startedAt: value.startedAt, updatedAt: value.updatedAt, seed: value.seed, rngState: value.rngState,
    position: value.position, mode: value.mode, journey: [...value.journey], selectedSegmentId: value.selectedSegmentId,
    summitReached: value.summitReached, turnedBack: value.turnedBack, pendingEvent: value.pendingEvent ? { id: value.pendingEvent.id } : null,
    energy: value.energy, hydration: value.hydration, food: value.food, water: value.water, daylightMinutes: value.daylightMinutes,
    elapsedMinutes: value.elapsedMinutes, torchMinutesRemaining: value.torchMinutesRemaining,
    equipment: { rainJacket: value.equipment.rainJacket, firstAid: value.equipment.firstAid }, weather: value.weather,
    stats: Object.fromEntries(statKeys.map((key) => [key, value.stats[key]])), messages: [...value.messages],
  };
}
