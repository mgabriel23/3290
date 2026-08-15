/**
 * MissionSelectScene.js
 * Mission Mode's level-select screen — reached after choosing MISSION MODE
 * on the title card (see PrologueScene) and finishing the tutorial (Game.js
 * routes here the same way it would normally go straight to gameplay).
 * Shows one tile per mission (Config.mission.count, currently 3): locked
 * (never unlocked yet), unlocked-not-completed (tappable, starts that
 * mission), or completed (tappable to replay, shown in green) — see
 * MissionProgress.js for the persisted unlock/completion rules, which a
 * mission earns by clearing its wave in GameplayScene (`mode: 'mission'`).
 *
 * Same starfield backdrop every other scene uses, and the same
 * corner-bracket card chrome Shop's item cards use — this is a menu, not
 * gameplay, but it shouldn't read as a different app.
 */
import { Config } from '../core/Config.js';
import { cornerBracketPath } from '../core/shapes.js';
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
      if (this._isInsideTile(x, y, level) && isMissionUnlocked(level)) {
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
    for (let level = 1; level <= Config.mission.count; level++) this._renderTile(level, alpha);
  }

  _tileCenterY(level) {
    return Config.missionSelect.tileStartY + (level - 1) * Config.missionSelect.tileSpacing;
  }

  _isInsideTile(x, y, level) {
    const { tileWidth, tileHeight } = Config.missionSelect;
    const { width: vW } = Config.virtual;
    return Math.abs(x - vW / 2) <= tileWidth / 2 && Math.abs(y - this._tileCenterY(level)) <= tileHeight / 2;
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

  _renderTile(level, alpha) {
    const cfg = Config.missionSelect;
    const { width: vW } = Config.virtual;
    const cy = this._tileCenterY(level);
    const left = vW / 2 - cfg.tileWidth / 2, right = vW / 2 + cfg.tileWidth / 2;
    const top  = cy - cfg.tileHeight / 2,    bottom = cy + cfg.tileHeight / 2;

    const unlocked = isMissionUnlocked(level);
    const completed = isMissionCompleted(level);
    const color = !unlocked ? cfg.lockedColor : completed ? cfg.completedColor : cfg.unlockedColor;

    this.renderer.strokePaths([
      cornerBracketPath(left,  top,    1,  1, cfg.tileLegSize),
      cornerBracketPath(right, top,   -1,  1, cfg.tileLegSize),
      cornerBracketPath(left,  bottom, 1, -1, cfg.tileLegSize),
      cornerBracketPath(right, bottom,-1, -1, cfg.tileLegSize),
    ], { color, lineWidth: cfg.tileLineWidth, glowBlur: cfg.tileGlowBlur, alpha });

    this.renderer.drawText(`MISSION ${level}`, vW / 2, cy - 16, {
      font: cfg.nameFont, color, alpha,
    });
    const status = !unlocked ? 'LOCKED' : completed ? 'COMPLETED — TAP TO REPLAY' : 'TAP TO START';
    this.renderer.drawText(status, vW / 2, cy + 18, {
      font: cfg.statusFont, color, alpha: alpha * 0.8,
    });
  }
}
