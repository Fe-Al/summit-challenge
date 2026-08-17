export const NODES = Object.freeze({
  carpark: Object.freeze({ id: 'carpark', name: 'Pine Hollow Car Park', elevation: 420 }),
  forest_gate: Object.freeze({ id: 'forest_gate', name: 'Forest Gate', elevation: 610 }),
  lower_junction: Object.freeze({ id: 'lower_junction', name: 'Heather Junction', elevation: 790 }),
  ridge_camp: Object.freeze({ id: 'ridge_camp', name: 'Fox Ridge', elevation: 1110 }),
  valley_camp: Object.freeze({ id: 'valley_camp', name: 'Juniper Valley', elevation: 960 }),
  upper_junction: Object.freeze({ id: 'upper_junction', name: 'Eagle Junction', elevation: 1280 }),
  summit: Object.freeze({ id: 'summit', name: 'Mount Aurora Summit', elevation: 1680 }),
});

export const SEGMENTS = Object.freeze([
  { id: 'pine_track', name: 'Pine Track', from: 'carpark', to: 'forest_gate', distance: 1.5, ascent: 190, descent: 0, minutes: 35, energy: 7, hydration: 6, terrainRisk: 0.08, exposure: 0.08 },
  { id: 'heather_walk', name: 'Heather Walk', from: 'forest_gate', to: 'lower_junction', distance: 1.3, ascent: 180, descent: 0, minutes: 35, energy: 8, hydration: 6, terrainRisk: 0.1, exposure: 0.12 },
  { id: 'ridge_scramble', name: 'Short Ridge Scramble', from: 'lower_junction', to: 'ridge_camp', distance: 1.4, ascent: 320, descent: 0, minutes: 48, energy: 14, hydration: 10, terrainRisk: 0.32, exposure: 0.38 },
  { id: 'valley_curve', name: 'Gentle Valley Curve', from: 'lower_junction', to: 'valley_camp', distance: 2.2, ascent: 170, descent: 0, minutes: 60, energy: 10, hydration: 9, terrainRisk: 0.1, exposure: 0.1 },
  { id: 'fox_traverse', name: 'Fox Ridge Traverse', from: 'ridge_camp', to: 'upper_junction', distance: 1.2, ascent: 170, descent: 0, minutes: 38, energy: 10, hydration: 8, terrainRisk: 0.22, exposure: 0.3 },
  { id: 'juniper_rise', name: 'Juniper Rise', from: 'valley_camp', to: 'upper_junction', distance: 1.7, ascent: 320, descent: 0, minutes: 55, energy: 11, hydration: 9, terrainRisk: 0.12, exposure: 0.12 },
  { id: 'summit_spur', name: 'Direct Summit Spur', from: 'upper_junction', to: 'summit', distance: 1.3, ascent: 400, descent: 0, minutes: 55, energy: 16, hydration: 11, terrainRisk: 0.38, exposure: 0.45 },
  { id: 'sheltered_zigzag', name: 'Sheltered Zigzag', from: 'upper_junction', to: 'summit', distance: 2.1, ascent: 400, descent: 0, minutes: 75, energy: 12, hydration: 11, terrainRisk: 0.14, exposure: 0.12 },
].map(Object.freeze));

export const SEGMENT_BY_ID = Object.freeze(Object.fromEntries(SEGMENTS.map((segment) => [segment.id, segment])));

export function outgoingSegments(nodeId) {
  return SEGMENTS.filter((segment) => segment.from === nodeId);
}

export function validateRoute() {
  const ids = new Set();
  for (const segment of SEGMENTS) {
    if (ids.has(segment.id) || !NODES[segment.from] || !NODES[segment.to] || segment.distance <= 0 || segment.minutes <= 0) return false;
    ids.add(segment.id);
  }
  return true;
}
