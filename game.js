import { hit, getSpawnInterval, direction, nearestIndex, advanceSpawnTier, aimFrame, hpBarColor, xpThreshold, fireIntervalFor, quadrantBucket } from "./logic.js";

// --- Setup ---
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = 360;
canvas.height = 640;
ctx.imageSmoothingEnabled = false; // keep pixel art crisp, not blurred

const scoreEl = document.getElementById("score");
const hpFillEl = document.getElementById("hpFill");
const xpFillEl = document.getElementById("xpFill");
const levelEl = document.getElementById("level");
const overlay = document.getElementById("overlay");
const weaponChoiceButtons = document.querySelectorAll(".weapon-choice");

const FRAME = 48; // all character/enemy sprite frames are 48x48px
const TILE = 32; // location floor tile size
const PLAYER_SPEED = 200; // px/sec
const FIRE_INTERVAL_BASE = 220; // ms between auto-fired shots, before level-up effects
const RANGE_UNIT_PX = 24; // scales #30's abstract Range column to world px — placeholder, tune after visual testing
const LEVEL_UP_FIRE_RATE_MUL = 0.9; // each level-up: 10% faster firing (placeholder effect, real skills replace this)
const ENEMY_SPEED = 90; // px/sec
const HIT_RADIUS = FRAME * 0.35; // approximates the sprites' visible silhouette, not their full padded frame
const MAX_LIVES = 3;

// --- Sprite loading ---
function loadSprite(src, frameCount, frameW = FRAME, frameH = FRAME) {
  const img = new Image();
  img.src = src;
  return { img, frameCount, frameW, frameH, loaded: false };
}
const sprites = {
  hpBarBack: loadSprite("assets/hpbar_back.png", 1, 16, 2),
  hpBarRed: loadSprite("assets/hpbar_red.png", 1, 16, 2),
};
for (const s of Object.values(sprites)) {
  s.img.onload = () => { s.loaded = true; };
}

// The kit ships 3 directional player sprites (down/side/up); "side" is
// mirrored horizontally for left vs. right instead of needing a 4th sprite.
const playerSprites = {
  down: loadSprite("assets/player_walk_down.png", 4),
  side: loadSprite("assets/player_walk_side.png", 4),
  up: loadSprite("assets/player_walk_up.png", 4),
};
for (const s of Object.values(playerSprites)) {
  s.img.onload = () => { s.loaded = true; };
}

const WEAPON_OFFSET = HIT_RADIUS + 8; // beyond the player's visible silhouette edge, not from dead-center

// Starter pool is {1, 3, 5} — the 3 ranged weapons that are hitscan/effect-only
// per #30 (weapon 4 is an orbiter now, #61, no longer a plain starter gun).
// Only these 3 weapons' data is defined so far; the rest of the 9-weapon
// roster comes in later stories (#35/#60/#61) as their own increments.
// Each effect is 2 direction-variant sprites [0°, 45°] indexed by
// quadrantBucket() — same fold-and-mirror convention as the projectile/laser
// sprites (#60). The kit's 30° sample exists on disk
// (assets/effect{family}_30.png) but is unused until #33 (16-direction
// facing) needs finer-grained references — see quadrantBucket()'s own
// comment for why 0°/45° alone already cover all 8 compass directions.
function effectSprites(family) {
  return ["0", "45"].map((angle) => loadSprite(`assets/effect${family}_${angle}.png`, 6, 96, 96));
}
const WEAPON_DATA = {
  1: { sprite: loadSprite("assets/weapon1.png", 9), effect: effectSprites(1), range: 8 * RANGE_UNIT_PX, rate: 1 },
  3: { sprite: loadSprite("assets/weapon3.png", 9), effect: effectSprites(4), range: 5 * RANGE_UNIT_PX, rate: 0.7 },
  5: { sprite: loadSprite("assets/weapon5.png", 9), effect: effectSprites(3), range: 7 * RANGE_UNIT_PX, rate: 1 },
};
const STARTER_POOL = [1, 3, 5];
const WEAPON_SLOT_CAP = 4;
for (const w of Object.values(WEAPON_DATA)) {
  for (const s of [w.sprite, ...w.effect]) {
    s.img.onload = () => { s.loaded = true; };
  }
}

