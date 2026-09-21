# chidole

Web-based pixel-art shoot-'em-up. Vanilla JS + HTML5 Canvas, no framework —
same stack as `koda-blast`. Built on CraftPix's free "Roguelike Shoot-'Em-Up"
asset kit.

## Status

Core Loop (MVP) milestone done — playable. See [Milestones](../../milestones)
for what's next (content → responsive/PWA → cleanup → ads).

## Local dev

```
docker compose up -d
```

Open `http://localhost:8181`. Arrow keys/WASD to move, Space to fire.

## Tests

```
npm install
npm test
```

Covers `logic.js` (hit detection, spawn-interval ramp) — rendering/input
aren't unit tested, matching `koda-blast`'s precedent for anything
DOM/Canvas-coupled.

## Stack

- Vanilla JS, HTML5 Canvas (ES modules, no build step)
- Static site, deployed as `nginx:alpine` (same pattern as `koda-blast`)

## Assets & licensing

Game code is MIT (see `LICENSE`). Art/animation assets are from CraftPix's
free asset kit and are used under the [CraftPix free license](https://craftpix.net/file-licenses/)
(commercial use permitted; redistribution of the raw source files is not).
See `DOCS.md` for details.
