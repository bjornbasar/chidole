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

// Tiered spawn cadence: mostly "basic", escalating to "extra" after a
// 3-6-spawn basic streak, escalating further to "tank" after a 4-5-escalation
// extra streak. Counts/thresholds are explicit state so this stays pure -
// the caller rolls the next thresholds (Math.random()-derived) and passes
// them in; they're only consumed when a reset actually happens this call.
export function advanceSpawnTier(state, nextBasicTarget, nextExtraTarget) {
  let { basicCount, basicTarget, extraCount, extraTarget } = state;
  basicCount++;
  if (basicCount < basicTarget) {
    return { tier: "basic", state: { basicCount, basicTarget, extraCount, extraTarget } };
  }
  basicCount = 0;
  basicTarget = nextBasicTarget;
  extraCount++;
  if (extraCount < extraTarget) {
    return { tier: "extra", state: { basicCount, basicTarget, extraCount, extraTarget } };
  }
  extraCount = 0;
  extraTarget = nextExtraTarget;
  return { tier: "tank", state: { basicCount, basicTarget, extraCount, extraTarget } };
}

// Maps an aim direction to a frame index + horizontal flip for a 9-frame
// weapon rotation strip that only covers down(0) -> right(4) -> up(8) - the
// left half (NW/W/SW) reuses the right half's frames mirrored, since the
// source art only draws one side. Compass order matches atan2's winding
// (0=E, going clockwise in screen space where +y is down).
const AIM_FRAME_BY_COMPASS = [4, 2, 0, 2, 4, 6, 8, 6]; // E,SE,S,SW,W,NW,N,NE
const AIM_FLIP_BY_COMPASS = [1, 1, 1, -1, -1, -1, 1, 1];

export function aimFrame(dirX, dirY) {
  const angle = Math.atan2(dirY, dirX);
  const compass = Math.round(angle / (Math.PI / 4)) & 7;
  return { frame: AIM_FRAME_BY_COMPASS[compass], flip: AIM_FLIP_BY_COMPASS[compass] };
}

// HP bar color tier by remaining fraction: critical/mid/healthy.
export function hpBarColor(frac) {
  if (frac <= 0.25) return "red";
  if (frac <= 0.70) return "yellow";
  return "green";
}

// XP needed to advance FROM this level to the next — grows linearly so later
// levels take progressively longer, simple placeholder curve (tunable later).
export function xpThreshold(level) {
  return level * 10;
}