const playerDeathSprites = {
  down: loadSprite("assets/player_death_down.png", 4),
  side: loadSprite("assets/player_death_side.png", 4),
  up: loadSprite("assets/player_death_up.png", 4),
};
for (const s of Object.values(playerDeathSprites)) {
  s.img.onload = () => { s.loaded = true; };
}

const ENEMY_TYPES = 6;
const enemySprites = [];
const enemyDeathSprites = [];
for (let i = 1; i <= ENEMY_TYPES; i++) {
  const s = loadSprite(`assets/enemy${i}_run.png`, 6);
  s.img.onload = () => { s.loaded = true; };
  enemySprites.push(s);

  const d = loadSprite(`assets/enemy${i}_death.png`, 4);
  d.img.onload = () => { d.loaded = true; };
  enemyDeathSprites.push(d);
}

const DEATH_FRAME_MS = 120;
const DEATH_TOTAL_MS = DEATH_FRAME_MS * 4;
const MUZZLE_EFFECT_FRAME_MS = 90;
const MUZZLE_EFFECT_TOTAL_MS = MUZZLE_EFFECT_FRAME_MS * 6; // effect sprites are 6-frame strips
// The kit's 0° and 45° effect samples aren't laid out the same way — their
// true origin (frame 0's near-invisible starting dot, confirmed by bbox
// across all 3 effect families) sits at a different sprite-pixel coordinate
// in each, indexed by quadrantBucket()'s `index` (0=0° sample, 1=45°).
const MUZZLE_EFFECT_ORIGIN = [{ x: 1, y: 48 }, { x: 12, y: 12 }];
const HIT_FLASH_MS = 120; // non-lethal hits briefly show the death sprite's frame 0 (a "flinch" pose)
const PLAYER_INVULN_MS = 800; // brief i-frames after taking a hit, so a cluster can't drain lives in one frame

// The 6 enemy types are two parallel families of 3 (green: 1-3, pink: 4-6),
// each following the same basic -> extra -> tank tier, so both families play
// identically at a given tier despite the different sprite/color.
const BASIC = { hp: 1, speedMul: 1.2, xpValue: 1, xpSprite: "basic" };
const EXTRA = { hp: 2, speedMul: 1.0, xpValue: 2, xpSprite: "extra" };
const TANK = { hp: 4, speedMul: 0.7, xpValue: 5, xpSprite: "tank" };
const ENEMY_STATS = [
  BASIC, EXTRA, TANK, // green family: types 1, 2, 3
  BASIC, EXTRA, TANK, // pink family: types 4, 5, 6
];
// Type index pool per tier — a family (green/pink) is picked at random
// within whichever tier advanceSpawnTier() calls for.
const TIER_TYPE_INDICES = { basic: [0, 3], extra: [1, 4], tank: [2, 5] };

function randomBasicTarget() { return 3 + Math.floor(Math.random() * 4); } // 3-6
function randomExtraTarget() { return 4 + Math.floor(Math.random() * 2); } // 4-5

const xpSprites = {
  basic: loadSprite("assets/xp_basic.png", 1, 5, 5),
  extra: loadSprite("assets/xp_extra.png", 1, 7, 7),
  tank: loadSprite("assets/xp_tank.png", 1, 10, 10),
};
for (const s of Object.values(xpSprites)) {
  s.img.onload = () => { s.loaded = true; };
}
const XP_PICKUP_RADIUS = 50; // plain proximity pickup, no magnet yet
const XP_COLLECT_MS = 220; // absorb animation duration once picked up

const floorTile = new Image();
let floorTileLoaded = false;
floorTile.onload = () => { floorTileLoaded = true; };
floorTile.src = "assets/floor_tile.png";

