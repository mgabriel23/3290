/**
 * EnemyCodex.js
 * An in-gameplay reference: a small "?" button (always visible, top-center)
 * that opens a full-screen card browser — one card per enemy type, each
 * showing that enemy's real appearance, a short description, and its
 * stats — so the player (or the dev) can recall the whole roster without
 * leaving the game. `GameplayScene` freezes gameplay updates while
 * `isOpen` is true; this class owns everything about the button and the
 * overlay itself (state, hit-testing, rendering).
 *
 * No image assets, and no re-derived approximation of each enemy's look
 * either: every card constructs a real instance of the actual enemy class
 * (`Enemy`/`SniperEnemy`/`DrifterEnemy`/`BouncerEnemy`/`TetraEnemy`) and calls its real
 * render method(s), so a card is guaranteed to match gameplay exactly —
 * same hull points, same colors, same glow — at the enemy's real in-game
 * size (see `createPreviewInstance`). These preview instances are frozen
 * portraits: they're never `update()`'d, only positioned once and redrawn,
 * so they never fly off, bounce, or fire while on display.
 *
 * The `ENTRIES` descriptions below are condensed from docs/enemies.md (the
 * authoritative written reference) — update both if the roster changes, but
 * this file's copy is meant to be a shorter, at-a-glance version, not a
 * duplicate to keep byte-for-byte in sync.
 */
import { Config } from '../core/Config.js';
import { Enemy } from './Enemy.js';
import { SniperEnemy } from './SniperEnemy.js';
import { DrifterEnemy, createDrifterPath, createSweeperPath, createDiverPath, createWeaverPath } from './DrifterEnemy.js';
import { BouncerEnemy } from './BouncerEnemy.js';
import { TetraEnemy } from './TetraEnemy.js';
import { wrapText } from '../core/textLayout.js';
import { cornerBracketPath } from '../core/shapes.js';
import { playButtonClick } from '../core/UiSound.js';

// --- Preview instances --------------------------------------------------
// Every card's enemy is a real, live instance of its actual class,
// constructed once and parked at the frame's center — never `update()`'d,
// so it's a frozen portrait rather than a live simulation.

const PREVIEW_X = Config.virtual.width / 2;
const PREVIEW_Y = Config.codex.overlay.frameY;

function createPreviewInstance(type) {
  let instance;
  switch (type) {
    case 'scout':
    case 'rocketeer':
    case 'spitter':
      instance = new Enemy(PREVIEW_X, PREVIEW_X, PREVIEW_Y, type, 0);
      break;
    case 'sniper':
      instance = new SniperEnemy(PREVIEW_X, PREVIEW_X, PREVIEW_Y, 0);
      // Show it mid-charge — the growing nose orb is the ship's defining
      // visual trait — rather than its default just-spawned 'entering' pose.
      instance._state = 'charging';
      instance._stateAge = Config.enemy.sniper.chargeWarmup * 0.6;
      break;
    case 'drifter':
      instance = new DrifterEnemy(createDrifterPath(), 0, 0);
      break;
    case 'sweeper':
      instance = new DrifterEnemy(createSweeperPath(), 0, 0);
      break;
    case 'diver':
      instance = new DrifterEnemy(createDiverPath(), 0, 0);
      break;
    case 'weaver':
      instance = new DrifterEnemy(createWeaverPath(), 0, 0);
      break;
    case 'bouncer':
      instance = new BouncerEnemy({ variant: 1, x: PREVIEW_X, y: PREVIEW_Y, vx: 0, vy: 0 });
      break;
    case 'splitter':
      instance = new BouncerEnemy({ variant: 2, x: PREVIEW_X, y: PREVIEW_Y, vx: 0, vy: 0 });
      break;
    case 'shielded':
      instance = new BouncerEnemy({ variant: 3, x: PREVIEW_X, y: PREVIEW_Y, vx: 0, vy: 0 });
      break;
    case 'fragment':
      instance = new BouncerEnemy({ variant: 'fragment', x: PREVIEW_X, y: PREVIEW_Y, vx: 0, vy: 0 });
      break;
    case 'tetra':
      instance = new TetraEnemy(0);
      break;
  }
  // Pin every preview to the frame center in a consistent, upright pose,
  // regardless of whatever position/heading its constructor computed.
  instance.x = PREVIEW_X;
  instance.y = PREVIEW_Y;
  instance._angle = 0;
  if ('_cosA' in instance) { instance._cosA = 1; instance._sinA = 0; }
  return instance;
}

/** Draws one preview instance using its real render method(s) — see each class for what "kind" implies. */
function renderPreview(renderer, kind, instance) {
  if (kind === 'drifter') {
    instance.renderBody(renderer); // WaveManager normally draws this via its own batched hull pools — see DrifterEnemy.renderBody
    instance.render(renderer);     // tentacles + eyes
  } else {
    instance.render(renderer);     // Enemy/SniperEnemy: flame+hull+core. BouncerEnemy: already fully standalone.
  }
}

