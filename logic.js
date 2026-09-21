// Pure, DOM-free game logic — unit-tested separately from rendering/input.

export function hit(ax, ay, bx, by, threshold) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy) <= threshold;
}

const SPAWN_INTERVAL_START = 1400; // ms, at t=0
const SPAWN_INTERVAL_FLOOR = 400; // ms, minimum once fully ramped
const SPAWN_RAMP_MS = 60000; // ms to go from start to floor

export function getSpawnInterval(elapsedMs) {
  const t = Math.min(elapsedMs / SPAWN_RAMP_MS, 1);
  return SPAWN_INTERVAL_START - t * (SPAWN_INTERVAL_START - SPAWN_INTERVAL_FLOOR);
}
