/**
 * EnemyCombat.js
 * Small shared behaviors reused across the "ship" enemy classes (Enemy,
 * SniperEnemy, DrifterEnemy, and — partially — BouncerEnemy): taking a
 * bullet hit, holding position while the death-flash plays out, gliding in
 * from the spawn edge to a resting position, and drawing the shared
 * hull/engine-flame/engine-core look.
 *
 * These are plain functions that take the enemy instance as their first
 * argument rather than a base class: the four enemy classes have different
 * constructor shapes and fields (Drifter has no `_state` machine, Bouncer
 * has no `_cfg`/`_angle` in the same shape), so a shared base class would
 * force them into a common shape they don't actually share. Plain functions
 * let each class opt into only the pieces it needs — the same pattern
 * DrifterEnemy.js already uses for its exported path-sampling functions.
 */
import { Config } from '../core/Config.js';

/**
 * Register one bullet hit. Triggers a white flash regardless of outcome.
 * Returns `true` if this hit was fatal (health reached 0).
 * @param {{ _dying: boolean, _hitFlash: number, _health: number }} enemy
 * @param {number} [damage]  health points removed — scales with player level
 * @param {number} [flashDuration]  seconds the white hit-flash lasts
 * @returns {boolean}
 */
export function applyHit(enemy, damage = 1, flashDuration = Config.enemy.hitFlashDuration) {
  if (enemy._dying) return false; // already in death animation — ignore further hits
  enemy._hitFlash = flashDuration;
  enemy._health -= damage;
  if (enemy._health <= 0) {
    enemy._dying = true;
    return true; // killed
  }
  return false;
}

/**
 * Ticks the hit-flash timer down and, once an enemy is dying, holds it in
 * place until the flash finishes before marking it `alive = false`.
 * @param {{ _hitFlash: number, _dying: boolean, alive: boolean }} enemy
 * @param {number} dt
 * @returns {boolean} true if the enemy is dying — caller should stop updating it this frame
 */
export function tickDeathState(enemy, dt) {
  if (enemy._hitFlash > 0) enemy._hitFlash -= dt;
  if (enemy._dying) {
    if (enemy._hitFlash <= 0) enemy.alive = false;
    return true;
  }
  return false;
}

/** Move an enemy's state machine to `name`, resetting its age counter. */
export function setState(enemy, name) {
  enemy._state = name;
  enemy._stateAge = 0;
}

/**
 * Diagonal entry glide: lerp x from the spawn column toward the rest column
 * while y advances at `cfg.entrySpeed`, snapping to the exact rest position
 * and transitioning to `nextState` once it arrives.
 * @param {{ x: number, y: number, _spawnX: number, _restX: number, _restY: number }} enemy
 * @param {{ entrySpeed: number }} cfg
 * @param {number} dt
 * @param {string} nextState
 */
export function stepEntryGlide(enemy, cfg, dt, nextState) {
  enemy.y += cfg.entrySpeed * dt;
  const t = Math.max(0, Math.min(1, enemy.y / enemy._restY));
  enemy.x = enemy._spawnX + (enemy._restX - enemy._spawnX) * t;
  if (enemy.y >= enemy._restY) {
    enemy.x = enemy._restX;
    enemy.y = enemy._restY;
    setState(enemy, nextState);
  }
}

/**
 * Fill+stroke an enemy's hull polygon at its current position/angle,
 * flashing white while hit-flashing. WaveManager doesn't call this for real
 * gameplay — it pre-transforms `hullPts` into its own pooled arrays instead,
 * so many enemies' hulls can be batched into one shadow-blur pass. This is
 * the standalone equivalent, for contexts that only ever render one enemy
 * at a time (currently: EnemyCodex's preview cards).
 * @param {import('../core/Renderer.js').Renderer} renderer
 * @param {{ x: number, y: number, _angle: number, _cfg: object, _hitFlash: number }} enemy
 * @param {Array<[number, number]>} hullPts
 * @param {number} [alpha]  optional entrance-fade multiplier — see Renderer's
 *   `drawImage`/`Starfield.render` convention; real gameplay never passes
 *   this (defaults to 1), only cinematic previews (EnemyCodex, PrologueScene)
 *   that need to fade a single instance in do.
 */
export function renderHull(renderer, enemy, hullPts, alpha = 1) {
  const cfg   = enemy._cfg;
  const flash = enemy._hitFlash > 0;
  // Cache the wrapper array + path object on the enemy instance — `hullPts`
  // is a fixed per-type constant, so every boss class calling this every
  // frame (BossEnemy, SpiralBoss, TetraBoss, NovaBoss, ZigzagBoss) reuses
  // the same objects instead of reallocating them each call.
  if (!enemy._hullPathArr || enemy._hullPathArr[0].points !== hullPts) {
    enemy._hullPathArr = [{ points: hullPts, closed: true }];
  }
  renderer.fillStrokePaths(enemy._hullPathArr, {
    x: enemy.x, y: enemy.y, rotation: enemy._angle, alpha,
    fillColor:   flash ? '#ffffff' : cfg.fillColor,
    strokeColor: flash ? '#ffffff' : cfg.color,
    lineWidth:   cfg.lineWidth,
    glowBlur:    flash ? cfg.hitGlowBlur : cfg.glowBlur,
    glowColor:   flash ? '#ffffff' : cfg.color,
  });
}

/**
 * Engine exhaust triangle, anchored at local `(noseX, noseY)` — must be
 * drawn BEFORE the hull so it appears behind it.
 * @param {import('../core/Renderer.js').Renderer} renderer
 * @param {{ x: number, y: number, _angle: number, _cfg: object, _enginePhase: number }} enemy
 * @param {number} [alpha]  see renderHull's alpha doc
 */
export function renderEngineFlame(renderer, enemy, noseX, noseY, baseLength, alpha = 1) {
  const cfg = enemy._cfg;
  renderer.drawFlame(noseX, noseY, baseLength + Math.sin(enemy._enginePhase) * 2, {
    x: enemy.x, y: enemy.y, rotation: enemy._angle, alpha,
    halfWidth: cfg.flameHalfWidth,
    color:     cfg.flameColor,
  });
}

/**
 * Engine core orb, anchored at local `(localX, localY)` — must be drawn
 * AFTER the hull so it sits on top of it. Flashes white while hit-flashing.
 * @param {import('../core/Renderer.js').Renderer} renderer
 * @param {{ x: number, y: number, _angle: number, _cfg: object, _hitFlash: number }} enemy
 * @param {number} [alpha]  see renderHull's alpha doc
 */
export function renderEngineCore(renderer, enemy, localX, localY, rx, ry, alpha = 1) {
  const cfg = enemy._cfg;
  renderer.fillEllipse(localX, localY, rx, ry, {
    x: enemy.x, y: enemy.y, rotation: enemy._angle, alpha,
    fillColor: enemy._hitFlash > 0 ? cfg.color : cfg.engineCoreColor,
  });
}