// --- Roster content -----------------------------------------------------
// `hp`/`hpPerLevel`/`points`/`gold` are read live from Config rather than
// hand-copied so this can't silently drift out of sync with the actual
// balance numbers. `color` is only used for this card's name-text accent —
// the preview instance's own render code sources its actual colors from
// Config itself.

const ENTRIES = [
  { buildOrder: 1, type: 'scout', name: 'Scout', family: 'Scout / Rocketeer family', kind: 'ship',
    color: Config.enemy.scout.color,
    hp: Config.enemy.scout.health, hpPerLevel: Config.enemy.scout.healthPerLevel,
    points: Config.enemy.scout.points, gold: Config.enemy.scout.gold,
    description: 'Enters, parks, then fires aimed bullet bursts at the player on a steady reload.' },

  { buildOrder: 2, type: 'rocketeer', name: 'Rocketeer', family: 'Scout / Rocketeer family', kind: 'ship',
    color: Config.enemy.rocketeer.color,
    hp: Config.enemy.rocketeer.health, hpPerLevel: Config.enemy.rocketeer.healthPerLevel,
    points: Config.enemy.rocketeer.points, gold: Config.enemy.rocketeer.gold,
    description: 'Same hull as Scout. Slower reload, but its rocket homes in and detonates on proximity — harder to dodge.' },

  { buildOrder: 3, type: 'spitter', name: 'Spitter', family: 'Scout / Rocketeer family', kind: 'ship',
    color: Config.enemy.spitter.color,
    hp: Config.enemy.spitter.health, hpPerLevel: Config.enemy.spitter.healthPerLevel,
    points: Config.enemy.spitter.points, gold: Config.enemy.spitter.gold,
    description: 'Same hull as Scout. Fires a single slow glob that bursts into a spread of shrapnel shortly after launch — dodge the burst, not just the glob.' },

  { buildOrder: 4, type: 'sniper', name: 'Sniper', family: 'Sniper', kind: 'ship',
    color: Config.enemy.sniper.color,
    hp: Config.enemy.sniper.health, hpPerLevel: Config.enemy.sniper.healthPerLevel,
    points: Config.enemy.sniper.points, gold: Config.enemy.sniper.gold,
    description: 'Charges, then fires a bullet at the player. It crawls at first, then rockets to full speed. Watch for the white "!" warning.' },

  { buildOrder: 5, type: 'drifter', name: 'Drifter', family: 'Drifter family', kind: 'drifter',
    color: Config.enemy.drifter.color,
    hp: Config.enemy.drifter.health, hpPerLevel: Config.enemy.drifter.healthPerLevel,
    points: Config.enemy.drifter.points, gold: Config.enemy.drifter.gold,
    description: 'A tentacle-creature formation flying a diagonal entry into a loop-the-loop. Lashes tracking projectiles at the player.' },

  { buildOrder: 6, type: 'sweeper', name: 'Sweeper', family: 'Drifter family', kind: 'drifter',
    color: Config.enemy.drifter.sweeper.color,
    hp: Config.enemy.drifter.health, hpPerLevel: Config.enemy.drifter.healthPerLevel,
    points: Config.enemy.drifter.sweeper.points, gold: Config.enemy.drifter.sweeper.gold,
    description: 'Same creature, in a formation that sweeps horizontal rows, stepping down and reversing at each screen edge.' },

  { buildOrder: 7, type: 'diver', name: 'Diver', family: 'Drifter family', kind: 'drifter',
    color: Config.enemy.drifter.diver.color,
    hp: Config.enemy.drifter.health, hpPerLevel: Config.enemy.drifter.healthPerLevel,
    points: Config.enemy.drifter.diver.points, gold: Config.enemy.drifter.diver.gold,
    description: 'A V-shaped wedge that drops straight down, accelerating as it falls. Reaches the barrier and damages it if not destroyed first.' },

  { buildOrder: 8, type: 'weaver', name: 'Weaver', family: 'Drifter family', kind: 'drifter',
    color: Config.enemy.drifter.weaver.color,
    hp: Config.enemy.drifter.health, hpPerLevel: Config.enemy.drifter.healthPerLevel,
    points: Config.enemy.drifter.weaver.points, gold: Config.enemy.drifter.weaver.gold,
    description: 'Descends the screen while swaying side-to-side. Also reaches the barrier and damages it if not destroyed first.' },

  { buildOrder: 9, type: 'bouncer', name: 'Bouncer', family: 'Bouncer family', kind: 'bouncer',
    color: Config.enemy.bouncer.color,
    hp: Config.enemy.bouncer.health, hpPerLevel: Config.enemy.bouncer.healthPerLevel,
    points: Config.enemy.bouncer.points, gold: Config.enemy.bouncer.gold,
    description: 'A wireframe hexagon that bounces forever off walls, the top edge, and the barrier — only destruction removes it.' },

  { buildOrder: 10, type: 'splitter', name: 'Splitter', family: 'Bouncer family', kind: 'bouncer',
    color: Config.enemy.bouncer.color,
    // Splitter/Shielded read their OWN healthPerLevel here, not the base
    // Bouncer's — they scale 1.5x faster (see the Config comment on each)
    // so their tankiness lead over a plain Bouncer holds up over a long
    // endless-mode run instead of decaying toward parity.
    hp: Config.enemy.bouncer.splitter.health, hpPerLevel: Config.enemy.bouncer.splitter.healthPerLevel,
    points: Config.enemy.bouncer.splitter.points, gold: Config.enemy.bouncer.splitter.gold,
    description: 'A larger, tankier Bouncer. On death it breaks into 3 small fragments that kick outward.' },

  { buildOrder: 11, type: 'shielded', name: 'Shielded', family: 'Bouncer family', kind: 'bouncer',
    color: Config.enemy.bouncer.color,
    hp: Config.enemy.bouncer.health, hpPerLevel: Config.enemy.bouncer.shielded.healthPerLevel,
    points: Config.enemy.bouncer.shielded.points, gold: Config.enemy.bouncer.shielded.gold,
    description: `A normal Bouncer core wrapped in a shield ring that absorbs ${Config.enemy.bouncer.shielded.shieldHits} hits before the core takes any damage.` },

  { buildOrder: 12, type: 'tetra', name: 'Tetra', family: 'Tetra', kind: 'tetra',
    color: Config.enemy.tetra.color,
    hp: Config.enemy.tetra.health, hpPerLevel: Config.enemy.tetra.healthPerLevel,
    points: Config.enemy.tetra.points, gold: Config.enemy.tetra.gold,
    description: 'A small cousin of Boss Tetra. Bounces off walls and the barrier while lobbing a scatter volley, then settles and sweeps 3 damaging beams before bouncing again.' },

  { buildOrder: 13, type: 'fragment', name: 'Splitter Fragment', family: 'Bouncer family (spawned only)', kind: 'bouncer',
    color: Config.enemy.bouncer.color,
    hp: Config.enemy.bouncer.splitter.fragmentHealth, hpPerLevel: Config.enemy.bouncer.splitter.fragmentHealthPerLevel,
    points: Config.enemy.bouncer.splitter.fragmentPoints, gold: Config.enemy.bouncer.splitter.fragmentGold,
    description: 'A small, low-health shard spawned only when a Splitter dies — not something you can place in a level directly.' },
];

