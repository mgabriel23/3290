/**
 * Shop.js
 * A purchase screen opened by tapping the HUD's GOLD panel (see
 * HUD.isInsideGoldPanel) — freezes gameplay exactly like EnemyCodex's
 * overlay (GameplayScene checks `isOpen` the same way and treats the two
 * as mutually exclusive), dims the frozen frame behind it, and presents
 * itself as an equipment screen: the player's actual ship (a frozen,
 * never-`update()`'d `Player` instance, same "reuse the real render code"
 * approach EnemyCodex already uses for its enemy previews — no re-derived
 * approximation to keep in sync) sits center-screen, with one card per
 * upgradable part (see `PARTS` below) arranged in a pentagon around it and
 * tied back to it by a thin connector line — see `_cardCenter`/
 * `_renderConnectors`.
 *
 * Each of the five parts (wings, engine, cannon, magnet, missiles) has 10
 * levels: level 1 is the ship's free starting tier, levels 2-10 are bought
 * here with gold, each level's bonus deliberately small and each level's
 * cost multiplying steeply over the last (see Config.player.wings/engine/
 * cannon/magnet/missiles, each with its own `.levels` array holding that
 * level's stats and `cost`) — maxing any one part is meant to be a long-run
 * investment, not a couple of quick buys. A card shows the part's icon,
 * name, a "LV n/10" level readout, and a cost/MAX button — tapping anywhere
 * in the card buys the next level if affordable and not already maxed
 * (silently ignored otherwise, same as every other disabled control in this
 * game).
 *
 * Buying a level calls `Player.applyUpgrade(partId, level)` — on BOTH the
 * real gameplay `player` this class is constructed with AND this class's
 * own frozen preview instance — so the purchase takes effect immediately on
 * the actual ship (health/damage/fire-rate/magnet/missiles all read live off
 * `Player`'s own getters, nothing here caches a copy) and the preview
 * visibly updates to match in the same frame. `Player.applyUpgrade` is also
 * what persists the new level (via PlayerUpgrades.js) — this class only
 * tracks its own `_levels` mirror for rendering/afford-checks, loaded once
 * at construction the same way it loads gold.
 *
 * Closing is ONLY via the explicit `✕` button (`_isInsideCloseButton`) —
 * deliberately not by tapping the dimmed background (which sits "behind"
 * this popup and shouldn't be a hidden dismiss target) and not by re-tapping
 * the GOLD panel, which the dim overlay covers almost completely once open
 * anyway.
 */
import { Config } from '../core/Config.js';
import { getPartLevel } from '../core/PlayerUpgrades.js';
import { cornerBracketPath } from '../core/shapes.js';
import { Player } from './Player.js';

// Small local-space glyphs (roughly ±9vp, centered on the origin) — stroked
// at each card's icon slot via strokePaths' own {x, y} transform, same
// "parameterized local shape repositioned at render time" convention as
// PowerUps.js's own pickup icons.
//
// Array ORDER is what determines each card's position around the pentagon
// (see `_cardCenter` — index 0 sits straight up, then clockwise) — this is
// a Shop-layout-only arrangement, unrelated to where each part's decoration
// actually sits on the hull itself (wings' cannon nubs still render at the
// wingtips, cannon's spike still at the nose, etc. — see Player.js).
const PARTS = [
  {
    id: 'cannon', name: 'CANNON',
    icon: [{ points: [[-3, 8], [-3, -2], [-5, -2], [0, -9], [5, -2], [3, -2], [3, 8]], closed: true }],
  },
  {
    id: 'wings', name: 'WINGS',
    icon: [{ points: [[-9, 3], [-1, -5], [0, -2], [1, -5], [9, 3]], closed: false }],
  },
  {
    id: 'engine', name: 'ENGINE',
    icon: [{ points: [[0, -8], [5, 2], [0, 8], [-5, 2]], closed: true }],
  },
  {
    id: 'magnet', name: 'MAGNET',
    icon: [{ points: [[-5, -8], [-5, 3], [-3, 6], [0, 7], [3, 6], [5, 3], [5, -8]], closed: false }],
  },
  {
    id: 'missiles', name: 'MISSILES',
    icon: [{ points: [[0, -8], [4, -2], [4, 6], [2, 8], [-2, 8], [-4, 6], [-4, -2]], closed: true }],
  },
];

