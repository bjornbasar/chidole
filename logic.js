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

// Unit vector pointing from (fromX,fromY) to (toX,toY). {0,0} for identical
// points, so callers don't have to special-case a div-by-zero.
export function direction(fromX, fromY, toX, toY) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return { x: 0, y: 0 };
  return { x: dx / dist, y: dy / dist };
}

// Index of the closest entity to (px,py) in a list of {x,y} objects, or -1
// if the list is empty.
export function nearestIndex(px, py, entities) {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < entities.length; i++) {
    const dx = entities[i].x - px;
    const dy = entities[i].y - py;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
