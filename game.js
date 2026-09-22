import { hit, getSpawnInterval, direction, nearestIndex, weightedIndex } from "./logic.js";

// --- Setup ---
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = 360;
canvas.height = 640;
ctx.imageSmoothingEnabled = false; // keep pixel art crisp, not blurred

const scoreEl = document.getElementById("score");
const hpFillEl = document.getElementById("hpFill");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");

const FRAME = 48; // all character/enemy sprite frames are 48x48px
const TILE = 32; // location floor tile size
const PLAYER_SPEED = 200; // px/sec
const BULLET_SPEED = 400; // px/sec
const FIRE_INTERVAL = 220; // ms between auto-fired shots
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
  projectile: loadSprite("assets/projectile.png", 1, 10, 10),
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
const HIT_FLASH_MS = 120; // non-lethal hits briefly show the death sprite's frame 0 (a "flinch" pose)
const PLAYER_INVULN_MS = 800; // brief i-frames after taking a hit, so a cluster can't drain lives in one frame

// The 6 enemy types are two parallel families of 3 (green: 1-3, pink: 4-6),
// each following the same basic -> extra -> tank tier, so both families play
// identically at a given tier despite the different sprite/color.
const BASIC = { hp: 1, speedMul: 1.2 };
const EXTRA = { hp: 2, speedMul: 1.0 };
const TANK = { hp: 4, speedMul: 0.7 };
const ENEMY_STATS = [
  BASIC, EXTRA, TANK, // green family: types 1, 2, 3
  BASIC, EXTRA, TANK, // pink family: types 4, 5, 6
];
// Rarer as the tier gets tougher — basic 3x as likely to spawn as tank.
const ENEMY_SPAWN_WEIGHTS = [3, 2, 1, 3, 2, 1];

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
  hpFillEl.style.transform = `scaleX(${Math.max(0, n) / MAX_LIVES})`;
}

function drawSprite(sprite, x, y, elapsedMs, frameDurationMs = 120, flip = 1) {
  if (!sprite.loaded) return;
  const { frameW, frameH, frameCount } = sprite;
  const frame = Math.floor(elapsedMs / frameDurationMs) % frameCount;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip, 1);
  ctx.drawImage(
    sprite.img,
    frame * frameW, 0, frameW, frameH,
    -frameW / 2, -frameH / 2, frameW, frameH
  );
  ctx.restore();
}

// --- Play area ---
// player.x/y is the player's WORLD position (also the camera position, since
// the player sprite is always drawn at screen center). Enemies/bullets are
// world-space too; only draw() converts to screen space.
const player = { x: 0, y: 0 };
let facing = "down"; // "down" | "up" | "side" — holds last direction while idle
let facingFlip = 1; // 1 = facing right, -1 = mirrored (facing left)
let playerDying = false;
let playerDeathStart = 0;
let playerHitFlashUntil = 0;
let playerInvulnUntil = 0;
let bullets = [];
let enemies = [];
let fireAccum = 0;
let spawnAccum = 0;

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
  const typeIndex = weightedIndex(Math.random(), ENEMY_SPAWN_WEIGHTS);
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

  // auto-fire at the nearest enemy — always on, no button, Survivor.io-style
  fireAccum += dt * 1000;
  if (fireAccum >= FIRE_INTERVAL) {
    const targetI = nearestIndex(player.x, player.y, enemies);
    if (targetI !== -1) {
      fireAccum = 0;
      const dir = direction(player.x, player.y, enemies[targetI].x, enemies[targetI].y);
      bullets.push({ x: player.x, y: player.y, vx: dir.x * BULLET_SPEED, vy: dir.y * BULLET_SPEED });
    }
  }

  // bullets travel in their fired direction, despawn once off-viewport
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].x += bullets[i].vx * dt;
    bullets[i].y += bullets[i].vy * dt;
    const b = bullets[i];
    if (Math.abs(b.x - player.x) > canvas.width / 2 + half || Math.abs(b.y - player.y) > canvas.height / 2 + half) {
      bullets.splice(i, 1);
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

  // bullet <-> enemy collision — each hit costs 1 HP, tankier types take more shots
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dying) continue;
    for (let j = bullets.length - 1; j >= 0; j--) {
      if (hit(enemies[i].x, enemies[i].y, bullets[j].x, bullets[j].y, HIT_RADIUS)) {
        bullets.splice(j, 1);
        enemies[i].hp--;
        if (enemies[i].hp <= 0) {
          enemies[i].dying = true;
          enemies[i].deathStart = elapsedMs;
          score++;
          scoreEl.textContent = score;
        } else {
          enemies[i].hitFlashUntil = elapsedMs + HIT_FLASH_MS;
        }
        break;
      }
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
  for (const b of bullets) {
    const s = toScreen(b.x, b.y);
    drawSprite(sprites.projectile, s.x, s.y, elapsedMs);
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
startBtn.addEventListener("click", startGame);

function startGame() {
  overlay.classList.add("hidden");
  player.x = 0;
  player.y = 0;
  facing = "down";
  facingFlip = 1;
  playerDying = false;
  playerHitFlashUntil = 0;
  playerInvulnUntil = 0;
  bullets = [];
  enemies = [];
  fireAccum = 0;
  spawnAccum = 0;
  score = 0;
  lives = MAX_LIVES;
  scoreEl.textContent = score;
  setLivesDisplay(lives);
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
  overlay.querySelector("p").textContent = `Final score: ${score}`;
  startBtn.textContent = "RETRY";
  overlay.classList.remove("hidden");
}