// Preview instances are built once (constructing them is cheap and they
// never change), not per-frame or per-page-view.
for (const item of ENTRIES) item.preview = createPreviewInstance(item.type);

export class EnemyCodex {
  constructor() {
    this._open  = false;
    this._index = 0;
    this._age     = 0; // seconds — drives the idle button pulse
    this._cardAge = 0; // seconds since the card last opened/paged — drives the content fade-in
  }

  get isOpen() { return this._open; }

  update(dt) {
    this._age += dt;
    if (this._open) this._cardAge += dt;
  }

  /** @returns {boolean} true if (x, y) is inside the toggle button's circular hit area. */
  isInsideButton(x, y) {
    const { x: bx, y: by, radius } = Config.codex.button;
    const dx = x - bx, dy = y - by;
    return dx * dx + dy * dy <= radius * radius;
  }

  /** Routes a tap: the button always wins first; while open, the arrows are next; any other tap while open is swallowed so it can never reach ship-steering. */
  handleTap(x, y) {
    if (this.isInsideButton(x, y)) {
      playButtonClick();
      this._open = !this._open;
      this._cardAge = 0;
      return;
    }
    if (!this._open) return;
    if (this._isInsideArrow(x, y, -1)) { playButtonClick(); this._page(-1); return; }
    if (this._isInsideArrow(x, y, 1))  { playButtonClick(); this._page(1); return; }
  }

  _page(direction) {
    this._index = (this._index + direction + ENTRIES.length) % ENTRIES.length;
    this._cardAge = 0;
  }

  _arrowX(direction) {
    const { arrowMarginX } = Config.codex.overlay;
    const { width: vW } = Config.virtual;
    return direction < 0 ? arrowMarginX : vW - arrowMarginX;
  }

  _isInsideArrow(x, y, direction) {
    const { arrowY, arrowHalfSize } = Config.codex.overlay;
    return Math.abs(x - this._arrowX(direction)) <= arrowHalfSize
        && Math.abs(y - arrowY) <= arrowHalfSize;
  }

  render(renderer) {
    if (this._open) this._renderOverlay(renderer);
    this._renderButton(renderer);
  }

