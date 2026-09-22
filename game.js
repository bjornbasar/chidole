import { hit, getSpawnInterval, direction, nearestIndex } from "./logic.js";

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
  player: loadSprite("assets/player_walk.png", 4),
  enemy: loadSprite("assets/enemy_run.png", 6),
  projectile: loadSprite("assets/projectile.png", 1, 10, 10),
};
for (const s of Object.values(sprites)) {
  s.img.onload = () => { s.loaded = true; };
}

const floorTile = new Image();
let floorTileLoaded = false;
floorTile.onload = () => { floorTileLoaded = true; };
floorTile.src = "assets/floor_tile.png";

function drawFloor() {
  if (!floorTileLoaded) return;
  for (let y = 0; y < canvas.height; y += TILE) {
    for (let x = 0; x < canvas.width; x += TILE) {
      ctx.drawImage(floorTile, x, y, TILE, TILE);
    }
  }
}

function setLivesDisplay(n) {
  hpFillEl.style.transform = `scaleX(${Math.max(0, n) / MAX_LIVES})`;
}

function drawSprite(sprite, x, y, elapsedMs, frameDurationMs = 120) {
  if (!sprite.loaded) return;
  const { frameW, frameH, frameCount } = sprite;
  const frame = Math.floor(elapsedMs / frameDurationMs) % frameCount;
  ctx.drawImage(
    sprite.img,
    frame * frameW, 0, frameW, frameH,
    x - frameW / 2, y - frameH / 2, frameW, frameH
  );
}

// --- Play area ---
const player = { x: canvas.width / 2, y: canvas.height - 80 };
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

// Random point just outside one of the four arena edges (top/right/bottom/left).
function spawnEnemy(half) {
  const edge = Math.floor(Math.random() * 4);
  switch (edge) {
    case 0: return { x: Math.random() * canvas.width, y: -half };
    case 1: return { x: canvas.width + half, y: Math.random() * canvas.height };
    case 2: return { x: Math.random() * canvas.width, y: canvas.height + half };
    default: return { x: -half, y: Math.random() * canvas.height };
  }
}

// --- Update ---
function update(dt, elapsedMs) {
  // player movement, clamped to canvas bounds
  const half = FRAME / 2;
  if (isDown("ArrowLeft", "a", "A")) player.x -= PLAYER_SPEED * dt;
  if (isDown("ArrowRight", "d", "D")) player.x += PLAYER_SPEED * dt;
  if (isDown("ArrowUp", "w", "W")) player.y -= PLAYER_SPEED * dt;
  if (isDown("ArrowDown", "s", "S")) player.y += PLAYER_SPEED * dt;
  player.x = Math.max(half, Math.min(canvas.width - half, player.x));
  player.y = Math.max(half, Math.min(canvas.height - half, player.y));

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

  // bullets travel in their fired direction, despawn off-screen
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].x += bullets[i].vx * dt;
    bullets[i].y += bullets[i].vy * dt;
    const b = bullets[i];
    if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) bullets.splice(i, 1);
  }

  // enemies spawn just outside a random edge of the arena and home toward the player
  spawnAccum += dt * 1000;
  if (spawnAccum >= getSpawnInterval(elapsedMs)) {
    spawnAccum = 0;
    enemies.push(spawnEnemy(half));
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    const dir = direction(enemies[i].x, enemies[i].y, player.x, player.y);
    enemies[i].x += dir.x * ENEMY_SPEED * dt;
    enemies[i].y += dir.y * ENEMY_SPEED * dt;
  }

  // bullet <-> enemy collision
  for (let i = enemies.length - 1; i >= 0; i--) {
    for (let j = bullets.length - 1; j >= 0; j--) {
      if (hit(enemies[i].x, enemies[i].y, bullets[j].x, bullets[j].y, HIT_RADIUS)) {
        enemies.splice(i, 1);
        bullets.splice(j, 1);
        score++;
        scoreEl.textContent = score;
        break;
      }
    }
  }

  // player <-> enemy collision
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (hit(player.x, player.y, enemies[i].x, enemies[i].y, HIT_RADIUS)) {
      enemies.splice(i, 1);
      lives--;
      setLivesDisplay(lives);
      if (lives <= 0) {
        endGame();
        return;
      }
    }
  }
}

// --- Drawing ---
function draw(elapsedMs) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFloor();
  for (const b of bullets) drawSprite(sprites.projectile, b.x, b.y, elapsedMs);
  for (const e of enemies) drawSprite(sprites.enemy, e.x, e.y, elapsedMs);
  drawSprite(sprites.player, player.x, player.y, elapsedMs);
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
