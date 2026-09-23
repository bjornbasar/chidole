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

// Shared 8-way compass bucket (0=E, going clockwise in screen space where +y
// is down) that both aimFrame and quadrantBucket derive from — a single
// discretization step, so the weapon's rotation and its muzzle effect can
// never disagree about which of the 8 directions an aim vector belongs to
// (they used to fold the angle independently, with different boundaries,
// which could point the gun one way and flash a different reference).
function compassIndex(dirX, dirY) {
  const angle = Math.atan2(dirY, dirX);
  return Math.round(angle / (Math.PI / 4)) & 7;
}

// Maps an aim direction to a frame index + horizontal flip for a 9-frame
// weapon rotation strip that only covers down(0) -> right(4) -> up(8) - the
// left half (NW/W/SW) reuses the right half's frames mirrored, since the
// source art only draws one side.
const AIM_FRAME_BY_COMPASS = [4, 2, 0, 2, 4, 6, 8, 6]; // E,SE,S,SW,W,NW,N,NE
const AIM_FLIP_BY_COMPASS = [1, 1, 1, -1, -1, -1, 1, 1];

export function aimFrame(dirX, dirY) {
  const compass = compassIndex(dirX, dirY);
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

// Deterministic pool pick given a pre-rolled [0,1) float, so callers (and
// tests) control the randomness instead of this function calling
// Math.random() itself — same testability pattern as advanceSpawnTier.
export function pickFromPool(pool, randomFloat) {
  return pool[Math.floor(randomFloat * pool.length)];
}

// Fire-interval multiplier contract: higher rate = fires more often, so a
// higher rate must SHORTEN the interval (divide, not multiply).
export function fireIntervalFor(baseMs, rate) {
  return baseMs / rate;
}

// Maps the SAME 8-way compass bucket aimFrame() uses to one of the effect
// kit's direction-reference sprites, so a weapon's muzzle effect always
// agrees with its own rotation (deriving from compassIndex, not an
// independent angle-fold). Only the 0° and 45° samples are used — the kit's
// *_1/_3 files (0°/45° from the +X axis, confirmed against the actual art);
// *_2 (30°) doesn't hold up under these reflections and is parked for the
// finer-grained #33 (16-direction facing) work instead.
//
// The 0°/45° samples alone cover all 8 compass directions via reflections
// only (no true rotation needed): flipX/flipY reach the axis-mirrored
// directions as usual, and `transpose` (swap dirX/dirY, i.e. reflect across
// the 45° diagonal) turns the 0° sample into a 90°-equivalent — used only
// for the exactly-vertical S/N directions, which the 0°/45° pair can't
// otherwise reach.
const EFFECT_SAMPLE_BY_COMPASS = [0, 1, 0, 1, 0, 1, 0, 1]; // E,SE,S,SW,W,NW,N,NE -> 0°,45°,0°,45°,0°,45°,0°,45°
const EFFECT_FLIPY_BY_COMPASS = [1, 1, 1, 1, 1, -1, -1, -1];
const EFFECT_TRANSPOSE_BY_COMPASS = [false, false, true, false, false, false, true, false]; // only S, N

export function quadrantBucket(dirX, dirY) {
  const compass = compassIndex(dirX, dirY);
  return {
    index: EFFECT_SAMPLE_BY_COMPASS[compass],
    flipX: AIM_FLIP_BY_COMPASS[compass],
    flipY: EFFECT_FLIPY_BY_COMPASS[compass],
    transpose: EFFECT_TRANSPOSE_BY_COMPASS[compass],
  };
}
