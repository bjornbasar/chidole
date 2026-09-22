# DOCS.md — chidole

Pixel-art shoot-'em-up. Vanilla JS + HTML5 Canvas, no build step, no framework.

## MVP (built)

Survivor.io-style arena survival, open world (not a bounded canvas-sized
arena). The player is always drawn at screen center; moving shifts a
world-space camera instead of the player's screen position, so the tiled
floor and every enemy/bullet scroll past instead. Shooting is fully
automatic — no button — and always targets the nearest enemy. Enemies
(6 types) spawn just outside the current viewport on a difficulty-ramped
interval and home toward the player's live position every frame; each type
has its own HP (1-4 hits) and speed multiplier (0.6x-1.3x) so the roster
plays differently, not just looks different. 3 lives; player↔enemy contact
costs a life, killing an enemy scores a point; game ends at 0 lives with a
retry button. HUD shows score (text) and lives (a scalable HP-bar sprite).

Code layout: `index.html` + `game.js` (rendering/loop/input, untested,
mirrors `koda-blast`'s idioms — plain-object state, manual
`requestAnimationFrame` loop with a fixed-timestep tick, `keys` dict input)
and `logic.js` (pure hit-detection, spawn-interval-ramp, direction-vector,
and nearest-entity functions, unit tested with vitest in `logic.test.js` —
the one deliberate deviation from `koda-blast`'s no-tests precedent, since
this project pulled out actual branchy logic worth covering). All entity
positions (`player`, `enemies[]`, `bullets[]`) are world-space; only
`draw()` converts to screen space via `toScreen()`, keeping collision/AI
math identical regardless of camera position.

## Scope

MVP is a playable game only. PWA installability and ad monetization are
scoped as later milestones, not part of MVP.

## Milestones

1. **Core Loop (MVP)** — scaffold, movement/shooting input, one enemy type,
   collision, score/lives, game over. Genuinely playable end state. **Done.**
2. **Content** — full enemy roster, location background, GUI/HUD, win/lose
   screens, restart flow.
3. **Responsive & Installable** — fixed logical-resolution canvas scaled via
   CSS for desktop + mobile, touch controls, PWA manifest + service worker.
4. **Cleanup** — code/refactor pass, docs, deploy wiring (same CI/CD pattern
   as other workspace projects), cross-device smoke pass.
5. **Ads** — H5 Games Ads SDK, interstitials at natural breaks, rewarded-ad
   flow (continue / extra life / buff), graceful no-fill/ad-blocked fallback.

## Assets

CraftPix free "Roguelike Shoot-'Em-Up Pixel Art Game Kit" — sprites are
32x32 location tiles + character/enemy frame sheets (48x48 per animation
frame) + a 16x2 HP-bar strip. Commercial use is permitted under CraftPix's
free license; raw source files (PNG/AI/EPS) may not be resold or
redistributed standalone — the assets actually used (`assets/player_walk.png`,
`assets/enemy1_run.png`-`enemy6_run.png`, `assets/projectile.png`,
`assets/floor_tile.png`, `assets/hpbar_back.png`, `assets/hpbar_red.png`)
are committed to the repo since they serve gameplay, not distributed as a
standalone download feature. Weapon rotation-sprites are not used (MVP
fires straight from the player, no gun overlay). Referenced fonts (Google
Fonts, OFL) are not yet decided/bundled — pick one during Content or
Cleanup.

## Deploy

Local dev is containerized (`docker-compose.yml`, `nginx:alpine`, port
`8181`) — done as part of MVP so it's reachable from another machine on the
LAN during development. The Ayula vhost + local CI/CD loop wiring for a
real public deploy is still planned for the Cleanup milestone.
