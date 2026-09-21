// --- Setup ---
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = 360;
canvas.height = 640;

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");

const FRAME = 48; // all character/enemy sprite frames are 48x48px
const PLAYER_SPEED = 200; // px/sec
const BULLET_SPEED = 400; // px/sec
const FIRE_INTERVAL = 220; // ms between shots while firing

// --- Sprite loading ---
function loadSprite(src, frameCount) {
  const img = new Image();
  img.src = src;
  return { img, frameCount, loaded: false };
}
const sprites = {
  player: loadSprite("assets/player_walk.png", 4),
  enemy: loadSprite("assets/enemy_run.png", 6),
  projectile: loadSprite("assets/projectile.png", 1),
};
for (const s of Object.values(sprites)) {
  s.img.onload = () => { s.loaded = true; };
}

function drawSprite(sprite, x, y, elapsedMs, frameDurationMs = 120) {
  if (!sprite.loaded) return;
  const frame = Math.floor(elapsedMs / frameDurationMs) % sprite.frameCount;
  ctx.drawImage(
    sprite.img,
    frame * FRAME, 0, FRAME, FRAME,
    x - FRAME / 2, y - FRAME / 2, FRAME, FRAME
  );
}

// --- Play area ---
const player = { x: canvas.width / 2, y: canvas.height - 80 };
let bullets = [];
let fireAccum = 0;

let running = false;
let startTime = 0;
let lastTs = 0;

// --- Input handling ---
const keys = {};
document.addEventListener("keydown", (e) => { keys[e.key] = true; });
document.addEventListener("keyup", (e) => { keys[e.key] = false; });

function isDown(...names) {
  return names.some((n) => keys[n]);
}

// --- Update ---
function update(dt) {
  // player movement, clamped to canvas bounds
  const half = FRAME / 2;
  if (isDown("ArrowLeft", "a", "A")) player.x -= PLAYER_SPEED * dt;
  if (isDown("ArrowRight", "d", "D")) player.x += PLAYER_SPEED * dt;
  if (isDown("ArrowUp", "w", "W")) player.y -= PLAYER_SPEED * dt;
  if (isDown("ArrowDown", "s", "S")) player.y += PLAYER_SPEED * dt;
  player.x = Math.max(half, Math.min(canvas.width - half, player.x));
  player.y = Math.max(half, Math.min(canvas.height - half, player.y));

  // auto-fire while Space is held
  fireAccum += dt * 1000;
  if (isDown(" ") && fireAccum >= FIRE_INTERVAL) {
    fireAccum = 0;
    bullets.push({ x: player.x, y: player.y - half });
  }

  // bullets travel straight up, despawn off-screen
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].y -= BULLET_SPEED * dt;
    if (bullets[i].y < 0) bullets.splice(i, 1);
  }
}

// --- Drawing ---
function draw(elapsedMs) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const b of bullets) drawSprite(sprites.projectile, b.x, b.y, elapsedMs);
  drawSprite(sprites.player, player.x, player.y, elapsedMs);
}

// --- Loop ---
function gameLoop(ts) {
  if (!running) return;
  const dt = Math.min((ts - lastTs) / 1000, 0.1); // cap to avoid a huge first-frame jump
  lastTs = ts;
  update(dt);
  draw(ts - startTime);
  requestAnimationFrame(gameLoop);
}

// --- Start ---
startBtn.addEventListener("click", startGame);

function startGame() {
  overlay.classList.add("hidden");
  bullets = [];
  fireAccum = 0;
  running = true;
  startTime = performance.now();
  lastTs = startTime;
  requestAnimationFrame(gameLoop);
}