export class Shop {
  /**
   * @param {import('./HUD.js').HUD} hud  gold is spent directly on it, same direct-reference shape WaveManager already uses for score/gold
   * @param {import('./Player.js').Player} player  the real gameplay ship — purchases apply to it immediately, see class doc
   */
  constructor(hud, player) {
    this._hud    = hud;
    this._player = player;
    this._open   = false;
    this._age    = 0; // seconds since opened — drives the fade-in, same shape as EnemyCodex._cardAge
    this._levels = PARTS.map((part) => getPartLevel(part.id));

    // A real Player instance, positioned once and never `update()`'d — a
    // frozen portrait, same convention as EnemyCodex's preview instances —
    // so it renders at its true in-game appearance without a second,
    // separately-maintained ship drawing. Starts in sync with `player`
    // since both load the same persisted levels independently at
    // construction; kept in sync afterward by `_buy` below.
    this._shipPreview = new Player();
    this._shipPreview.x = Config.shop.ship.x;
    this._shipPreview.y = Config.shop.ship.y;
  }

  get isOpen() { return this._open; }

  open() {
    if (this._open) return;
    this._open = true;
    this._age = 0;
  }

  close() {
    this._open = false;
  }

  update(dt) {
    if (this._open) this._age += dt;
  }

  /** The close button always wins; otherwise a tap on a card buys its next level. Everything else (the dimmed background) is inert — see class doc. */
  handleTap(x, y) {
    if (!this._open) return;
    if (this._isInsideCloseButton(x, y)) { this.close(); return; }
    for (let i = 0; i < PARTS.length; i++) {
      if (this._isInsideCard(x, y, i)) { this._buy(i); return; }
    }
  }

  _buy(i) {
    const part = PARTS[i];
    const maxLevel = Config.player[part.id].levels.length;
    const level = this._levels[i];
    if (level >= maxLevel) return; // already maxed — silently ignored, same as tapping a disabled control
    const nextLevel = level + 1;
    const cost = Config.player[part.id].levels[nextLevel - 1].cost;
    if (this._hud.gold < cost) return; // can't afford — silently ignored
    this._hud.gold -= cost;
    this._levels[i] = nextLevel;
    this._player.applyUpgrade(part.id, nextLevel);
    this._shipPreview.applyUpgrade(part.id, nextLevel);
  }

  /**
   * Card `i`'s center — 5 cards evenly spaced around the ship on an ellipse
   * (Config.shop.cardRadiusX/Y), starting straight up (-90°) and proceeding
   * clockwise in 72° steps, so the pentagon always reads as one balanced
   * shape regardless of how many parts there are, rather than pinning
   * specific parts to specific compass points.
   */
  _cardCenter(i) {
    const { ship, cardRadiusX, cardRadiusY } = Config.shop;
    const angle = (-90 + i * (360 / PARTS.length)) * (Math.PI / 180);
    return { x: ship.x + Math.cos(angle) * cardRadiusX, y: ship.y + Math.sin(angle) * cardRadiusY };
  }

  _isInsideCloseButton(x, y) {
    const { x: bx, y: by, radius } = Config.shop.closeButton;
    const dx = x - bx, dy = y - by;
    return dx * dx + dy * dy <= radius * radius;
  }

  _isInsideCard(x, y, i) {
    const { cardWidth, cardHeight } = Config.shop;
    const { x: cx, y: cy } = this._cardCenter(i);
    return Math.abs(x - cx) <= cardWidth / 2 && Math.abs(y - cy) <= cardHeight / 2;
  }

