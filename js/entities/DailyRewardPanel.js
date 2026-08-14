/**
 * DailyRewardPanel.js
 * The once-a-day reward reveal — its OWN full screen (see Config.dailyReward
 * for tuning and core/DailyReward.js for the roll/persistence this only
 * renders and reacts to), not a modal drawn on top of the title card:
 * PrologueScene renders EITHER this OR the title/mode buttons for its
 * 'title' beat, never both, so nothing ever shows through a dimmed button
 * underneath and a mis-tap can't land on a mode button while this is open.
 * Same "closes ONLY via its own explicit button" rule as Shop.js's overlay
 * — here CLAIM both reveals the roll and commits it in one tap, since
 * there's nothing else to browse.
 *
 * Juice: the whole screen rises up out of a black veil on arrival and sinks
 * back into one on CLAIM (Config.dailyReward.entranceDuration/exitDuration —
 * the exact same Renderer.clear-with-alpha technique PrologueScene's own
 * fadeOut/skipFade beats use to dissolve TO black, just run in reverse on
 * the way in). On top of that, the card and CLAIM button scale-pop in with an overshoot bounce
 * (core/animation.js's easeOutBack — CLAIM staggered slightly behind the
 * card so they don't land in the same instant), a slow color halo breathes
 * behind the card, and a one-shot colored spark burst (the same pooled
 * Particles effect every enemy death already uses) fires the moment the
 * screen appears — all so the moment reads as "a reward," not a settings
 * dialog. Each of the 3 reward kinds also gets its own small vector icon
 * (a coin, a sparkle, a hexagon shield ring) rather than relying on text
 * alone to tell them apart at a glance.
 *
 * The reward itself is resolved once, at construction — PrologueScene
 * creates exactly one of these per boot, and the underlying roll is already
 * stable for the whole day (see DailyReward.js), so there's no reason to
 * re-check it every frame. A CLAIM tap starts the short exit veil rather
 * than closing instantly (see `_closing`/update); `isOpen` only flips false
 * once that finishes, which is what tells PrologueScene to go back to
 * rendering the title card.
 */
import { Config } from '../core/Config.js';
import { cornerBracketPath, diamondPath } from '../core/shapes.js';
import { wrapText } from '../core/textLayout.js';
import { easeOutBack } from '../core/animation.js';
import { Particles } from './Particles.js';
import { hasPendingReward, getPendingReward, claimReward } from '../core/DailyReward.js';

export class DailyRewardPanel {
  /** @param {import('../core/Renderer.js').Renderer} renderer  used once, at construction, to word-wrap the rolled reward's description (text/font are both fixed thereafter — see class doc's "resolved once" note) */
  constructor(renderer) {
    this._age = 0;
    this._closing = false; // true once CLAIM is tapped, while the exit veil is still falling — see handleTap/update
    this._closeAge = 0;
    this._pending = hasPendingReward();
    this._reward = this._pending ? getPendingReward() : null;
    this._descLines = this._pending ? this._wrapDescription(renderer) : [];

    this._chromePaths = this._buildChromePaths();
    this._cardPaths = this._buildCardPaths();
    this._claimButtonPaths = this._buildClaimButtonPaths();
    this._buildIconPaths();

    if (this._pending) {
      // One-shot celebratory burst, tinted to the rolled reward's own
      // color — fired immediately so it's already mid-burst by the first
      // real render, same "trigger at the moment of the thing, not on a
      // later tick" timing as every enemy-death Particles pool uses.
      const { width: vW } = Config.virtual;
      this._particles = new Particles(Config.dailyReward[this._reward.type].color, Config.dailyReward.burstSparkCount);
      this._particles.emit(vW / 2, Config.dailyReward.cardCenterY);
    }
  }

  /** False once the exit veil (after a CLAIM tap) finishes, or if there was never anything to claim today — PrologueScene gates both rendering and tap-routing on this. */
  get isOpen() { return this._pending; }

  update(dt) {
    if (!this._pending) return;
    this._age += dt;
    this._particles.update(dt);
    if (this._closing) {
      this._closeAge += dt;
      if (this._closeAge >= Config.dailyReward.exitDuration) this._pending = false;
    }
  }

  handleTap(x, y) {
    if (!this._pending || this._closing) return; // ignore taps once the exit veil has already started falling
    if (this._isInsideClaimButton(x, y)) {
      claimReward();
      this._closing = true;
    }
  }

  _wrapDescription(renderer) {
    const { descFont } = Config.dailyReward;
    const rewardCfg = Config.dailyReward[this._reward.type];
    const maxWidth = Config.dailyReward.cardWidth - 40;
    return wrapText(rewardCfg.description, maxWidth, (s) => renderer.measureText(s, descFont));
  }

  // --- One-time geometry (local/center-relative — see class doc) ---------------

