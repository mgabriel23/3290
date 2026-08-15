/**
 * MissionSelectScene.js
 * Mission Mode's level-select screen — reached after choosing MISSION MODE
 * on the title card (see PrologueScene) and finishing the tutorial (Game.js
 * routes here the same way it would normally go straight to gameplay).
 * Shows one node per mission (Config.mission.count, currently 3), laid out
 * as a zigzag journey map — odd levels on the left, even on the right,
 * joined by a connector path — instead of a plain vertical list. Each node
 * is locked (never unlocked yet), unlocked-not-completed (tappable, starts
 * that mission), or completed (tappable to replay, shown in green) — see
 * MissionProgress.js for the persisted unlock/completion rules, which a
 * mission earns by clearing its wave in GameplayScene (`mode: 'mission'`).
 *
 * Same starfield backdrop every other scene uses — this is a menu, not
 * gameplay, but it shouldn't read as a different app.
 */
import { Config } from '../core/Config.js';
import { isMissionUnlocked, isMissionCompleted } from '../core/MissionProgress.js';
import { Starfield } from '../entities/Starfield.js';

export class MissionSelectScene {
  /** @param {{ onSelectMission: (level: number) => void, onBack: () => void }} options */
  constructor(renderer, { onSelectMission, onBack }) {
    this.renderer = renderer;
    this._onSelectMission = onSelectMission;
    this._onBack = onBack;
    this._age = 0;
    this._starfield = new Starfield();
  }

  update(dt) {
    this._age += dt;
    this._starfield.update(dt);
  }

  handleTap(x, y) {
    if (this._isInsideBack(x, y)) { this._onBack?.(); return; }
    for (let level = 1; level <= Config.mission.count; level++) {
      if (this._isInsideNode(x, y, level) && isMissionUnlocked(level)) {
        this._onSelectMission?.(level);
        return;
      }
    }
  }

  render() {
    const cfg = Config.missionSelect;
    const { width: vW } = Config.virtual;
    const alpha = Math.min(this._age / cfg.fadeInDuration, 1);

    this.renderer.clear(Config.colors.void);
    this._starfield.render(this.renderer);

    this.renderer.drawText('SELECT MISSION', vW / 2, cfg.titleY, {
      font: cfg.titleFont, color: cfg.titleColor, alpha,
    });
    this._renderBack(alpha);
    this._renderPath(alpha);
    for (let level = 1; level <= Config.mission.count; level++) this._renderNode(level, alpha);
  }

  /** Zigzag journey-map layout: y advances per level, x alternates left/right. */
  _nodeCenter(level) {
    const cfg = Config.missionSelect;
    const { width: vW } = Config.virtual;
    const side = level % 2 === 1 ? -1 : 1; // odd levels left, even levels right
    return {
      x: vW / 2 + side * cfg.nodeXOffset,
      y: cfg.nodeStartY + (level - 1) * cfg.nodeSpacingY,
    };
  }

  _isInsideNode(x, y, level) {
    const cfg = Config.missionSelect;
    const { x: nx, y: ny } = this._nodeCenter(level);
    const dx = x - nx, dy = y - ny;
    return dx * dx + dy * dy <= cfg.nodeHitRadius * cfg.nodeHitRadius;
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
      const from = this._nodeCenter(level);
      const to = this._nodeCenter(level + 1);
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
    const { x: nx, y: ny } = this._nodeCenter(level);

    const unlocked = isMissionUnlocked(level);
    const completed = isMissionCompleted(level);
    const color = !unlocked ? cfg.lockedColor : completed ? cfg.completedColor : cfg.unlockedColor;

    this.renderer.fillEllipse(0, 0, cfg.nodeRadius, cfg.nodeRadius, {
      x: nx, y: ny, fillColor: Config.colors.void, alpha,
    });
    this.renderer.strokeCircle(nx, ny, cfg.nodeRadius, {
      color, lineWidth: cfg.nodeLineWidth, glowBlur: cfg.nodeGlowBlur, alpha,
    });
    this.renderer.drawText(`${level}`, nx, ny, {
      font: cfg.nodeNumberFont, color, alpha,
    });

    const labelY = ny + cfg.nodeRadius + cfg.labelGap;
    this.renderer.drawText(`MISSION ${level}`, nx, labelY, {
      font: cfg.nameFont, color, alpha,
    });
    const status = !unlocked ? 'LOCKED' : completed ? 'COMPLETED — TAP TO REPLAY' : 'TAP TO START';
    this.renderer.drawText(status, nx, labelY + cfg.statusGap, {
      font: cfg.statusFont, color, alpha: alpha * 0.8,
    });
  }
}
