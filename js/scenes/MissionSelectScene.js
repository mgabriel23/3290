/**
 * MissionSelectScene.js
 * Mission Mode's level-select screen — reached after choosing MISSION MODE
 * on the title card (see PrologueScene) and finishing the tutorial (Game.js
 * routes here the same way it would normally go straight to gameplay).
 * Shows one node per mission (Config.mission.count, 50), laid out as a
 * zigzag journey map — odd levels on the left, even on the right, joined by
 * a connector path — instead of a plain vertical list. Each node is locked
 * (never unlocked yet), unlocked-not-completed (tappable, starts that
 * mission), or completed (tappable to replay, shown in green) — see
 * MissionProgress.js for the persisted unlock/completion rules, which a
 * mission earns by clearing its wave in GameplayScene (`mode: 'mission'`).
 *
 * 50 nodes don't fit on one screen, so the map is vertically drag-scrollable
 * (handlePointerDown/Move/Up, the same optional-handler convention
 * GameplayScene's ship-drag uses — Game.js forwards DragInput to whichever
 * scene implements it) — see Config.missionSelect's doc for the scroll-clamp
 * shape. `handleTap` keeps working unmodified alongside it: TapInput only
 * fires for a near-stationary pointer, DragInput only produces meaningful
 * movement for an actual drag, so the two gestures never fight over the same
 * touch (see DragInput.js's own doc comment).
 *
 * Every 5th node is a boss level (Config.bossSchedule.mission) — those draw
 * larger, in the game's shared "danger red", ringed with a diamond hazard
 * emblem (core/shapes.js) instead of a plain circle, and labeled with the
 * boss's name instead of "MISSION N" — see _renderNode.
 *
 * Same starfield backdrop every other scene uses — this is a menu, not
 * gameplay, but it shouldn't read as a different app.
 */
import { Config } from '../core/Config.js';
import { isMissionUnlocked, isMissionCompleted } from '../core/MissionProgress.js';
import { playButtonClick } from '../core/UiSound.js';
import { dangerColor } from '../core/Settings.js';
import { diamondPath } from '../core/shapes.js';
import { Starfield } from '../entities/Starfield.js';

export class MissionSelectScene {
  /** @param {{ onSelectMission: (level: number) => void, onBack: () => void }} options */
  constructor(renderer, { onSelectMission, onBack }) {
    this.renderer = renderer;
    this._onSelectMission = onSelectMission;
    this._onBack = onBack;
    this._age = 0;
    this._starfield = new Starfield();

    this._dragging = false;
    this._dragStartY = 0;
    this._dragStartScrollY = 0;
    // Open already scrolled to whichever mission the player would tap next,
    // rather than stranding a returning player at level 1's node every time.
    this._scrollY = this._clampScrollY(this._nodeCenter(this._frontierLevel()).y - Config.virtual.height / 2);
  }

  update(dt) {
    this._age += dt;
    this._starfield.update(dt);
  }

  handleTap(x, y) {
    if (this._isInsideBack(x, y)) { playButtonClick(); this._onBack?.(); return; }
    for (let level = 1; level <= Config.mission.count; level++) {
      if (this._isInsideNode(x, y, level) && isMissionUnlocked(level)) {
        playButtonClick();
        this._onSelectMission?.(level);
        return;
      }
    }
  }

  handlePointerDown(x, y) {
    this._dragging = true;
    this._dragStartY = y;
    this._dragStartScrollY = this._scrollY;
  }

  handlePointerMove(x, y) {
    if (!this._dragging) return;
    this._scrollY = this._clampScrollY(this._dragStartScrollY - (y - this._dragStartY));
  }

  handlePointerUp() {
    this._dragging = false;
  }

  render() {
    const cfg = Config.missionSelect;
    const { width: vW } = Config.virtual;
    const alpha = Math.min(this._age / cfg.fadeInDuration, 1);

    this.renderer.clear(Config.colors.void);
    this._starfield.render(this.renderer);

    this._renderPath(alpha);
    for (let level = 1; level <= Config.mission.count; level++) this._renderNode(level, alpha);

    // Title/back button last, on top of the scrollable map, since they're fixed chrome.
    this.renderer.drawText('SELECT MISSION', vW / 2, cfg.titleY, {
      font: cfg.titleFont, color: cfg.titleColor, alpha,
    });
    this._renderBack(alpha);
  }

  /** The highest mission the player could tap right now — used to open the map pre-scrolled to it. */
  _frontierLevel() {
    let level = 1;
    while (level < Config.mission.count && isMissionUnlocked(level + 1)) level++;
    return level;
  }

  /** Content-space zigzag layout: y advances per level, x alternates left/right. Unaffected by scroll. */
  _nodeCenter(level) {
    const cfg = Config.missionSelect;
    const { width: vW } = Config.virtual;
    const side = level % 2 === 1 ? -1 : 1; // odd levels left, even levels right
    return {
      x: vW / 2 + side * cfg.nodeXOffset,
      y: cfg.nodeStartY + (level - 1) * cfg.nodeSpacingY,
    };
  }

