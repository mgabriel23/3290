/**
 * Shop.js
 * A purchase screen opened by tapping the HUD's GOLD panel (see
 * HUD.isInsideGoldPanel) — freezes gameplay exactly like EnemyCodex's
 * overlay (GameplayScene checks `isOpen` the same way and treats the two
 * as mutually exclusive), dims the frozen frame behind it, and presents
 * itself as an equipment screen: the player's actual ship (a frozen,
 * never-`update()`'d `Player` instance, same "reuse the real render code"
 * approach EnemyCodex already uses for its enemy previews — no re-derived
 * approximation to keep in sync) sits center-screen, with one card per ship
 * "part" arranged at the four compass points around it, each tied back to
 * the ship by a thin connector line. Closing is ONLY via the explicit `✕`
 * button (`_isInsideCloseButton`) — deliberately not by tapping the dimmed
 * background (which sits "behind" this popup and shouldn't be a hidden
 * dismiss target) and not by re-tapping the GOLD panel, which the dim
 * overlay covers almost completely once open anyway.
 *
 * PLACEHOLDER: `ITEMS` below are stand-ins — names, descriptions, and costs
 * are made up, and buying one does nothing beyond deducting gold and
 * flipping to an "OWNED" state; no weapon/upgrade effect is wired up yet.
 * Real items/effects land once the shop's actual design is finalized —
 * until then this only proves out the open/close/buy interaction loop.
 * Ownership persists via Storage.js's loadBool/saveBool (same
 * `spaceShooter.` prefix the gold wallet itself uses) — spending real,
 * persistent gold on something that reset on the next run would read as
 * the gold simply vanishing, so "owned" has to survive exactly as long as
 * the gold that paid for it does.
 */
import { Config } from '../core/Config.js';
import { loadBool, saveBool } from '../core/Storage.js';
import { cornerBracketPath } from '../core/shapes.js';
import { Player } from './Player.js';

const ITEMS = [
  { id: 'weapon',   name: 'NOSE CANNON',       cost: 100, slot: 'top',    description: 'Increases bullet damage. (Placeholder — no effect yet.)' },
  { id: 'fireRate', name: 'RIGHT WING GUNS',   cost: 150, slot: 'right',  description: 'Increases fire rate. (Placeholder — no effect yet.)' },
  { id: 'barrier',  name: 'REACTOR CORE',      cost: 250, slot: 'bottom', description: 'Increases max barrier health. (Placeholder — no effect yet.)' },
  { id: 'armor',    name: 'LEFT WING PLATING', cost: 200, slot: 'left',   description: 'Increases max ship health. (Placeholder — no effect yet.)' },
];

