export const EVENTS = Object.freeze([
  Object.freeze({ id: 'fog', name: 'Fog bank', probability: 0.055, conditions: ['walk', 'rest'], effects: { minutes: 12, energy: -3 }, equipment: null, message: 'Fog slows your progress.' }),
  Object.freeze({ id: 'rain', name: 'Cold rain', probability: 0.06, conditions: ['walk', 'rest'], effects: { energy: -8, hydration: -2 }, equipment: 'rainJacket', mitigation: 0.35, message: 'Cold rain drains energy.' }),
  Object.freeze({ id: 'wind', name: 'Strong wind', probability: 0.05, conditions: ['walk'], effects: { minutes: 10, energy: -6 }, equipment: null, message: 'Strong wind makes the route harder.' }),
  Object.freeze({ id: 'ankle', name: 'Minor ankle pain', probability: 0.04, conditions: ['walk'], effects: { energy: -12, minutes: 8 }, equipment: 'firstAid', mitigation: 0.3, message: 'A minor ankle strain needs attention.' }),
  Object.freeze({ id: 'confusing_path', name: 'Confusing junction', probability: 0.035, conditions: ['walk'], effects: { minutes: 15, hydration: -4 }, equipment: null, message: 'You pause to verify a confusing trail marker.' }),
  Object.freeze({ id: 'favourable', name: 'Favourable weather', probability: 0.045, conditions: ['walk', 'rest'], effects: { energy: 7, hydration: 4 }, equipment: null, message: 'Cool, clear weather lifts your spirits.' }),
]);

export const EVENT_BY_ID = Object.freeze(Object.fromEntries(EVENTS.map((event) => [event.id, event])));
