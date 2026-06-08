# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A mobile-first 2D space shooter built with vanilla JavaScript (native ES modules) and the Canvas 2D API. No frameworks, no bundler, no `package.json` — plain static files served via XAMPP (the project lives in `htdocs/`, served at `http://localhost/space-shooter/`).

## Current state

Foundation stage only: a responsive, letterboxed canvas renders an empty battlefield (void fill + glowing border) inside a phone-shaped device frame. There is **no game loop, no entities, no input handling, and no physics yet** — this is deliberate, per the comments in [Game.js](js/core/Game.js) and [GameplayScene.js](js/scenes/GameplayScene.js) ("adding a requestAnimationFrame tick now would be speculative"). Don't scaffold systems that haven't been asked for yet — build the next milestone when the user asks for it, not preemptively.

## Architecture & conventions to preserve

- **Composition root**: [main.js](js/main.js) is the *only* place that touches the DOM and wires concrete dependencies together. Don't reach into `document` from elsewhere — pass dependencies in through constructors instead.
- **Config is data-only**: [Config.js](js/core/Config.js) is a frozen object containing constants only, no logic. Add new tunables there rather than hardcoding magic numbers inside systems.
- **Renderer is the seam**: [Renderer.js](js/core/Renderer.js) wraps the canvas 2D context and exposes a small, intentional surface of primitives (`clear`, `strokeRect`, …) in *virtual coordinates*. Scenes must never call `canvas.getContext('2d')` or touch the raw context — extend the Renderer's API instead. This keeps the rendering backend swappable later (WebGL/PixiJS/etc.) without rewriting game systems.
- **Virtual coordinate system**: gameplay is authored against a fixed 540×960 (9:16) virtual resolution (`Config.virtual`). `Renderer.resize` derives one scale factor mapping virtual units to backing-store pixels (accounting for `devicePixelRatio`). Always express new positions/sizes in virtual units, never raw canvas pixels.
- **Scenes own `render()`**: a scene receives a `Renderer` and draws one frame per call. [GameplayScene.js](js/scenes/GameplayScene.js) is the template for future scenes (menu, game-over, etc.).
- **Letterboxing**: `Game._onResize` fits the virtual aspect ratio inside the available stage space without distortion — preserve this behavior when touching resize/scaling logic.

## Style notes

- Each core file opens with a JSDoc-style block comment explaining *why* the file exists and what seam/responsibility it owns (not just what it does). Match this tone when adding new core files — explain rationale, not mechanics.
- No build tooling: code must run as-is via `<script type="module">`. Stick to ES module syntax that browsers support natively (no TypeScript, no JSX, no bundler-only features).
- CSS is layered (`base` → `layouts` → `components`) and aggregated via `@import` in [main.css](css/main.css). Follow the existing BEM-ish naming (`.device-frame__stage`) and put new component styles in their own `components/_*.css` file, then add the `@import`.

## Running & verifying changes

Serve over HTTP — ES modules are blocked from `file://` URLs. With XAMPP/Apache running, open `http://localhost/space-shooter/`. There is no test suite or build step; verify visual/behavioral changes by loading the page in a browser (and check the responsive letterboxing by resizing the window).