export class Shop {
  /** @param {import('./HUD.js').HUD} hud  gold is spent directly on it, same direct-reference shape WaveManager already uses for score/gold */
  constructor(hud) {
    this._hud   = hud;
    this._open  = false;
    this._age   = 0; // seconds since opened — drives the fade-in, same shape as EnemyCodex._cardAge
    this._owned = ITEMS.map((item) => loadBool(`shop.${item.id}`, false));

    // A real Player instance, positioned once and never `update()`'d — a
    // frozen portrait, same convention as EnemyCodex's preview instances —
    // so it renders at its true in-game appearance without a second,
    // separately-maintained ship drawing.
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

  /** The close button always wins; otherwise a tap on an unowned card buys it. Everything else (the dimmed background) is inert — see class doc. */
  handleTap(x, y) {
    if (!this._open) return;
    if (this._isInsideCloseButton(x, y)) { this.close(); return; }
    for (let i = 0; i < ITEMS.length; i++) {
      if (this._owned[i]) continue;
      if (this._isInsideCard(x, y, i)) { this._buy(i); return; }
    }
  }

  _buy(i) {
    const item = ITEMS[i];
    if (this._hud.gold < item.cost) return; // can't afford — silently ignored, same as tapping a disabled control
    this._hud.gold -= item.cost;
    this._owned[i] = true;
    saveBool(`shop.${item.id}`, true);
  }

  /** Resolves a compass `slot` to its card's center — see Config.shop's own doc. */
  _cardCenter(slot) {
    const { ship, cardOffsetX, cardOffsetY } = Config.shop;
    switch (slot) {
      case 'top':    return { x: ship.x, y: ship.y - cardOffsetY };
      case 'bottom': return { x: ship.x, y: ship.y + cardOffsetY };
      case 'left':   return { x: ship.x - cardOffsetX, y: ship.y };
      default:       return { x: ship.x + cardOffsetX, y: ship.y }; // 'right'
    }
  }

  _isInsideCloseButton(x, y) {
    const { x: bx, y: by, radius } = Config.shop.closeButton;
    const dx = x - bx, dy = y - by;
    return dx * dx + dy * dy <= radius * radius;
  }

  _isInsideCard(x, y, i) {
    const { cardWidth, cardHeight } = Config.shop;
    const { x: cx, y: cy } = this._cardCenter(ITEMS[i].slot);
    return Math.abs(x - cx) <= cardWidth / 2 && Math.abs(y - cy) <= cardHeight / 2;
  }

  render(renderer) {
    if (!this._open) return;
    const cfg = Config.shop;
    const { width: vW } = Config.virtual;
    const alpha = Math.min(this._age / cfg.fadeInDuration, 1);

    renderer.clear(Config.colors.void, cfg.dimAlpha);

    renderer.drawText('SHOP', vW / 2, cfg.titleY, {
      font: cfg.titleFont, color: cfg.titleColor, alpha,
    });
    renderer.drawText(`YOUR GOLD: ${this._hud.gold}`, vW / 2, cfg.balanceY, {
      font: cfg.balanceFont, color: cfg.balanceColor, alpha: alpha * 0.9,
    });

    this._renderConnectors(renderer, alpha);
    this._shipPreview.render(renderer);
    for (let i = 0; i < ITEMS.length; i++) this._renderCard(renderer, i, alpha);
    this._renderCloseButton(renderer, alpha);

    renderer.drawText(cfg.footerText, vW / 2, cfg.footerY, {
      font: cfg.footerFont, color: cfg.footerColor, alpha: alpha * 0.6,
    });
  }

  /** Thin spokes from the ship out to each card — visually "this part belongs to that ship." */
  _renderConnectors(renderer, alpha) {
    const cfg = Config.shop;
    const paths = ITEMS.map((item) => {
      const c = this._cardCenter(item.slot);
      return { points: [[cfg.ship.x, cfg.ship.y], [c.x, c.y]], closed: false };
    });
    renderer.strokePaths(paths, {
      color: cfg.connectorColor, lineWidth: cfg.connectorLineWidth, alpha: alpha * cfg.connectorAlpha,
    });
  }

  _renderCard(renderer, i, alpha) {
    const cfg  = Config.shop;
    const item = ITEMS[i];
    const { x: cx, y: cy } = this._cardCenter(item.slot);
    const left  = cx - cfg.cardWidth  / 2, right  = cx + cfg.cardWidth  / 2;
    const top   = cy - cfg.cardHeight / 2, bottom = cy + cfg.cardHeight / 2;

    const owned = this._owned[i];
    const affordable = this._hud.gold >= item.cost;
    const color = owned ? cfg.buyOwnedColor : affordable ? cfg.buyAffordableColor : cfg.buyUnaffordableColor;

    renderer.strokePaths([
      cornerBracketPath(left,  top,    1,  1, cfg.cardLegSize),
      cornerBracketPath(right, top,   -1,  1, cfg.cardLegSize),
      cornerBracketPath(left,  bottom, 1, -1, cfg.cardLegSize),
      cornerBracketPath(right, bottom,-1, -1, cfg.cardLegSize),
    ], { color, lineWidth: cfg.cardLineWidth, glowBlur: cfg.cardGlowBlur, alpha });

    renderer.drawText(item.name, cx, cy - 16, {
      font: cfg.nameFont, color: cfg.nameColor, alpha,
    });
    renderer.drawText(owned ? 'OWNED' : `${item.cost} GOLD`, cx, cy + 14, {
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
