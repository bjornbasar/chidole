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

let running = false;
let startTime = 0;

// --- Drawing ---
function draw(elapsedMs) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSprite(sprites.player, player.x, player.y, elapsedMs);
}

// --- Loop ---
function gameLoop(ts) {
  if (!running) return;
  const elapsed = ts - startTime;
  draw(elapsed);
  requestAnimationFrame(gameLoop);
}

// --- Input handling ---
startBtn.addEventListener("click", startGame);

function startGame() {
  overlay.classList.add("hidden");
  running = true;
  startTime = performance.now();
  requestAnimationFrame(gameLoop);
}
