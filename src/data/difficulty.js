export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    label: 'Easy', energy: 100, hydration: 100, food: 4, water: 4,
    daylightMinutes: 540, costMultiplier: 0.85, eventMultiplier: 0.75,
    eventSeverity: 0.8, restGain: 20, drinkGain: 35, eatGain: 28, scoreMultiplier: 0.85,
  }),
  normal: Object.freeze({
    label: 'Normal', energy: 92, hydration: 92, food: 3, water: 3,
    daylightMinutes: 480, costMultiplier: 1, eventMultiplier: 1,
    eventSeverity: 1, restGain: 16, drinkGain: 30, eatGain: 24, scoreMultiplier: 1,
  }),
  hard: Object.freeze({
    label: 'Hard', energy: 84, hydration: 84, food: 2, water: 2,
    daylightMinutes: 420, costMultiplier: 1.18, eventMultiplier: 1.25,
    eventSeverity: 1.25, restGain: 13, drinkGain: 25, eatGain: 20, scoreMultiplier: 1.3,
  }),
});

export const DIFFICULTY_IDS = Object.freeze(Object.keys(DIFFICULTIES));