// The world scrolls under a screen-centered player: floor tiles are drawn on
// a world-space grid, offset into screen space by the camera (player) position.
function drawFloor() {
  if (!floorTileLoaded) return;
  const startWorldX = Math.floor((player.x - canvas.width / 2) / TILE) * TILE;
  const startWorldY = Math.floor((player.y - canvas.height / 2) / TILE) * TILE;
  for (let wy = startWorldY; wy < player.y + canvas.height / 2; wy += TILE) {
    for (let wx = startWorldX; wx < player.x + canvas.width / 2; wx += TILE) {
      const s = toScreen(wx, wy);
      ctx.drawImage(floorTile, s.x, s.y, TILE, TILE);
    }
  }
}

// World-space position -> screen-space position, given the player (camera) is
// always drawn at the center of the canvas.
function toScreen(worldX, worldY) {
  return { x: worldX - player.x + canvas.width / 2, y: worldY - player.y + canvas.height / 2 };
}

function setLivesDisplay(n) {
  const frac = Math.max(0, n) / MAX_LIVES;
  hpFillEl.style.transform = `scaleX(${frac})`;
  hpFillEl.src = `assets/hpbar_${hpBarColor(frac)}.png`;
}

function setXpDisplay(n) {
  xpFillEl.style.transform = `scaleX(${n / xpThreshold(level)})`;
}

function setLevelDisplay() {
  levelEl.textContent = level;
}

// Crosses as many level thresholds as the XP gain warrants (usually one, but
// a big pickup could cross more), applying the placeholder fire-rate effect
// each time. Real per-level choices replace this in the Skills stories.
function checkLevelUp() {
  while (xp >= xpThreshold(level)) {
    xp -= xpThreshold(level);
    level++;
    fireRateMul *= LEVEL_UP_FIRE_RATE_MUL;
    setLevelDisplay();
  }
  setXpDisplay(xp);
}

function drawSprite(sprite, x, y, elapsedMs, frameDurationMs = 120, flip = 1, scale = 1, flipY = 1, origin = null, transpose = false) {
  if (!sprite.loaded) return;
  const { frameW, frameH, frameCount } = sprite;
  const frame = Math.floor(elapsedMs / frameDurationMs) % frameCount;
  drawSpriteFrame(sprite, frame, x, y, flip, scale, flipY, origin, transpose);
}

// Draws one explicit frame (no time-based animation) — used for sprites whose
// frame is chosen by state (aim direction, a held flinch pose) rather than elapsed time.
// flipY mirrors vertically too, for the quadrant-folded direction sprites (#60).
// origin ({x,y} sprite-pixel coords, before flip/scale) is where (x,y) sits
// within the frame — null (default) is frame-center, used by everything
// except the muzzle-effect sprites, whose burst art isn't centered in its
// own frame, and whose exact origin differs per direction sample (the 0° and
// 45° effect art aren't laid out the same way — a single fixed fraction
// doesn't fit both, hence explicit per-sample pixel coordinates instead).
// transpose swaps the local x/y axes (a reflection across the 45° diagonal,
// applied before flip/scale) — how quadrantBucket() turns the 0° effect
// sample into a 90°-equivalent for the exactly-vertical S/N directions,
// since flip alone can't reach 90° from a 0° reference.
function drawSpriteFrame(sprite, frame, x, y, flip = 1, scale = 1, flipY = 1, origin = null, transpose = false) {
  if (!sprite.loaded) return;
  const { frameW, frameH } = sprite;
  const originX = origin ? origin.x : frameW / 2;
  const originY = origin ? origin.y : frameH / 2;
  ctx.save();
  ctx.translate(x, y);
  // canvas applies the LAST-called transform to the coordinates FIRST, so
  // scale must be called before transform(transpose) here — otherwise the
  // flip is applied before the axis-swap and gets silently cancelled out
  // (this is exactly what made a "north" aim render a "south" effect).
  ctx.scale(flip * scale, flipY * scale);
  if (transpose) ctx.transform(0, 1, 1, 0, 0, 0);
  ctx.drawImage(
    sprite.img,
    frame * frameW, 0, frameW, frameH,
    -originX, -originY, frameW, frameH
  );
  ctx.restore();
}