  _buildChromePaths() {
    const { chromeMarginX, topRuleY, bottomRuleY } = Config.dailyReward;
    const { width: vW } = Config.virtual;
    const lx = chromeMarginX, rx = vW - chromeMarginX, cx = vW / 2, gap = 18, d = 4;
    return [
      { points: [[lx, topRuleY], [cx - gap, topRuleY]], closed: false },
      { points: [[cx + gap, topRuleY], [rx, topRuleY]], closed: false },
      diamondPath(cx, topRuleY, d),
      { points: [[lx, bottomRuleY], [cx - gap, bottomRuleY]], closed: false },
      { points: [[cx + gap, bottomRuleY], [rx, bottomRuleY]], closed: false },
      diamondPath(cx, bottomRuleY, d),
    ];
  }

  /** Corner brackets in LOCAL coordinates (card-center-relative) so the pop-in scale animation transforms them around their true center via strokePaths' {x, y, scale} — see render's popScale use. */
  _buildCardPaths() {
    const { cardWidth, cardHeight, cardLegSize } = Config.dailyReward;
    const halfW = cardWidth / 2, halfH = cardHeight / 2;
    return [
      cornerBracketPath(-halfW, -halfH, 1, 1, cardLegSize),
      cornerBracketPath(halfW, -halfH, -1, 1, cardLegSize),
      cornerBracketPath(-halfW, halfH, 1, -1, cardLegSize),
      cornerBracketPath(halfW, halfH, -1, -1, cardLegSize),
    ];
  }

  /** Same local-coordinates shape as _buildCardPaths, for the same reason. */
  _buildClaimButtonPaths() {
    const { width, height, legSize } = Config.dailyReward.claimButton;
    const halfW = width / 2, halfH = height / 2;
    return [
      cornerBracketPath(-halfW, -halfH, 1, 1, legSize),
      cornerBracketPath(halfW, -halfH, -1, 1, legSize),
      cornerBracketPath(-halfW, halfH, 1, -1, legSize),
      cornerBracketPath(halfW, halfH, -1, -1, legSize),
    ];
  }

