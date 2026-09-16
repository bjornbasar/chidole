# DOCS.md — chidole

Pixel-art shoot-'em-up. Vanilla JS + HTML5 Canvas, no build step, no framework.

## Scope

MVP is a playable game only. PWA installability and ad monetization are
scoped as later milestones, not part of MVP.

## Milestones

1. **Core Loop (MVP)** — scaffold, movement/shooting input, one enemy type,
   collision, score/lives, game over. Genuinely playable end state.
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
32x32 tiles + character/enemy frame sheets. Commercial use is permitted
under CraftPix's free license; raw source files (PNG/AI/EPS) may not be
resold or redistributed standalone. Referenced fonts (Google Fonts, OFL)
are not yet decided/bundled — pick one during Content or Cleanup.

## Deploy

Not yet wired up — planned for the Cleanup milestone, same pattern as
`koda-blast` (static `nginx:alpine` container, Ayula vhost).