// Small floating bar (back plate + proportional fill), drawn at an explicit
// pixel size — used for enemy HP bars above multi-hit enemies.
function drawBar(backSprite, fillSprite, x, y, w, h, frac) {
  if (backSprite.loaded) ctx.drawImage(backSprite.img, x - w / 2, y, w, h);
  if (fillSprite.loaded && frac > 0) ctx.drawImage(fillSprite.img, x - w / 2, y, w * frac, h);
}

// --- Play area ---
// player.x/y is the player's WORLD position (also the camera position, since
// the player sprite is always drawn at screen center). Enemies/muzzle
// effects are world-space too; only draw() converts to screen space.
const player = { x: 0, y: 0 };
let facing = "down"; // "down" | "up" | "side" — holds last direction while idle
let facingFlip = 1; // 1 = facing right, -1 = mirrored (facing left)
let aimDir = { x: 0, y: 1 }; // weapon aim direction — holds last target direction, not movement
let playerDying = false;
let playerDeathStart = 0;
let playerHitFlashUntil = 0;
let playerInvulnUntil = 0;
// Runtime-equipped weapons — static config (sprite/effect/range/rate) stays
// in WEAPON_DATA, keyed by id; this holds only per-instance state. Up to
// WEAPON_SLOT_CAP entries (#34's 4-slot cap) — only ever 1 in practice until
// #31 (level-up "new weapon" pick) ships, but each fires independently on
// its own cooldown, gated by its own range, all sharing the same aimDir/target.
let equippedWeapons = [];
let fireRateMul = 1; // compounds down each level-up (#'s were baked into a single fireInterval before multiple weapons existed)
let enemies = [];
let xpOrbs = [];
let xp = 0;
let level = 1;
let spawnAccum = 0;
let spawnTierState = { basicCount: 0, basicTarget: randomBasicTarget(), extraCount: 0, extraTarget: randomExtraTarget() };

let score = 0;
let lives = MAX_LIVES;
let running = false;
let gameOver = false;
let startTime = 0;
let lastTs = 0;

// --- Input handling ---
const keys = {};
document.addEventListener("keydown", (e) => { keys[e.key] = true; });
document.addEventListener("keyup", (e) => { keys[e.key] = false; });

function isDown(...names) {
  return names.some((n) => keys[n]);
}

// Click-and-hold: move toward the cursor instead of/alongside the keyboard.
// The player is always screen-centered, so "toward the cursor" is just the
// direction from the canvas center to the current mouse position.
let mouseDown = false;
let mouseX = canvas.width / 2;
let mouseY = canvas.height / 2;

function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}
canvas.addEventListener("mousedown", (e) => {
  mouseDown = true;
  const p = canvasPos(e);
  mouseX = p.x;
  mouseY = p.y;
});
canvas.addEventListener("mousemove", (e) => {
  if (!mouseDown) return;
  const p = canvasPos(e);
  mouseX = p.x;
  mouseY = p.y;
});
window.addEventListener("mouseup", () => { mouseDown = false; });

// Random world-space point just outside one of the four edges of the current
// viewport (relative to the player, since the world scrolls with them), with
// a random enemy type (sprite index) for visual variety.
function spawnEnemy(half) {
  const edge = Math.floor(Math.random() * 4);
  const { tier, state } = advanceSpawnTier(spawnTierState, randomBasicTarget(), randomExtraTarget());
  spawnTierState = state;
  const pool = TIER_TYPE_INDICES[tier];
  const typeIndex = pool[Math.floor(Math.random() * pool.length)];
  const halfW = canvas.width / 2;
  const halfH = canvas.height / 2;
  let pos;
  switch (edge) {
    case 0: pos = { x: player.x + (Math.random() * canvas.width - halfW), y: player.y - halfH - half }; break;
    case 1: pos = { x: player.x + halfW + half, y: player.y + (Math.random() * canvas.height - halfH) }; break;
    case 2: pos = { x: player.x + (Math.random() * canvas.width - halfW), y: player.y + halfH + half }; break;
    default: pos = { x: player.x - halfW - half, y: player.y + (Math.random() * canvas.height - halfH) };
  }
  return { ...pos, typeIndex, hp: ENEMY_STATS[typeIndex].hp, dying: false, deathStart: 0, hitFlashUntil: 0 };
}