  /** Always drawn, on top of everything (including the overlay) — the same button toggles both open and closed. */
  _renderButton(renderer) {
    const cfg = Config.codex.button;
    const pulse = 1 - cfg.pulseDepth * (0.5 + 0.5 * Math.sin(this._age * cfg.pulseSpeed));
    renderer.strokeCircle(cfg.x, cfg.y, cfg.radius, {
      color: cfg.color, lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur, glowColor: cfg.color, alpha: pulse,
    });
    renderer.drawText(this._open ? '✕' : '?', cfg.x, cfg.y, {
      font: cfg.font, color: cfg.color, alpha: pulse,
    });
  }

  _renderOverlay(renderer) {
    const cfg  = Config.codex.overlay;
    const { width: vW } = Config.virtual;
    const item = ENTRIES[this._index];
    const alpha = Math.min(this._cardAge / cfg.fadeInDuration, 1);

    renderer.clear(Config.colors.void, cfg.dimAlpha);

    renderer.drawText('ENEMY CODEX', vW / 2, cfg.titleY, {
      font: cfg.titleFont, color: cfg.titleColor, alpha,
    });
    renderer.drawText(`${this._index + 1} / ${ENTRIES.length}`, vW / 2, cfg.progressY, {
      font: cfg.progressFont, color: cfg.progressColor, alpha: alpha * 0.7,
    });

    this._renderFrame(renderer, alpha);
    renderPreview(renderer, item.kind, item.preview);

    renderer.drawText(item.name, vW / 2, cfg.nameY, {
      font: cfg.nameFont, color: item.color, glowBlur: cfg.nameGlowBlur, glowColor: item.color, alpha,
    });
    renderer.drawText(`#${item.buildOrder} · ${item.family}`, vW / 2, cfg.tagY, {
      font: cfg.tagFont, color: cfg.tagColor, alpha: alpha * 0.85,
    });

    const lines = wrapText(item.description, cfg.descMaxWidth, (s) => renderer.measureText(s, cfg.descFont));
    for (let i = 0; i < lines.length; i++) {
      renderer.drawText(lines[i], vW / 2, cfg.descY + i * cfg.descLineHeight, {
        font: cfg.descFont, color: cfg.descColor, alpha,
      });
    }

    const hpText = item.hpPerLevel > 0 ? `HP ${item.hp} (+${item.hpPerLevel}/level)` : `HP ${item.hp}`;
    renderer.drawText(hpText, vW / 2, cfg.statY, {
      font: cfg.statFont, color: cfg.statColor, alpha,
    });
    renderer.drawText(`${item.points} PTS  ·  ${item.gold} GOLD`, vW / 2, cfg.rewardY, {
      font: cfg.rewardFont, color: cfg.rewardColor, alpha: alpha * 0.85,
    });

    this._renderArrow(renderer, -1, alpha);
    this._renderArrow(renderer, 1, alpha);

    renderer.drawText(cfg.footerText, vW / 2, cfg.footerY, {
      font: cfg.footerFont, color: cfg.footerColor, alpha: alpha * 0.6,
    });
  }

  /** A corner-bracket "display case" around the preview — same chrome motif as HUD/title screen — anchoring the thumbnail's whitespace instead of leaving it ambiguous. */
  _renderFrame(renderer, alpha) {
    const cfg = Config.codex.overlay;
    const { width: vW } = Config.virtual;
    const cx = vW / 2, cy = cfg.frameY;
    const left = cx - cfg.frameHalfWidth, right = cx + cfg.frameHalfWidth;
    const top  = cy - cfg.frameHalfHeight, bottom = cy + cfg.frameHalfHeight;

    renderer.strokePaths([
      cornerBracketPath(left,  top,    1,  1, cfg.frameLegSize),
      cornerBracketPath(right, top,   -1,  1, cfg.frameLegSize),
      cornerBracketPath(left,  bottom, 1, -1, cfg.frameLegSize),
      cornerBracketPath(right, bottom,-1, -1, cfg.frameLegSize),
    ], {
      color: cfg.frameColor, lineWidth: cfg.frameLineWidth, glowBlur: cfg.frameGlowBlur, glowColor: cfg.frameColor, alpha: alpha * 0.6,
    });
  }

  _renderArrow(renderer, direction, alpha) {
    const cfg = Config.codex.overlay;
    const half = 10;
    const points = direction < 0
      ? [[half, -half], [-half, 0], [half, half]]
      : [[-half, -half], [half, 0], [-half, half]];
    renderer.strokePaths([{ points, closed: false }], {
      x: this._arrowX(direction), y: cfg.arrowY,
      color: cfg.arrowColor, lineWidth: 3, glowBlur: cfg.arrowGlowBlur, glowColor: cfg.arrowColor, alpha,
    });
  }
}