  render(renderer) {
    if (!this._open) return;
    const cfg = Config.shop;
    const { width: vW } = Config.virtual;
    const alpha = Math.min(this._age / cfg.fadeInDuration, 1);

    renderer.clear(Config.colors.void, cfg.dimAlpha);

    renderer.drawText('SHIPYARD', vW / 2, cfg.titleY, {
      font: cfg.titleFont, color: cfg.titleColor, alpha,
    });
    renderer.drawText(`YOUR GOLD: ${this._hud.gold}`, vW / 2, cfg.balanceY, {
      font: cfg.balanceFont, color: cfg.balanceColor, alpha: alpha * 0.9,
    });

    this._renderConnectors(renderer, alpha);
    this._shipPreview.render(renderer);
    for (let i = 0; i < PARTS.length; i++) this._renderCard(renderer, i, alpha);
    this._renderCloseButton(renderer, alpha);

    renderer.drawText(cfg.footerText, vW / 2, cfg.footerY, {
      font: cfg.footerFont, color: cfg.footerColor, alpha: alpha * 0.6,
    });
  }

  /** Thin spokes from the ship out to each card — visually "this part belongs to that ship." */
  _renderConnectors(renderer, alpha) {
    const cfg = Config.shop;
    const paths = PARTS.map((_, i) => {
      const c = this._cardCenter(i);
      return { points: [[cfg.ship.x, cfg.ship.y], [c.x, c.y]], closed: false };
    });
    renderer.strokePaths(paths, {
      color: cfg.connectorColor, lineWidth: cfg.connectorLineWidth, alpha: alpha * cfg.connectorAlpha,
    });
  }

  _renderCard(renderer, i, alpha) {
    const cfg  = Config.shop;
    const part = PARTS[i];
    const { x: cx, y: cy } = this._cardCenter(i);
    const left  = cx - cfg.cardWidth  / 2, right  = cx + cfg.cardWidth  / 2;
    const top   = cy - cfg.cardHeight / 2, bottom = cy + cfg.cardHeight / 2;

    const maxLevel = Config.player[part.id].levels.length;
    const level    = this._levels[i];
    const maxed    = level >= maxLevel;
    const nextCost = maxed ? 0 : Config.player[part.id].levels[level].cost; // levels[level] is 0-based index for level+1
    const affordable = !maxed && this._hud.gold >= nextCost;
    const color = maxed ? cfg.buyMaxedColor : affordable ? cfg.buyAffordableColor : cfg.buyUnaffordableColor;

    renderer.strokePaths([
      cornerBracketPath(left,  top,    1,  1, cfg.cardLegSize),
      cornerBracketPath(right, top,   -1,  1, cfg.cardLegSize),
      cornerBracketPath(left,  bottom, 1, -1, cfg.cardLegSize),
      cornerBracketPath(right, bottom,-1, -1, cfg.cardLegSize),
    ], { color, lineWidth: cfg.cardLineWidth, glowBlur: cfg.cardGlowBlur, alpha });

    renderer.strokePaths(part.icon, {
      x: cx, y: cy + cfg.iconOffsetY, color: cfg.titleColor, lineWidth: cfg.iconLineWidth, glowBlur: cfg.iconGlowBlur, alpha,
    });
    renderer.drawText(part.name, cx, cy + cfg.nameOffsetY, {
      font: cfg.nameFont, color: cfg.nameColor, alpha,
    });
    renderer.drawText(`LV ${level}/${maxLevel}`, cx, cy + cfg.levelOffsetY, {
      font: cfg.levelFont, color: cfg.levelColor, alpha: alpha * 0.8,
    });
    renderer.drawText(maxed ? cfg.maxedText : `${nextCost} GOLD`, cx, cy + cfg.costOffsetY, {
      font: cfg.costFont, color, alpha,
    });
  }

  _renderCloseButton(renderer, alpha) {
    const cfg = Config.shop.closeButton;
    renderer.strokeCircle(cfg.x, cfg.y, cfg.radius, {
      color: cfg.color, lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur, alpha,
    });
    renderer.drawText('✕', cfg.x, cfg.y, {
      font: cfg.font, color: cfg.color, alpha,
    });
  }
}