// Resolves an instant hitscan hit on enemies[i] — decrements HP, triggers
// death/XP-orb or a hit-flash. The effect itself fires from the weapon's own
// muzzle (per reference art: a burst at the nozzle, not a splash at the
// target), so it's spawned by the caller at the weapon's offset position.
function damageEnemy(i, elapsedMs) {
  const enemy = enemies[i];
  enemy.hp--;
  if (enemy.hp <= 0) {
    enemy.dying = true;
    enemy.deathStart = elapsedMs;
    score++;
    scoreEl.textContent = score;
    const tierStats = ENEMY_STATS[enemy.typeIndex];
    xpOrbs.push({ x: enemy.x, y: enemy.y, value: tierStats.xpValue, sprite: tierStats.xpSprite, collecting: false, collectStart: 0 });
  } else {
    enemy.hitFlashUntil = elapsedMs + HIT_FLASH_MS;
  }
}

// --- Update ---
function update(dt, elapsedMs) {
  // player death animation plays out fully before game-over shows
  if (playerDying) {
    if (elapsedMs - playerDeathStart >= DEATH_TOTAL_MS) endGame();
    return;
  }

  // player movement — moves the world-space camera, since the player sprite
  // itself is always drawn at screen center. Open world: no bounds.
  const half = FRAME / 2;
  let dx = 0;
  let dy = 0;
  if (mouseDown) {
    const dir = direction(canvas.width / 2, canvas.height / 2, mouseX, mouseY);
    dx = dir.x;
    dy = dir.y;
  } else {
    if (isDown("ArrowLeft", "a", "A")) dx -= 1;
    if (isDown("ArrowRight", "d", "D")) dx += 1;
    if (isDown("ArrowUp", "w", "W")) dy -= 1;
    if (isDown("ArrowDown", "s", "S")) dy += 1;
  }
  player.x += dx * PLAYER_SPEED * dt;
  player.y += dy * PLAYER_SPEED * dt;

  // facing follows the dominant movement axis; holds its last value while idle
  if (dx !== 0 || dy !== 0) {
    if (Math.abs(dy) >= Math.abs(dx)) {
      facing = dy < 0 ? "up" : "down";
    } else {
      facing = "side";
      facingFlip = dx < 0 ? -1 : 1;
    }
  }

  // aim tracks the nearest LIVE enemy every frame (for weapon rendering),
  // independent of the fire cooldown below — holds its last direction when
  // nothing's in range. Dying corpses are excluded — nearestIndex() has no
  // concept of "dying", so it's called on the alive subset, then the result
  // is mapped back to its real index in `enemies` (otherwise the weapon kept
  // targeting/re-hitting a corpse still mid-death-animation).
  const aliveIndices = [];
  const aliveEnemies = [];
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].dying) continue;
    aliveIndices.push(i);
    aliveEnemies.push(enemies[i]);
  }
  const nearestAliveI = nearestIndex(player.x, player.y, aliveEnemies);
  const targetI = nearestAliveI === -1 ? -1 : aliveIndices[nearestAliveI];
  if (targetI !== -1) {
    aimDir = direction(player.x, player.y, enemies[targetI].x, enemies[targetI].y);
  }

  // auto-fire at the shared nearest target — always on, no button,
  // Survivor.io-style. Each equipped weapon has its own cooldown/range gate
  // (#35) but they all aim at the same target, not independent ones. All 3
  // starter weapons are hitscan/effect-only (#30): no travel, resolves
  // instantly.
  for (const w of equippedWeapons) {
    w.fireAccum += dt * 1000;
    const data = WEAPON_DATA[w.id];
    const inRange = targetI !== -1 && hit(player.x, player.y, enemies[targetI].x, enemies[targetI].y, data.range);
    const interval = fireIntervalFor(FIRE_INTERVAL_BASE, data.rate) * fireRateMul;
    if (w.fireAccum >= interval && inRange) {
      w.fireAccum = 0;
      w.muzzleFlashStart = elapsedMs; // draw() re-derives position/direction fresh every frame — see its own comment
      damageEnemy(targetI, elapsedMs);
    }
  }

  // enemies spawn just outside a random edge of the arena and home toward the player
  spawnAccum += dt * 1000;
  if (spawnAccum >= getSpawnInterval(elapsedMs)) {
    spawnAccum = 0;
    enemies.push(spawnEnemy(half));
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dying) continue; // corpses hold position during their death animation
    const speed = ENEMY_SPEED * ENEMY_STATS[enemies[i].typeIndex].speedMul;
    const dir = direction(enemies[i].x, enemies[i].y, player.x, player.y);
    enemies[i].x += dir.x * speed * dt;
    enemies[i].y += dir.y * speed * dt;
  }

  // remove enemies once their death animation has played out
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dying && elapsedMs - enemies[i].deathStart >= DEATH_TOTAL_MS) {
      enemies.splice(i, 1);
    }
  }

  // XP orb pickup — plain proximity, no magnet/attraction yet. XP is granted
  // immediately; the orb then plays a brief "absorbed" animation (shrink +
  // pull toward the player) before actually being removed.
  for (let i = xpOrbs.length - 1; i >= 0; i--) {
    const orb = xpOrbs[i];
    if (!orb.collecting && hit(player.x, player.y, orb.x, orb.y, XP_PICKUP_RADIUS)) {
      xp += orb.value;
      checkLevelUp();
      orb.collecting = true;
      orb.collectStart = elapsedMs;
    }
    if (orb.collecting && elapsedMs - orb.collectStart >= XP_COLLECT_MS) {
      xpOrbs.splice(i, 1);
    }
  }

  // player <-> enemy collision — capped at one hit per invuln window so a
  // cluster of enemies can't drain multiple lives in a single frame
  if (elapsedMs >= playerInvulnUntil) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].dying) continue;
      if (hit(player.x, player.y, enemies[i].x, enemies[i].y, HIT_RADIUS)) {
        enemies[i].dying = true;
        enemies[i].deathStart = elapsedMs;
        lives--;
        setLivesDisplay(lives);
        playerInvulnUntil = elapsedMs + PLAYER_INVULN_MS;
        if (lives <= 0) {
          playerDying = true;
          playerDeathStart = elapsedMs;
          return;
        }
        playerHitFlashUntil = elapsedMs + HIT_FLASH_MS;
        break;
      }
    }
  }
}

