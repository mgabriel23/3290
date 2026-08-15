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
 * fadeOut beat uses to dissolve TO black, just run in reverse on
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
 *
 * Above the card, `_renderStreakStrip` draws all 7 days of DailyReward.js's
 * calendar at once (see Config.dailyReward.streakStrip) — claimed days
 * check off, today pulses, and future days still show their own dimmed
 * icon rather than hiding what's coming. This is the panel's "come back
 * tomorrow" hook: a player can see day 7's jackpot pip from day 1 onward.
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
    this._pipFramePaths = this._buildPipFramePaths();
    this._buildIconPaths();

    if (this._pending) {
      // One-shot celebratory burst, tinted to the rolled reward's own
      // color — fired immediately so it's already mid-burst by the first
      // real render, same "trigger at the moment of the thing, not on a
      // later tick" timing as every enemy-death Particles pool uses.
      const { width: vW } = Config.virtual;
      this._particles = new Particles(this._reward.displayColor, Config.dailyReward.burstSparkCount);
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
    const { descFont, cardWidth } = Config.dailyReward;
    const maxWidth = cardWidth - 40;
    return wrapText(this._reward.displayDescription, maxWidth, (s) => renderer.measureText(s, descFont));
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

  /** Same local-coordinates shape as _buildCardPaths — one shared frame reused (translated via {x,y}) for all 7 streak-strip pips, since they're all the same size. */
  _buildPipFramePaths() {
    const { pipSize, pipLegSize } = Config.dailyReward.streakStrip;
    const half = pipSize / 2;
    return [
      cornerBracketPath(-half, -half, 1, 1, pipLegSize),
      cornerBracketPath(half, -half, -1, 1, pipLegSize),
      cornerBracketPath(-half, half, 1, -1, pipLegSize),
      cornerBracketPath(half, half, -1, -1, pipLegSize),
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

    // A claimed streak-strip pip's checkmark — drawn at pip-icon scale
    // directly (no strokePaths `scale` transform needed), open polyline.
    this._checkPath = { points: [[-7, 0], [-2, 6], [8, -8]], closed: false };
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

    this._renderStreakStrip(renderer, alpha);
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
    const { width: vW } = Config.virtual;
    const cx = vW / 2, cy = cfg.cardCenterY;
    const breathe = 0.5 + 0.5 * Math.sin(this._age * cfg.haloPulseSpeed);
    // Jackpot days breathe a visibly stronger halo — the biggest reward in
    // the cycle should read as the biggest moment on screen, not identical
    // to any other gold day.
    const haloAlpha = cfg.haloAlpha * (this._reward.jackpot ? 1.8 : 1);
    for (let i = 0; i < cfg.haloRingCount; i++) {
      const radius = cfg.haloBaseRadius + i * cfg.haloRingSpacing + breathe * 10;
      renderer.strokeCircle(cx, cy, radius, { color: this._reward.displayColor, lineWidth: 1, alpha: alpha * haloAlpha });
    }
  }

  _renderCard(renderer, scale, alpha) {
    const cfg = Config.dailyReward;
    const color = this._reward.displayColor;
    const { width: vW } = Config.virtual;
    const cx = vW / 2, cy = cfg.cardCenterY;

    renderer.strokePaths(this._cardPaths, {
      x: cx, y: cy, scale, color, lineWidth: cfg.cardLineWidth, glowBlur: cfg.cardGlowBlur, alpha,
    });

    renderer.drawText(this._reward.displayName, cx, cy - 20, {
      font: cfg.nameFont, color, alpha, glowBlur: 8, glowColor: color,
    });

    const valueLine = this._reward.type === 'gold' ? `+${this._reward.amount} GOLD` : 'NEXT RUN';
    renderer.drawText(valueLine, cx, cy + 15, {
      font: cfg.valueFont, color, alpha,
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
    const color = this._reward.displayColor;
    const r = cfg.radius * scale;
    // Jackpot's medallion glows harder than an ordinary day's — same signal as _renderHalo's boost.
    const glowBlur = this._reward.jackpot ? cfg.glowBlur * 1.6 : cfg.glowBlur;

    renderer.fillEllipse(0, 0, r, r, { x: cx, y: cy, fillColor: color, alpha: alpha * cfg.fillAlpha });
    renderer.strokeCircle(cx, cy, r, { color, lineWidth: cfg.lineWidth, glowBlur, alpha });

    if (this._reward.type === 'gold') {
      // Concentric coin rings — same "this reads as a coin" look GoldPickups draws.
      renderer.strokeCircle(cx, cy, r * 0.5, { color, lineWidth: cfg.lineWidth, alpha });
    } else if (this._reward.type === 'luckyDrop') {
      renderer.strokePaths([this._sparklePath], { x: cx, y: cy, scale, color, lineWidth: cfg.lineWidth, alpha, lineCap: 'round' });
    } else {
      renderer.strokePaths([this._hexPath], { x: cx, y: cy, scale, color, lineWidth: cfg.lineWidth, alpha });
    }
  }

  /**
   * The streak strip: 7 corner-bracket "day pips" above the main card,
   * reading the WHOLE calendar (not just today's roll) so a claimed streak
   * and the still-locked days ahead — especially day 7's jackpot — are both
   * visible at once. Claimed days get a checkmark; today's pip pulses;
   * future days still show their reward's own icon, just dimmed, so a
   * player can see what they're coming back for.
   */
  _renderStreakStrip(renderer, alpha) {
    const cfg = Config.dailyReward.streakStrip;
    const calendar = Config.dailyReward.calendar;
    const { width: vW } = Config.virtual;
    const streakDay = this._reward.streakDay;
    const totalW = 7 * cfg.pipSize + 6 * cfg.pipGap;
    const startX = vW / 2 - totalW / 2 + cfg.pipSize / 2;
    const cy = cfg.y;

    renderer.drawText(`DAY ${streakDay} STREAK`, vW / 2, cfg.labelY, {
      font: cfg.labelFont, color: cfg.currentColor, alpha, glowBlur: 6, glowColor: cfg.currentColor,
    });

    for (let i = 0; i < 7; i++) {
      const day = i + 1;
      const entry = calendar[i];
      const state = day < streakDay ? 'claimed' : day === streakDay ? 'current' : 'future';
      const cx = startX + i * (cfg.pipSize + cfg.pipGap);

      let color = cfg.futureColor;
      let pipAlpha = alpha;
      let glowBlur = 0;
      if (state === 'claimed') {
        color = cfg.claimedColor;
      } else if (state === 'current') {
        color = cfg.currentColor;
        glowBlur = 6;
        const pulse = 1 - cfg.currentPulseDepth * (0.5 + 0.5 * Math.sin(this._age * cfg.currentPulseSpeed));
        pipAlpha = alpha * pulse;
      } else {
        // Future — dimmed, but the jackpot slot still tints its OWN amber
        // rather than the flat grey every other future day uses, so it
        // stands out as the thing worth returning for.
        color = entry.jackpot ? entry.color : cfg.futureColor;
        pipAlpha = alpha * cfg.futureIconAlpha;
      }

      renderer.strokePaths(this._pipFramePaths, {
        x: cx, y: cy, color, lineWidth: cfg.pipLineWidth, glowBlur, glowColor: color, alpha: pipAlpha,
      });

      if (state === 'claimed') {
        renderer.strokePaths([this._checkPath], {
          x: cx, y: cy, color, lineWidth: cfg.checkLineWidth, alpha: pipAlpha, lineCap: 'round',
        });
      } else {
        this._renderPipIcon(renderer, cx, cy, entry.type, color, pipAlpha);
      }
    }
  }

  /** A single streak-strip pip's icon — the same coin/sparkle/hex glyphs _renderIcon draws on the big badge, shrunk to `streakStrip.iconScale`. */
  _renderPipIcon(renderer, cx, cy, type, color, alpha) {
    const cfg = Config.dailyReward.streakStrip;
    const r = Config.dailyReward.iconBadge.radius * 0.5 * cfg.iconScale;
    if (type === 'gold') {
      renderer.strokeCircle(cx, cy, r, { color, lineWidth: 1.5, alpha });
      renderer.strokeCircle(cx, cy, r * 0.5, { color, lineWidth: 1.5, alpha });
    } else if (type === 'luckyDrop') {
      renderer.strokePaths([this._sparklePath], { x: cx, y: cy, scale: cfg.iconScale, color, lineWidth: 1.5, alpha, lineCap: 'round' });
    } else {
      renderer.strokePaths([this._hexPath], { x: cx, y: cy, scale: cfg.iconScale, color, lineWidth: 1.5, alpha });
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
