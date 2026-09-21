# DOCS.md — chidole

Pixel-art shoot-'em-up. Vanilla JS + HTML5 Canvas, no build step, no framework.

## MVP (built)

Top-down vertical shooter: player near the bottom of a 360×640 canvas, fires
straight up, single enemy type spawns along the top edge on a
difficulty-ramped interval and moves straight down. Controls: arrow keys/WASD
to move, Space to fire (auto-fire while held). 3 lives; player↔enemy contact
costs a life, bullet↔enemy contact scores a point; game ends at 0 lives with
a retry button.

Code layout: `index.html` + `game.js` (rendering/loop/input, untested,
mirrors `koda-blast`'s idioms — plain-object state, manual
`requestAnimationFrame` loop with a fixed-timestep tick, `keys` dict input)
and `logic.js` (pure hit-detection + spawn-interval-ramp functions, unit
tested with vitest in `logic.test.js` — the one deliberate deviation from
`koda-blast`'s no-tests precedent, since this project pulled out actual
branchy logic worth covering).

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
32x32 tiles + character/enemy frame sheets (48x48 per animation frame).
Commercial use is permitted under CraftPix's free license; raw source files
(PNG/AI/EPS) may not be resold or redistributed standalone — the three
sprites actually used (`assets/player_walk.png`, `assets/enemy_run.png`,
`assets/projectile.png`) are committed to the repo since they serve
gameplay, not distributed as a standalone download feature. Weapon
rotation-sprites and the location tileset are not used yet (deferred to
Content). Referenced fonts (Google Fonts, OFL) are not yet decided/bundled —
pick one during Content or Cleanup.

## Deploy

Local dev is containerized (`docker-compose.yml`, `nginx:alpine`, port
`8181`) — done as part of MVP so it's reachable from another machine on the
LAN during development. The Ayula vhost + local CI/CD loop wiring for a
real public deploy is still planned for the Cleanup milestone.