// --- Drawing ---
function draw(elapsedMs) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFloor();
  for (const orb of xpOrbs) {
    let wx = orb.x;
    let wy = orb.y;
    let scale = 1;
    if (orb.collecting) {
      // pulled toward the player's current position while shrinking away
      const t = Math.min((elapsedMs - orb.collectStart) / XP_COLLECT_MS, 1);
      wx = orb.x + (player.x - orb.x) * t;
      wy = orb.y + (player.y - orb.y) * t;
      scale = 1 - t;
    }
    const s = toScreen(wx, wy);
    drawSprite(xpSprites[orb.sprite], s.x, s.y, elapsedMs, 120, 1, scale);
  }
  for (const e of enemies) {
    const s = toScreen(e.x, e.y);
    if (e.dying) {
      drawSprite(enemyDeathSprites[e.typeIndex], s.x, s.y, elapsedMs - e.deathStart, DEATH_FRAME_MS);
    } else if (elapsedMs < e.hitFlashUntil) {
      drawSprite(enemyDeathSprites[e.typeIndex], s.x, s.y, 0); // frame 0 = flinch pose, held static
    } else {
      drawSprite(enemySprites[e.typeIndex], s.x, s.y, elapsedMs);
    }
    const maxHp = ENEMY_STATS[e.typeIndex].hp;
    if (!e.dying && maxHp > 1) {
      drawBar(sprites.hpBarBack, sprites.hpBarRed, s.x, s.y - FRAME / 2 - 6, 24, 4, e.hp / maxHp);
    }
  }
  // always screen-centered; sprite/flip follow the last movement direction
  if (playerDying) {
    drawSprite(playerDeathSprites[facing], canvas.width / 2, canvas.height / 2, elapsedMs - playerDeathStart, DEATH_FRAME_MS, facingFlip);
  } else {
    // flicker for the remaining invuln window so it's visible why overlapping enemies aren't costing more lives
    const invulnRemaining = playerInvulnUntil - elapsedMs;
    ctx.globalAlpha = invulnRemaining > 0 && Math.floor(elapsedMs / 100) % 2 === 0 ? 0.4 : 1;
    if (elapsedMs < playerHitFlashUntil) {
      drawSprite(playerDeathSprites[facing], canvas.width / 2, canvas.height / 2, 0, DEATH_FRAME_MS, facingFlip); // frame 0 = flinch pose, held static
    } else {
      drawSprite(playerSprites[facing], canvas.width / 2, canvas.height / 2, elapsedMs, 120, facingFlip);
    }
    // weapons render offset from the player, facing the shared aim direction —
    // all equipped weapons draw at the same spot for now (#35), since there's
    // nothing to visually fan out until #31 can actually equip a 2nd one.
    const { frame, flip } = aimFrame(aimDir.x, aimDir.y);
    const wx = canvas.width / 2 + aimDir.x * WEAPON_OFFSET;
    const wy = canvas.height / 2 + aimDir.y * WEAPON_OFFSET;
    for (const w of equippedWeapons) {
      const data = WEAPON_DATA[w.id];
      drawSpriteFrame(data.sprite, frame, wx, wy, flip);
      // muzzle flash draws at the SAME (wx,wy) using the CURRENT aim direction,
      // not a position/direction captured at fire time — so it can never drift
      // off the moving weapon or disagree with its current pose (previously a
      // separately-tracked world-space entity, which did both).
      if (elapsedMs - w.muzzleFlashStart < MUZZLE_EFFECT_TOTAL_MS) {
        const { index, flipX, flipY, transpose } = quadrantBucket(aimDir.x, aimDir.y);
        drawSprite(data.effect[index], wx, wy, elapsedMs - w.muzzleFlashStart, MUZZLE_EFFECT_FRAME_MS, flipX, 1, flipY, MUZZLE_EFFECT_ORIGIN[index], transpose);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// --- Loop ---
function gameLoop(ts) {
  if (!running) return;
  const dt = Math.min((ts - lastTs) / 1000, 0.1); // cap to avoid a huge first-frame jump
  lastTs = ts;
  const elapsedMs = ts - startTime;
  update(dt, elapsedMs);
  draw(elapsedMs);
  requestAnimationFrame(gameLoop);
}

// --- Start / game over ---
for (const btn of weaponChoiceButtons) {
  btn.addEventListener("click", () => startGame(Number(btn.dataset.weapon)));
}

function startGame(starterId) {
  overlay.classList.add("hidden");
  player.x = 0;
  player.y = 0;
  facing = "down";
  facingFlip = 1;
  aimDir = { x: 0, y: 1 };
  playerDying = false;
  playerHitFlashUntil = 0;
  playerInvulnUntil = 0;
  equippedWeapons = [{ id: starterId, fireAccum: 0, muzzleFlashStart: -Infinity }];
  fireRateMul = 1;
  enemies = [];
  xpOrbs = [];
  xp = 0;
  level = 1;
  spawnAccum = 0;
  spawnTierState = { basicCount: 0, basicTarget: randomBasicTarget(), extraCount: 0, extraTarget: randomExtraTarget() };
  score = 0;
  lives = MAX_LIVES;
  scoreEl.textContent = score;
  setLivesDisplay(lives);
  setLevelDisplay();
  setXpDisplay(0);
  running = true;
  gameOver = false;
  startTime = performance.now();
  lastTs = startTime;
  requestAnimationFrame(gameLoop);
}

function endGame() {
  running = false;
  gameOver = true;
  overlay.querySelector("h1").textContent = "GAME OVER";
  overlay.querySelector("p").textContent = `Final score: ${score} — choose a weapon to retry:`;
  overlay.classList.remove("hidden");
}
