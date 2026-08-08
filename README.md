# Space Shooter

A mobile-first 2D space shooter built with vanilla JavaScript and the HTML5 Canvas API — no frameworks, no build step.

## Status

A complete core gameplay loop. The flow: an opening cinematic (`PrologueScene`, a beat-by-beat sequence ending on a title card + PLAY button) → a tutorial overlay pointing at the real HUD/barrier UI (`TutorialScene`) → gameplay (`GameplayScene`), where the player defends a barrier against waves of enemies drawn from `Config.waves.levels`.

Enemy roster: **Scout**/**Rocketeer** (aimed bullets / homing rockets), **Sniper** (charges then fires an instant laser at a historical player position, with a "!" telegraph), a four-variant **Drifter** family (looping/sweeping/diving/weaving tentacle-creature formations that lash tracking projectiles), and a **Bouncer** family (gravity-bounced hexagons, some splitting into fragments or carrying an absorbing shield on death/hit). Enemy death triggers a pooled shockwave-ring + spark burst; the barrier takes damage and pulses on impact.

A small "?" button (top-center, always visible during gameplay) opens an in-game reference — the Enemy Codex — that pauses the game and pages through a card per enemy type, each with a re-drawn thumbnail of its actual hull, a short description, and its stats (`EnemyCodex.js`; see also `docs/enemies.md`, the fuller written reference this is condensed from).

The game's original entry point, `IntroScene` (a "swipe up to continue" prompt), still exists and works, but `Game` currently boots straight into `PrologueScene` via a dev-convenience flag — see the comment above that line in `Game.js` for how to restore the full flow.

## Tech stack

- Vanilla JavaScript (native ES modules, no bundler/transpiler)
- HTML5 Canvas 2D for rendering
- Plain CSS, organized in cascade layers (reset → layout, with room for `components/` as the UI grows)
- Served as static files (this repo lives under XAMPP's `htdocs/`)

## Project structure

```
space-shooter/
├── index.html                          # Entry point — full-screen stage + canvas
├── preview.html                        # Standalone design sandbox for new hulls — NOT part of the game
├── css/
│   ├── main.css                        # Aggregates layers in cascade order
│   ├── base/_reset.css                 # Modern reset + root theme tokens (incl. --void, --game-max-width)
│   └── layouts/_app.css                # Full-viewport stage that hosts the canvas
├── js/
│   ├── main.js                         # Composition root — wires deps, owns window/document listeners, starts the game
│   ├── core/
│   │   ├── Config.js                   # Frozen constants — every tunable in the game lives here
│   │   ├── Game.js                     # App lifecycle: sizing, scene switching, input routing, main loop
│   │   ├── Renderer.js                 # Canvas 2D abstraction; draws in virtual coordinates
│   │   ├── SwipeInput.js / TapInput.js / DragInput.js   # Pointer Events-based gesture detectors
│   │   ├── animation.js                # easeOutCubic / flickerAlpha curves
│   │   ├── shapes.js                   # Parameterized corner-bracket / diamond chrome geometry
│   │   ├── AudioPool.js                # Lazy round-robin Audio pool (every repeated SFX site uses this)
│   │   ├── textLayout.js               # Canvas word-wrap + word-offset helpers
│   │   └── vectorMath.js               # directionalVelocity — shared straight-line projectile launch math
│   ├── entities/
│   │   ├── Player.js / Bullets.js      # Player ship + its auto-fire bullet pool
│   │   ├── Enemy.js                    # Scout/Rocketeer + shared hull constants
│   │   ├── SniperEnemy.js              # Charge → warning → instant laser
│   │   ├── DrifterEnemy.js             # 4 path variants (drifter/sweeper/diver/weaver), one shared body
│   │   ├── DrifterProjectiles.js       # Drifter's tracking-orb projectile pool
│   │   ├── BouncerEnemy.js             # Gravity-bounced hexagon + splitter/shielded variants
│   │   ├── EnemyCombat.js              # Shared hit/death-flash/entry-glide/engine-render functions
│   │   ├── EnemyCodex.js               # In-gameplay "?" button — pauses and pages through a card per enemy type
│   │   ├── EnemyBullet.js / Rockets.js # Enemy projectile pools (straight capsule / homing)
│   │   ├── Particles.js                # Pooled death-explosion shockwave rings + sparks
│   │   ├── Barrier.js                  # The structure the player defends
│   │   ├── HUD.js                      # Score/gold panel chrome (currently static placeholders)
│   │   ├── Portal.js                   # Cinematic "tear in the sky" prop (PrologueScene only)
│   │   ├── Starfield.js                # Bake-once, blit-many parallax backdrop
│   │   └── WaveManager.js              # Owns one level's spawning, enemies, projectiles, and batched rendering
│   └── scenes/
│       ├── IntroScene.js               # Opening prompt (currently dev-bypassed — see Status above)
│       ├── PrologueScene.js            # Opening cinematic → title card + PLAY
│       ├── TutorialScene.js            # Five dismissible hints over the real gameplay backdrop
│       └── GameplayScene.js            # Composes Player/Bullets/Barrier/HUD/Starfield/WaveManager
├── assets/                             # audio/, fonts/, images/
└── docs/                               # (currently empty)
```

## Running locally

This project uses native ES modules (`<script type="module">`), which browsers block from `file://` URLs — it must be served over HTTP:

- **XAMPP** (this repo already lives in `htdocs/`): start Apache and open `http://localhost/space-shooter/`
- **Or** any static file server, e.g. `npx serve .` from the project root

## Design notes

- **Virtual resolution**: gameplay is authored against a fixed 540×960 (9:16) virtual canvas (`Config.virtual`). The `Renderer` maps this onto the real backing store — accounting for device pixel ratio — so every draw call uses consistent virtual coordinates regardless of the device's actual screen size.
- **Full-screen with letterboxing**: the `.app` stage fills the viewport edge-to-edge (`width: 100%`, `height: 100dvh`) up to `--game-max-width` — `calc(100dvh * 9/16)`, the exact 9:16 proportion at whatever the viewport's height is, rather than a fixed pixel guess — capped and centered on large screens so the game stays a comfortable, phone-like size rather than stretching across huge displays. `Game._onResize` then sizes the canvas to the largest rectangle that preserves the 9:16 aspect ratio within the stage. The stage's background matches the canvas's void color via the shared `--void` custom property (kept in sync by hand with `Config.colors.void` — no build step links CSS and JS), so any letterbox bars blend in seamlessly rather than reading as a visible "frame".
- **Renderer as a seam**: scenes and entities never touch the raw canvas context directly — they call a small, intentional set of primitives on `Renderer` (`clear`, `drawImage`, `drawText`, `strokePaths`, `fillStrokePaths`, `fillEllipse`, `strokeCircle`, `drawFlame`). `drawImage` accepts an optional `alpha` (0–1) so scenes can fade content in/out without ever reaching for `globalAlpha` themselves. This keeps the door open to swap rendering backends (WebGL, PixiJS, Three.js) later without rewriting gameplay code.
- **Main loop & scene switching**: `Game._tick` drives a `requestAnimationFrame` loop that calls `scene.update(dt)` then `scene.render()` each frame on whichever scene is current, where `dt` is the elapsed time in seconds. `Game` itself owns *which* scene is active and swaps it via a constructor-injected completion callback (`{ onContinue }`) that every scene follows — `Game._start*` methods are what actually replace `this.scene`.
- **Bake-once, blit-many starfield**: rather than redrawing every star each frame, `Starfield` (composed by both `GameplayScene` and `PrologueScene`) pre-renders each parallax layer's stars ONCE onto an off-screen canvas tile, then each frame just translates and blits that tile twice via `Renderer.drawImage` — the classic two-copy seamless-scroll technique (one copy positioned one tile-height above the other, so the wrap point never shows). Per-frame cost stays flat and tiny regardless of star count, which keeps it cheap on low-end devices.
- **Batched enemy rendering**: `WaveManager` transforms every batchable enemy's hull into world space and draws each (type × hit-flash) group in one `fillStrokePaths` call, so GPU shadow-blur passes stay flat regardless of how many enemies are on screen — only Drifter/Bouncer (whose geometry varies per-clone) render themselves individually.
- **Shared enemy-combat behavior without inheritance**: `Enemy`, `SniperEnemy`, and `DrifterEnemy` share hit/death-flash/entry-glide/engine-render logic via plain functions in `EnemyCombat.js` rather than a base class, since the three have different constructor shapes — each opts into only the pieces it needs.
- **Gesture input, routed by scene**: `SwipeInput`/`TapInput`/`DragInput` each listen on the stage via the Pointer Events API (one code path for touch *and* mouse) and report normalized callbacks. `Game` owns one instance of each and forwards gestures to whichever scene is active (`scene.handleSwipeUp?.()` etc.) — scenes that don't care about a gesture simply don't implement its handler.
- **Audio started synchronously from a gesture's call chain**: `Game._startGameplay` calls `audio.play()` reached via a direct synchronous callback chain from the tutorial's last hint tap. Browsers require playback to start within a user gesture's "activation" window — even a short `requestAnimationFrame`-driven animation can run past it — so any future sound-on-gesture code must trigger playback immediately in the handler or a synchronous call chain from it, not after some animation finishes.
