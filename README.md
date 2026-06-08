# Space Shooter

A mobile-first 2D space shooter built with vanilla JavaScript and the HTML5 Canvas API — no frameworks, no build step.

## Status

Early foundation stage. The game currently renders a responsive, letterboxed battlefield (void background + glowing border) inside a phone-shaped device frame. No gameplay systems (entities, input, physics, game loop) exist yet — they're intentionally deferred until the rendering foundation is solid.

## Tech stack

- Vanilla JavaScript (native ES modules, no bundler/transpiler)
- HTML5 Canvas 2D for rendering
- Plain CSS, organized in cascade layers (reset → layout → components)
- Served as static files (this repo lives under XAMPP's `htdocs/`)

## Project structure

```
space-shooter/
├── index.html                          # Entry point — device frame + canvas
├── css/
│   ├── main.css                        # Aggregates layers in cascade order
│   ├── base/_reset.css                 # Modern reset + root theme tokens
│   ├── layouts/_app.css                # Centers the device frame in the viewport
│   └── components/_device-frame.css    # Phone-like frame & stage styling
├── js/
│   ├── main.js                         # Composition root — wires deps, starts the game
│   ├── core/
│   │   ├── Config.js                   # Frozen constants: virtual res, world layout, colors
│   │   ├── Game.js                     # App lifecycle: responsive sizing, render delegation
│   │   └── Renderer.js                 # Canvas 2D abstraction; draws in virtual coordinates
│   └── scenes/
│       └── GameplayScene.js            # Draws the battlefield (void fill + border)
├── assets/                             # audio/, fonts/, images/ (currently empty)
└── docs/                               # (currently empty)
```

## Running locally

This project uses native ES modules (`<script type="module">`), which browsers block from `file://` URLs — it must be served over HTTP:

- **XAMPP** (this repo already lives in `htdocs/`): start Apache and open `http://localhost/space-shooter/`
- **Or** any static file server, e.g. `npx serve .` from the project root

## Design notes

- **Virtual resolution**: gameplay is authored against a fixed 540×960 (9:16) virtual canvas (`Config.virtual`). The `Renderer` maps this onto the real backing store — accounting for device pixel ratio — so every draw call uses consistent virtual coordinates regardless of the device's actual screen size.
- **Letterboxing**: `Game._onResize` computes the largest rectangle that preserves the 9:16 aspect ratio within the available space, so the game never stretches or distorts on different screens.
- **Renderer as a seam**: scenes never touch the raw canvas context directly — they call a small, intentional set of primitives on `Renderer` (`clear`, `strokeRect`, …). This keeps the door open to swap rendering backends (WebGL, PixiJS, Three.js) later without rewriting gameplay code.