  /** Screen-space node center — content position minus the live scroll offset. */
  _screenNodeCenter(level) {
    const { x, y } = this._nodeCenter(level);
    return { x, y: y - this._scrollY };
  }

  _maxScrollY() {
    const cfg = Config.missionSelect;
    const { height: vH } = Config.virtual;
    const lastY = this._nodeCenter(Config.mission.count).y;
    return Math.max(0, lastY - (vH - cfg.scrollBottomPadding));
  }

  _clampScrollY(value) {
    return Math.min(Math.max(value, 0), this._maxScrollY());
  }

  /** Boss info for `level`, or null if it's a regular mission — see Config.bossSchedule.mission. */
  _bossInfoFor(level) {
    const schedule = Config.bossSchedule.mission;
    if (level % schedule.everyNLevels !== 0) return null;
    const encounterNum = level / schedule.everyNLevels;
    const key = schedule.roster[(encounterNum - 1) % schedule.roster.length];
    return { key, cfg: Config.boss[key] };
  }

  _isInsideNode(x, y, level) {
    const cfg = Config.missionSelect;
    const { x: nx, y: ny } = this._screenNodeCenter(level);
    const radius = cfg.nodeHitRadius + (this._bossInfoFor(level) ? cfg.bossRadiusBonus : 0);
    const dx = x - nx, dy = y - ny;
    return dx * dx + dy * dy <= radius * radius;
  }

  _isInsideBack(x, y) {
    const cfg = Config.missionSelect;
    return x >= cfg.backX && x <= cfg.backX + cfg.backHitWidth
        && y >= cfg.backY - cfg.backHitHeight / 2 && y <= cfg.backY + cfg.backHitHeight / 2;
  }

  _renderBack(alpha) {
    const cfg = Config.missionSelect;
    this.renderer.drawText(cfg.backLabel, cfg.backX, cfg.backY, {
      font: cfg.backFont, color: cfg.backColor, align: 'left', alpha: alpha * 0.85,
    });
  }

  /** Connector line between consecutive nodes — drawn first so each node's fill covers its endpoints. */
  _renderPath(alpha) {
    const cfg = Config.missionSelect;
    for (let level = 1; level < Config.mission.count; level++) {
      const from = this._screenNodeCenter(level);
      const to = this._screenNodeCenter(level + 1);
      const traveled = isMissionCompleted(level);
      this.renderer.strokePaths([
        { points: [[from.x, from.y], [to.x, to.y]], closed: false },
      ], {
        color: traveled ? cfg.unlockedColor : cfg.lockedColor,
        lineWidth: cfg.pathLineWidth,
        glowBlur: traveled ? cfg.pathGlowBlur : 0,
        lineDash: traveled ? undefined : cfg.pathLockedDash,
        alpha,
      });
    }
  }

  _renderNode(level, alpha) {
    const cfg = Config.missionSelect;
    const { x: nx, y: ny } = this._screenNodeCenter(level);
    const boss = this._bossInfoFor(level);

    const unlocked = isMissionUnlocked(level);
    const completed = isMissionCompleted(level);
    const color = !unlocked ? cfg.lockedColor : completed ? cfg.completedColor : cfg.unlockedColor;
    const radius = cfg.nodeRadius + (boss ? cfg.bossRadiusBonus : 0);

    // Skip nodes scrolled up behind the fixed title/back chrome entirely,
    // rather than drawing them half-obscured underneath it (there's no
    // canvas clipping in this scene — see Config.missionSelect's doc).
    if (ny + radius < cfg.mapClipTopY) return;

    this.renderer.fillEllipse(0, 0, radius, radius, {
      x: nx, y: ny, fillColor: Config.colors.void, alpha,
    });
    this.renderer.strokeCircle(nx, ny, radius, {
      color, lineWidth: cfg.nodeLineWidth, glowBlur: cfg.nodeGlowBlur, alpha,
    });

    if (boss) {
      const bossColor = dangerColor(cfg.bossColor);
      this.renderer.strokePaths([diamondPath(0, 0, radius * cfg.bossRingScale)], {
        x: nx, y: ny,
        color: unlocked ? bossColor : color,
        lineWidth: cfg.bossRingLineWidth,
        glowBlur: unlocked ? cfg.bossRingGlowBlur : 0,
        alpha,
      });
    }

    this.renderer.drawText(`${level}`, nx, ny, {
      font: cfg.nodeNumberFont, color, alpha,
    });

    const labelY = ny + radius + cfg.labelGap;
    const label = boss ? `BOSS: ${boss.cfg.name}` : `MISSION ${level}`;
    this.renderer.drawText(label, nx, labelY, {
      font: boss ? cfg.bossLabelFont : cfg.nameFont,
      color: boss && unlocked ? dangerColor(cfg.bossColor) : color,
      alpha,
    });
    const status = !unlocked ? 'LOCKED' : completed ? 'COMPLETED — TAP TO REPLAY' : 'TAP TO START';
    this.renderer.drawText(status, nx, labelY + cfg.statusGap, {
      font: cfg.statusFont, color, alpha: alpha * 0.8,
    });
  }
}
