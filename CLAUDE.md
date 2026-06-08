# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A mobile-first 2D space shooter built with vanilla JavaScript (native ES modules) and the Canvas 2D API. No frameworks, no bundler, no `package.json` — plain static files served via XAMPP (the project lives in `htdocs/`, served at `http://localhost/space-shooter/`).

## Current state

Foundation stage only: the game runs full-screen, edge-to-edge (the `.app` stage fills the viewport, capped on large screens, no bezel/frame chrome), and a responsive, letterboxed canvas renders nothing but the void backdrop. There is **no game loop, no entities, no input handling, no physics, and no on-screen decoration (e.g. borders/HUD) yet** — this is deliberate, per the comments in [Game.js](js/core/Game.js) and [GameplayScene.js](js/scenes/GameplayScene.js) ("adding a requestAnimationFrame tick now would be speculative"). Don't scaffold systems that haven't been asked for yet — build the next milestone when the user asks for it, not preemptively.

## Architecture & conventions to preserve

- **Composition root**: [main.js](js/main.js) is the *only* place that touches the DOM and wires concrete dependencies together. Don't reach into `document` from elsewhere — pass dependencies in through constructors instead.
- **Config is data-only**: [Config.js](js/core/Config.js) is a frozen object containing constants only, no logic. Add new tunables there rather than hardcoding magic numbers inside systems.
- **Renderer is the seam**: [Renderer.js](js/core/Renderer.js) wraps the canvas 2D context and exposes a small, intentional surface of primitives (currently just `clear`) in *virtual coordinates*. Scenes must never call `canvas.getContext('2d')` or touch the raw context — extend the Renderer's API instead, adding only the primitives a feature actually needs — and removing them again once their last caller is gone (e.g. `strokeRect` was dropped along with the battlefield-border decoration it existed solely to draw). This keeps the rendering backend swappable later (WebGL/PixiJS/etc.) without rewriting game systems.
- **Virtual coordinate system**: gameplay is authored against a fixed 540×960 (9:16) virtual resolution (`Config.virtual`). `Renderer.resize` derives one scale factor mapping virtual units to backing-store pixels (accounting for `devicePixelRatio`). Always express new positions/sizes in virtual units, never raw canvas pixels.
- **Scenes own `render()`**: a scene receives a `Renderer` and draws one frame per call. [GameplayScene.js](js/scenes/GameplayScene.js) is the template for future scenes (menu, game-over, etc.).
- **Full-screen, frame-free**: there is deliberately no device/phone-frame chrome — `.app` (the stage, `#game-stage`) is `width: 100%`, so on real phones (always narrower than the cap) it fills the device edge-to-edge. `max-width: var(--game-max-width)` (480px — sized to match the largest current phones in portrait, e.g. iPhone Pro Max ≈ 430px) only ever engages on screens *wider* than that, capping and centering the play area so desktop/tablet users still see something that reads as "a phone screen" rather than a stretched-out rectangle. Its background matches the canvas's void color, so any letterbox bars blend in invisibly. Don't reintroduce bezel/border/decorative-frame wrappers around the stage — the cap is a size limit, not a mockup chrome.
- **Avoid `100vw`/`100vh` on the stage**: they include the scrollbar gutter and can overshoot the visible viewport, creating a stray gap + scrollbar. `html`/`body` carry `overflow: hidden` and `.app` uses `width: 100%` / `height: 100dvh` instead — preserve this combo if you touch viewport sizing.
- **Letterboxing**: `Game._onResize` fits the virtual aspect ratio inside the available stage space without distortion — preserve this behavior when touching resize/scaling logic.

## Style notes

- Each core file opens with a JSDoc-style block comment explaining *why* the file exists and what seam/responsibility it owns (not just what it does). Match this tone when adding new core files — explain rationale, not mechanics.
- No build tooling: code must run as-is via `<script type="module">`. Stick to ES module syntax that browsers support natively (no TypeScript, no JSX, no bundler-only features).
- CSS is layered (`base` → `layouts`, with a `components/` layer to be added as UI grows) and aggregated via `@import` in [main.css](css/main.css). Follow the existing BEM-ish naming (`.app__canvas`) and, for new UI components, give each its own `components/_*.css` file plus an `@import`.

## Running & verifying changes

Serve over HTTP — ES modules are blocked from `file://` URLs. With XAMPP/Apache running, open `http://localhost/space-shooter/`. There is no test suite or build step; verify visual/behavioral changes by loading the page in a browser (and check the responsive letterboxing by resizing the window).
