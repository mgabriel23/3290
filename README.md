# Space Shooter

A mobile-first 2D space shooter built with vanilla JavaScript and the HTML5 Canvas API — no frameworks, no build step.

## Status

Early foundation stage. The game renders full-screen, edge-to-edge (no browser chrome/frame). It opens on an intro prompt — a static "swipe up to continue" label over the same void backdrop the gameplay scene uses (so the handoff is visually seamless) — and swiping up starts the background music and immediately reveals the gameplay scene's animated backdrop: a drifting, seamlessly-looping starfield made of a few parallax layers. A minimal `requestAnimationFrame` loop drives the gameplay scene's animation. No other gameplay systems (entities, physics, HUD) exist yet — they're intentionally deferred until the rendering foundation is solid.

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
│   │   ├── Config.js                   # Frozen constants: virtual res, intro/audio tuning, starfield layers, colors
│   │   ├── Game.js                     # App lifecycle: sizing, scene switching, input routing, main loop
│   │   ├── Renderer.js                 # Canvas 2D abstraction; draws in virtual coordinates
│   │   └── SwipeInput.js               # Pointer-based upward-swipe/drag gesture detector
│   └── scenes/
│       ├── IntroScene.js               # Opening prompt: "swipe up to continue" → music + handoff
│       └── GameplayScene.js            # Animated backdrop: seamlessly-scrolling starfield
├── assets/                             # audio/ (theme.mp3), fonts/, images/
└── docs/                               # (currently empty)
```

## Running locally

This project uses native ES modules (`<script type="module">`), which browsers block from `file://` URLs — it must be served over HTTP:

- **XAMPP** (this repo already lives in `htdocs/`): start Apache and open `http://localhost/space-shooter/`
- **Or** any static file server, e.g. `npx serve .` from the project root

## Design notes

- **Virtual resolution**: gameplay is authored against a fixed 540×960 (9:16) virtual canvas (`Config.virtual`). The `Renderer` maps this onto the real backing store — accounting for device pixel ratio — so every draw call uses consistent virtual coordinates regardless of the device's actual screen size.
- **Full-screen with letterboxing**: the `.app` stage fills the viewport edge-to-edge (`width: 100%`, `height: 100dvh`) up to `--game-max-width` (capped and centered on large screens so the game stays a comfortable, phone-like size rather than stretching across huge displays). `Game._onResize` then sizes the canvas to the largest rectangle that preserves the 9:16 aspect ratio within the stage. The stage's background matches the canvas's void color, so any letterbox bars blend in seamlessly rather than reading as a visible "frame".
- **Renderer as a seam**: scenes never touch the raw canvas context directly — they call a small, intentional set of primitives on `Renderer` (`clear`, `drawImage`, `drawText`, with more added as gameplay needs them). `drawImage` accepts an optional `alpha` (0–1) so scenes can fade content in/out without ever reaching for `globalAlpha` themselves. This keeps the door open to swap rendering backends (WebGL, PixiJS, Three.js) later without rewriting gameplay code.
- **Main loop & scene switching**: `Game._tick` drives a `requestAnimationFrame` loop that calls `scene.update(dt)` then `scene.render()` each frame on whichever scene is current, where `dt` is the elapsed time in seconds. `Game` itself owns *which* scene is active and swaps it via a constructor-injected completion callback — `IntroScene` takes `{ onContinue }` and calls it the moment the player swipes (its label is static; nothing animates first), and `Game._startGameplay` is what actually replaces `this.scene` with a fresh `GameplayScene`.
- **Bake-once, blit-many starfield**: rather than redrawing every star each frame, `GameplayScene` pre-renders each parallax layer's stars ONCE onto an off-screen canvas tile (`_bakeTile`, plain squares via `fillRect`), then each frame just translates and blits that tile twice via `Renderer.drawImage` — the classic two-copy seamless-scroll technique (one copy positioned one tile-height above the other, so the wrap point never shows). Per-frame cost stays flat and tiny — just a handful of `drawImage` calls — regardless of star count, which keeps it cheap on low-end devices.
- **Soft entrance fade**: the starfield doesn't snap into view — `GameplayScene` tracks how long it's been running (`_age`) and ramps a shared `alpha` from 0 to 1 over `Config.starfield.fadeInDuration`, applying it to every tile blit. Since the intro and gameplay scenes share the same void background color, this makes the stars feel like they gently emerge from the dark rather than popping in.
- **Gesture input, routed by scene**: `SwipeInput` listens on the stage via the Pointer Events API (one code path for touch *and* mouse, so gestures work with a finger on a phone or a mouse drag on desktop) and reports a normalized "swipe up" callback. `Game` owns the single instance and forwards the gesture to whichever scene is active (`scene.handleSwipeUp?.()`) — today only `IntroScene` implements a handler.
- **Audio started synchronously from the gesture handler**: `IntroScene.handleSwipeUp` calls `audio.play()` directly, in the same tick as the gesture. Browsers require playback to start within a user gesture's "activation" window — even a short `requestAnimationFrame`-driven animation can run past it — so any future sound-on-gesture code must trigger playback immediately in the handler, not after some animation finishes.
