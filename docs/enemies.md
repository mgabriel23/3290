# Enemy dictionary

Quick reference for every enemy type currently in the game — what it looks like, how it behaves, and where it lives in code. `type` is the string used both as the `Config.enemy[type]` key and as the `type` value in `Config.waves.levels` level definitions (`js/core/Config.js`). `#N` is the build order from commit history, for recall ("that was enemy #6, the one that dives").

## Scout / Rocketeer family — `js/entities/Enemy.js`

Same hull silhouette (a 10-point wireframe fighter), entrance glide → park → aim → fire cycle. Nose always points *away* from the player.

| # | Name | `type` | Color | Base HP (+/level) | Behavior |
|---|------|--------|-------|-------------------|----------|
| 1 | **Scout** | `scout` | Magenta `#ff3ec9` | 3 (+1) | Parks, then fires a 3-round burst of aimed bullets (each round re-aimed at the player's current position) on a 2.7s reload. |
| 2 | **Rocketeer** | `rocketeer` | Amber `#FFB020` | 2 (+1) | Slower reload (3.8s) but fires a homing rocket that tracks and detonates on proximity — harder to dodge than Scout's straight bullets. |

## Sniper — `js/entities/SniperEnemy.js`

| # | Name | `type` | Color | Base HP (+/level) | Behavior |
|---|------|--------|-------|-------------------|----------|
| 3 | **Sniper** | `sniper` | Electric violet `#BF5FFF` | 8 (+2) | Same hull as Scout. Charges (1.0s, nose orb grows) → locks onto the player's CURRENT position (white "!" telegraph, 0.7s) → fires a real bullet that crawls at 35vp/s for 0.35s, then rockets up to 900vp/s over 0.25s → recovers (0.6s) and repeats. Tanky — rewards reading the warning AND the bullet's slow start rather than tanking hits. |

## Drifter family — `js/entities/DrifterEnemy.js`

One shared alien tentacle-creature body (bell-shaped head, 4 trailing tentacles, pulsing eyes), spawned in conga-line formations that all share one precomputed path. Each clone independently lashes a slow tracking projectile at the player on its own timer. Never rests or tracks the player positionally — just flies its path and exits. Exception: Diver and Weaver (the two variants whose paths dive low enough to reach it) deal `barrierDamage` to the barrier and are destroyed on contact if not killed first — a one-shot impact, unlike Bouncer's repeated bounces.

| # | Name | Path variant | `type` | Color | Base HP (+/level) | Formation | Behavior |
|---|------|:---:|--------|-------|-------------------|:---:|----------|
| 4 | **Drifter** | 1 | `drifter` | Amber `#FFB020` | 3 (+1) | 8 | Diagonal entry from a top corner → one full loop-the-loop → continues diagonally off the far bottom corner. |
| 5 | **Sweeper** | 2 | `sweeper` | Magenta `#ff3ec9` | 3 (+1) | 15 | Straight horizontal row sweeps, stepping down and reversing direction at each screen edge. |
| 6 | **Diver** | 3 | `diver` | Neon green `#39ff14` | 3 (+1) | 5 | V-shaped wedge that drops straight down, accelerating (kinematic fall), always facing the player. Damages the barrier (10) and is destroyed on impact if it reaches it. |
| 7 | **Weaver** | 4 | `weaver` | Electric violet `#BF5FFF` | 3 (+1) | 6 | Descends straight down the screen while swaying side-to-side in a sine wave. Damages the barrier (10) and is destroyed on impact if it reaches it. |

## Bouncer family — `js/entities/BouncerEnemy.js`

Wireframe-only hexagon (no fill), drops from the top and bounces indefinitely off walls/top/barrier under constant gravity — never exits on its own, only destruction removes it. Each barrier bounce damages the barrier. Remaining health is drawn as a number at its center.

| # | Name | `type` | Color | Radius | Base HP (+/level) | Behavior |
|---|------|--------|-------|:---:|-------------------|----------|
| 8 | **Bouncer** | `bouncer` | Amber `#FFB020` | 20vp | 3 (+1) | The baseline — bounces forever, no special ability. |
| 9 | **Splitter** | `splitter` | Amber (same) | 40vp (~2×) | 12 (~4×) | Larger and tankier; on death breaks into 3 small `fragment` clones that kick outward. |
| 10 | **Shielded** | `shielded` | Amber core + ice-blue `#6FE0FF` shield ring | 32vp shield / 20vp core | 3 (+1) core | An outer shield ring (spins with the core) absorbs 2 hits — and sets the bounce/collision radius while up — before the core takes damage like a normal Bouncer. |
| — | *Fragment* | `'fragment'` (runtime-only, not a level `type`) | Amber | 12vp | 1 | Spawned only by a Splitter's death — not directly placeable in a level's enemy list. |

## Shared combat plumbing

Hit-flash, death-flash-then-remove, entry-glide, and engine-flame/core rendering are shared across Scout/Rocketeer/Sniper/Drifter (and partially Bouncer) via `js/entities/EnemyCombat.js` rather than duplicated per file — see that file if you're adding an 11th enemy type and want to reuse the same building blocks.
