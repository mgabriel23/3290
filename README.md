# Space Shooter

A mobile-first 2D space shooter built with vanilla JavaScript and the HTML5 Canvas API — no frameworks, no build step.

## Status

Early foundation stage. The game renders full-screen, edge-to-edge (no browser chrome/frame), and currently shows an animated backdrop — a drifting, seamlessly-looping starfield — behind an otherwise empty stage. A minimal `requestAnimationFrame` loop drives this animation. No other gameplay systems (entities, input, physics) exist yet — they're intentionally deferred until the rendering foundation is solid.

## Tech stack

- Vanilla JavaScript (native ES modules, no bundler/transpiler)
- HTML5 Canvas 2D for rendering
- Plain CSS, organized in cascade layers (reset → layout, with room for `components/` as the UI grows)
- Served as static files (this repo lives under XAMPP's `htdocs/`)

## Project structure

```
space-shooter/
├── index.html                          # Entry point — full-screen stage + canvas
├── css/
│   ├── main.css                        # Aggregates layers in cascade order
│   ├── base/_reset.css                 # Modern reset + root theme tokens
│   └── layouts/_app.css                # Full-viewport stage that hosts the canvas
├── js/
│   ├── main.js                         # Composition root — wires deps, starts the game
│   ├── core/
│   │   ├── Config.js                   # Frozen constants: virtual res, starfield tuning, colors
│   │   ├── Game.js                     # App lifecycle: responsive sizing + the main update/render loop
│   │   └── Renderer.js                 # Canvas 2D abstraction; draws in virtual coordinates
│   └── scenes/
│       └── GameplayScene.js            # Animated backdrop: seamlessly-scrolling starfield
├── assets/                             # audio/, fonts/, images/ (currently empty)
└── docs/                               # (currently empty)
```

## Running locally

This project uses native ES modules (`<script type="module">`), which browsers block from `file://` URLs — it must be served over HTTP:

- **XAMPP** (this repo already lives in `htdocs/`): start Apache and open `http://localhost/space-shooter/`
- **Or** any static file server, e.g. `npx serve .` from the project root

## Design notes

- **Virtual resolution**: gameplay is authored against a fixed 540×960 (9:16) virtual canvas (`Config.virtual`). The `Renderer` maps this onto the real backing store — accounting for device pixel ratio — so every draw call uses consistent virtual coordinates regardless of the device's actual screen size.
- **Full-screen with letterboxing**: the `.app` stage fills the viewport edge-to-edge (`width: 100%`, `height: 100dvh`) up to `--game-max-width` (capped and centered on large screens so the game stays a comfortable, phone-like size rather than stretching across huge displays). `Game._onResize` then sizes the canvas to the largest rectangle that preserves the 9:16 aspect ratio within the stage. The stage's background matches the canvas's void color, so any letterbox bars blend in seamlessly rather than reading as a visible "frame".
- **Renderer as a seam**: scenes never touch the raw canvas context directly — they call a small, intentional set of primitives on `Renderer` (`clear`, `fillCircle`, with more added as gameplay needs them). This keeps the door open to swap rendering backends (WebGL, PixiJS, Three.js) later without rewriting gameplay code.
- **Main loop**: `Game._tick` drives a `requestAnimationFrame` loop that calls `scene.update(dt)` then `scene.render()` each frame, where `dt` is the elapsed time in seconds. `GameplayScene` uses this to animate its starfield — each star wraps back to the top once it scrolls past the bottom edge, producing a seamless, endless vertical scroll.