  /**
   * One small glyph per reward kind, local-origin-centered like PowerUps.js's
   * own icon paths (see that file's _crossPaths/_hexPath) — gold reuses
   * GoldPickups' concentric-ring coin look (drawn directly in _renderIcon,
   * no path needed), luckyDrop gets a 4-point sparkle star (new — nothing
   * else in the game means "lucky/special"), shieldStart reuses the exact
   * hexagon ring PowerUps draws for the `invincible` pickup, since this
   * reward grants that same effect.
   */
  _buildIconPaths() {
    const g = Config.dailyReward.iconBadge.radius * 0.5;
    const k = g * 0.35;
    this._sparklePath = {
      points: [[0, -g], [k, -k], [g, 0], [k, k], [0, g], [-k, k], [-g, 0], [-k, -k]],
      closed: true,
    };
    const hexPts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      hexPts.push([Math.cos(a) * g, Math.sin(a) * g]);
    }
    this._hexPath = { points: hexPts, closed: true };
  }

  // --- Hit-testing (always full-size, unaffected by the pop-in animation) ------

  _isInsideClaimButton(x, y) {
    const { cardCenterY, claimButton } = Config.dailyReward;
    const { width: vW } = Config.virtual;
    const cx = vW / 2, cy = cardCenterY + claimButton.offsetY;
    return Math.abs(x - cx) <= claimButton.width / 2 && Math.abs(y - cy) <= claimButton.height / 2;
  }

  // --- Render --------------------------------------------------------------------

  render(renderer) {
    if (!this._pending) return;
    const cfg = Config.dailyReward;
    const { width: vW } = Config.virtual;
    const cx = vW / 2;
    const alpha = Math.min(this._age / cfg.fadeInDuration, 1);
    const cardScale = Math.max(0.02, easeOutBack(Math.min(this._age / cfg.popInDuration, 1), cfg.popInOvershoot));
    const claimT = Math.max(0, this._age - cfg.claimStagger) / cfg.popInDuration;
    const claimScale = Math.max(0.02, easeOutBack(Math.min(claimT, 1), cfg.popInOvershoot));

    renderer.clear(Config.colors.void);
    renderer.strokePaths(this._chromePaths, {
      color: cfg.chromeColor, lineWidth: cfg.chromeLineWidth, alpha: alpha * cfg.chromeAlpha,
    });

    renderer.drawText(cfg.titleText, cx, cfg.titleY, {
      font: cfg.titleFont, color: cfg.titleColor, alpha, glowBlur: cfg.titleGlowBlur, glowColor: cfg.titleColor,
    });
    renderer.drawText(cfg.subtitleText, cx, cfg.subtitleY, {
      font: cfg.subtitleFont, color: cfg.subtitleColor, alpha: alpha * 0.85,
    });

    this._renderHalo(renderer, alpha);
    this._particles.render(renderer);
    this._renderCard(renderer, cardScale, alpha);
    this._renderIcon(renderer, cx, cfg.cardCenterY - cfg.cardHeight / 2, cardScale, alpha);
    if (this._age > cfg.claimStagger) this._renderClaimButton(renderer, claimScale, alpha);

    // The veil: rising away on arrival (1 -> 0 over entranceDuration), or
    // falling again on CLAIM (0 -> 1 over exitDuration) — same void color
    // as the void clear above, so it reads as literally the same darkness
    // lifting/settling rather than a distinct overlay color.
    const veilAlpha = this._closing
      ? Math.min(this._closeAge / cfg.exitDuration, 1)
      : Math.max(0, 1 - this._age / cfg.entranceDuration);
    if (veilAlpha > 0) renderer.clear(Config.colors.void, veilAlpha);
  }

  _renderHalo(renderer, alpha) {
    const cfg = Config.dailyReward;
    const rewardCfg = cfg[this._reward.type];
    const { width: vW } = Config.virtual;
    const cx = vW / 2, cy = cfg.cardCenterY;
    const breathe = 0.5 + 0.5 * Math.sin(this._age * cfg.haloPulseSpeed);
    for (let i = 0; i < cfg.haloRingCount; i++) {
      const radius = cfg.haloBaseRadius + i * cfg.haloRingSpacing + breathe * 10;
      renderer.strokeCircle(cx, cy, radius, { color: rewardCfg.color, lineWidth: 1, alpha: alpha * cfg.haloAlpha });
    }
  }

  _renderCard(renderer, scale, alpha) {
    const cfg = Config.dailyReward;
    const rewardCfg = cfg[this._reward.type];
    const { width: vW } = Config.virtual;
    const cx = vW / 2, cy = cfg.cardCenterY;

    renderer.strokePaths(this._cardPaths, {
      x: cx, y: cy, scale, color: rewardCfg.color, lineWidth: cfg.cardLineWidth, glowBlur: cfg.cardGlowBlur, alpha,
    });

    renderer.drawText(rewardCfg.name, cx, cy - 20, {
      font: cfg.nameFont, color: rewardCfg.color, alpha, glowBlur: 8, glowColor: rewardCfg.color,
    });

    const valueLine = this._reward.type === 'gold' ? `+${this._reward.amount} GOLD` : 'NEXT RUN';
    renderer.drawText(valueLine, cx, cy + 15, {
      font: cfg.valueFont, color: rewardCfg.color, alpha,
    });

    const descStartY = cy + 45;
    this._descLines.forEach((line, i) => {
      renderer.drawText(line, cx, descStartY + i * cfg.descLineHeight, {
        font: cfg.descFont, color: cfg.descColor, alpha,
      });
    });
  }

  /** The reward's icon "medallion" — a filled+stroked circle straddling the card's top edge, tinted to the reward's color, with a distinguishing glyph inside. */
  _renderIcon(renderer, cx, cy, scale, alpha) {
    const cfg = Config.dailyReward.iconBadge;
    const rewardCfg = Config.dailyReward[this._reward.type];
    const r = cfg.radius * scale;

    renderer.fillEllipse(0, 0, r, r, { x: cx, y: cy, fillColor: rewardCfg.color, alpha: alpha * cfg.fillAlpha });
    renderer.strokeCircle(cx, cy, r, { color: rewardCfg.color, lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur, alpha });

    if (this._reward.type === 'gold') {
      // Concentric coin rings — same "this reads as a coin" look GoldPickups draws.
      renderer.strokeCircle(cx, cy, r * 0.5, { color: rewardCfg.color, lineWidth: cfg.lineWidth, alpha });
    } else if (this._reward.type === 'luckyDrop') {
      renderer.strokePaths([this._sparklePath], { x: cx, y: cy, scale, color: rewardCfg.color, lineWidth: cfg.lineWidth, alpha, lineCap: 'round' });
    } else {
      renderer.strokePaths([this._hexPath], { x: cx, y: cy, scale, color: rewardCfg.color, lineWidth: cfg.lineWidth, alpha });
    }
  }

  _renderClaimButton(renderer, scale, alpha) {
    const cfg = Config.dailyReward.claimButton;
    const { width: vW } = Config.virtual;
    const cx = vW / 2, cy = Config.dailyReward.cardCenterY + cfg.offsetY;
    const pulse = 1 - cfg.pulseDepth * (0.5 + 0.5 * Math.sin(this._age * cfg.pulseSpeed));
    const btnAlpha = alpha * pulse;

    renderer.strokePaths(this._claimButtonPaths, {
      x: cx, y: cy, scale, color: cfg.color, lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur, alpha: btnAlpha,
    });
    renderer.drawText(cfg.label, cx, cy, { font: cfg.font, color: cfg.color, alpha: btnAlpha });
  }
}
