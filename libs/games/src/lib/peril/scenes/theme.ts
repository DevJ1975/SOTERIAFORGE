/**
 * Shared PERIL! look-and-feel helpers for Phaser scenes.
 * Original styling in the spirit of a TV quiz board — no copyrighted assets.
 */

import Phaser from 'phaser';
import { PerilAudio } from '../audio';
import { ContestantState, formatMoney } from '../game-rules';
import { OpponentAvatar, Unsubscribe } from '../opponent-provider';
import { PerilEngine } from '../game-rules';
import { OpponentProvider, OpponentProfile } from '../opponent-provider';
import type { FirestoreMatchProvider } from '../firestore-match-provider';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const COLORS = {
  boardBlue: 0x060ce9,
  boardBlueDark: 0x0508a6,
  stageBlue: 0x02034d,
  nearBlack: 0x040414,
  gold: 0xd69f4c,
  goldBright: 0xffcc66,
  white: 0xffffff,
  correctGreen: 0x2ecc71,
  wrongRed: 0xe74c3c,
  lockoutRed: 0xff3b30,
} as const;

export const VALUE_FONT =
  "'Haettenschweiler', 'Arial Narrow Bold', sans-serif-condensed, sans-serif";
export const CLUE_FONT = "Georgia, 'Times New Roman', serif";
export const UI_FONT = "'Arial Narrow', Arial, sans-serif";

export const SCENE_KEYS = {
  lobby: 'PerilLobby',
  board: 'PerilBoard',
  clue: 'PerilClue',
  final: 'PerilFinal',
  results: 'PerilResults',
} as const;

export const REGISTRY_KEYS = {
  session: 'peril:session',
  audio: 'peril:audio',
  services: 'peril:services',
} as const;

/** Cross-scene match state stashed in the game registry. */
export interface PerilSession {
  engine: PerilEngine;
  provider: OpponentProvider;
  humanId: string;
  opponents: OpponentProfile[];
  avatars: Map<string, OpponentAvatar>;
  /** Match seed for deterministic clue/option selection (realtime matches). */
  seed?: number;
  /** Set once the finished game has been reported to GAME_RESULT_SINK. */
  resultReported?: boolean;
}

/**
 * App-level services handed to the Phaser side by PerilComponent. Both are
 * optional: absent in Studio previews, signed-out sessions, and tests.
 */
export interface PerilServices {
  /** Builds a realtime provider; null when Firestore/auth are unavailable. */
  createMatchProvider?: () => FirestoreMatchProvider | null;
  /** Reports the finished game through GAME_RESULT_SINK. */
  reportResult?: (result: { score: number; won: boolean }) => Promise<void>;
}

export function getSession(scene: Phaser.Scene): PerilSession {
  return scene.registry.get(REGISTRY_KEYS.session) as PerilSession;
}

export function getServices(scene: Phaser.Scene): PerilServices | null {
  return (scene.registry.get(REGISTRY_KEYS.services) as PerilServices | undefined) ?? null;
}

export function getAudio(scene: Phaser.Scene): PerilAudio {
  let audio = scene.registry.get(REGISTRY_KEYS.audio) as PerilAudio | undefined;
  if (!audio) {
    audio = new PerilAudio();
    scene.registry.set(REGISTRY_KEYS.audio, audio);
  }
  return audio;
}

export function hexString(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

// ---- Text helpers -------------------------------------------------------------

export function makeValueText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: VALUE_FONT,
      fontSize: `${size}px`,
      color: hexString(COLORS.gold),
      stroke: '#000000',
      strokeThickness: Math.max(2, size / 14),
    })
    .setOrigin(0.5);
}

export function makeClueText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  wrapWidth: number,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text.toUpperCase(), {
      fontFamily: CLUE_FONT,
      fontSize: `${size}px`,
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: wrapWidth },
      stroke: '#000000',
      strokeThickness: 3,
      lineSpacing: 6,
    })
    .setOrigin(0.5);
}

export interface TextButton {
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  setEnabled(enabled: boolean): void;
}

export function makeTextButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  onClick: () => void,
  opts: { fontSize?: number; fill?: number; textColor?: string } = {},
): TextButton {
  const fill = opts.fill ?? COLORS.boardBlue;
  const background = scene.add
    .rectangle(0, 0, width, height, fill)
    .setStrokeStyle(2, COLORS.gold, 0.9);
  const label = scene.add
    .text(0, 0, text, {
      fontFamily: VALUE_FONT,
      fontSize: `${opts.fontSize ?? 26}px`,
      color: opts.textColor ?? '#ffffff',
      align: 'center',
      wordWrap: { width: width - 24 },
    })
    .setOrigin(0.5);
  const container = scene.add.container(x, y, [background, label]);
  container.setSize(width, height);
  let enabled = true;
  background.setInteractive({ useHandCursor: true });
  background.on('pointerover', () => {
    if (enabled) background.setFillStyle(COLORS.boardBlueDark);
  });
  background.on('pointerout', () => background.setFillStyle(fill));
  background.on('pointerdown', () => {
    if (!enabled) return;
    scene.tweens.add({ targets: container, scale: 0.95, duration: 60, yoyo: true });
    onClick();
  });
  return {
    container,
    background,
    label,
    setEnabled(on: boolean) {
      enabled = on;
      container.setAlpha(on ? 1 : 0.45);
      if (on) background.setInteractive({ useHandCursor: true });
      else background.disableInteractive();
    },
  };
}

// ---- Podiums --------------------------------------------------------------------

export interface PodiumDisplay {
  container: Phaser.GameObjects.Container;
  scoreText: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
  frame: Phaser.GameObjects.Rectangle;
  /** Animated odometer-style score roll. */
  rollScoreTo(scene: Phaser.Scene, value: number): void;
  setHighlight(on: boolean, color?: number): void;
}

/** Draws a procedural avatar bust (no image assets). */
export function drawAvatar(
  scene: Phaser.Scene,
  avatar: OpponentAvatar | null,
  size: number,
): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const half = size / 2;
  if (avatar) {
    // Shoulders.
    g.fillStyle(avatar.shirtColor, 1);
    g.fillRoundedRect(-half, half * 0.35, size, half * 0.75, 6);
    // Head.
    g.fillStyle(avatar.faceColor, 1);
    g.fillCircle(0, -half * 0.15, half * 0.55);
    // Hair styles 0-3: bald shine / side part / flat top / curls.
    g.fillStyle(avatar.hairColor, 1);
    switch (avatar.hairStyle % 4) {
      case 1:
        g.fillEllipse(0, -half * 0.5, half * 1.05, half * 0.42);
        break;
      case 2:
        g.fillRect(-half * 0.5, -half * 0.78, half, half * 0.3);
        break;
      case 3:
        g.fillCircle(-half * 0.35, -half * 0.55, half * 0.22);
        g.fillCircle(0, -half * 0.66, half * 0.22);
        g.fillCircle(half * 0.35, -half * 0.55, half * 0.22);
        break;
      default:
        g.fillStyle(0xffffff, 0.25);
        g.fillEllipse(-half * 0.15, -half * 0.42, half * 0.3, half * 0.14);
        break;
    }
    // Eyes.
    g.fillStyle(0x1c1c1c, 1);
    g.fillCircle(-half * 0.2, -half * 0.18, half * 0.06);
    g.fillCircle(half * 0.2, -half * 0.18, half * 0.06);
    if (avatar.glasses) {
      g.lineStyle(2, 0x222222, 1);
      g.strokeCircle(-half * 0.2, -half * 0.18, half * 0.14);
      g.strokeCircle(half * 0.2, -half * 0.18, half * 0.14);
      g.lineBetween(-half * 0.06, -half * 0.18, half * 0.06, -half * 0.18);
    }
    // Smile.
    g.lineStyle(2, 0x7a4a2a, 1);
    g.beginPath();
    g.arc(0, -half * 0.02, half * 0.16, 0.2, Math.PI - 0.2, false);
    g.strokePath();
  } else {
    // Human player: hard-hat hero silhouette.
    g.fillStyle(0x355070, 1);
    g.fillRoundedRect(-half, half * 0.35, size, half * 0.75, 6);
    g.fillStyle(0xf2c9a0, 1);
    g.fillCircle(0, -half * 0.15, half * 0.55);
    g.fillStyle(COLORS.goldBright, 1);
    g.fillEllipse(0, -half * 0.52, half * 1.1, half * 0.5);
    g.fillRect(-half * 0.62, -half * 0.5, half * 1.24, half * 0.12);
    g.fillStyle(0x1c1c1c, 1);
    g.fillCircle(-half * 0.2, -half * 0.14, half * 0.06);
    g.fillCircle(half * 0.2, -half * 0.14, half * 0.06);
    g.lineStyle(2, 0x7a4a2a, 1);
    g.beginPath();
    g.arc(0, half * 0.04, half * 0.16, 0.2, Math.PI - 0.2, false);
    g.strokePath();
  }
  c.add(g);
  return c;
}

export function makePodium(
  scene: Phaser.Scene,
  x: number,
  y: number,
  contestant: ContestantState,
  avatar: OpponentAvatar | null,
  width = 280,
  height = 150,
): PodiumDisplay {
  const container = scene.add.container(x, y);
  const frame = scene.add
    .rectangle(0, 0, width, height, COLORS.boardBlueDark)
    .setStrokeStyle(3, COLORS.gold, 1);
  const trim = scene.add.rectangle(0, -height / 2 + 5, width - 12, 4, COLORS.gold);
  const bust = drawAvatar(scene, avatar, 56);
  bust.setPosition(0, -height / 2 - 26);
  const scoreText = scene.add
    .text(0, -14, formatMoney(contestant.score), {
      fontFamily: VALUE_FONT,
      fontSize: '40px',
      color: hexString(COLORS.goldBright),
      stroke: '#000000',
      strokeThickness: 3,
    })
    .setOrigin(0.5);
  const namePlate = scene.add.rectangle(0, height / 2 - 28, width - 28, 40, COLORS.stageBlue);
  namePlate.setStrokeStyle(2, COLORS.gold, 0.6);
  const nameText = scene.add
    .text(0, height / 2 - 28, contestant.name.toUpperCase(), {
      fontFamily: "'Comic Sans MS', 'Brush Script MT', cursive",
      fontSize: '22px',
      color: '#ffffff',
    })
    .setOrigin(0.5);
  container.add([frame, trim, bust, scoreText, namePlate, nameText]);

  let displayed = contestant.score;
  return {
    container,
    scoreText,
    nameText,
    frame,
    rollScoreTo(s: Phaser.Scene, value: number) {
      const from = displayed;
      displayed = value;
      const proxy = { v: from };
      s.tweens.add({
        targets: proxy,
        v: value,
        duration: 650,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          scoreText.setText(formatMoney(Math.round(proxy.v)));
          scoreText.setColor(Math.round(proxy.v) < 0 ? '#ff6b6b' : hexString(COLORS.goldBright));
        },
        onComplete: () => {
          scoreText.setText(formatMoney(value));
          scoreText.setColor(value < 0 ? '#ff6b6b' : hexString(COLORS.goldBright));
        },
      });
      s.tweens.add({ targets: scoreText, scale: 1.25, duration: 140, yoyo: true });
    },
    setHighlight(on: boolean, color: number = COLORS.white) {
      frame.setStrokeStyle(on ? 5 : 3, on ? color : COLORS.gold, 1);
    },
  };
}

/** Ensures a 1x1 white particle texture exists for confetti/sparks. */
export function ensureSparkTexture(scene: Phaser.Scene): string {
  const key = 'peril-spark';
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 8, 8);
    g.generateTexture(key, 8, 8);
    g.destroy();
  }
  return key;
}

// ---- Realtime match endings ------------------------------------------------------

/**
 * Watches a realtime session for the host abandoning the match. The active
 * scene draws a "Host left — match ended" overlay and offers an AI rematch
 * (back to the lobby, where the scan will seat the house bots). Returns an
 * unsubscribe for the scene's shutdown hook.
 */
export function watchHostDeparture(scene: Phaser.Scene, session: PerilSession): Unsubscribe {
  const unsubscribe = session.provider.onMatchEnded?.((reason) => {
    if (reason !== 'host-left') return;
    // Only the scene actually running draws the overlay (board may be paused
    // underneath the clue scene).
    if (!scene.scene.isActive(scene.scene.key)) return;

    scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78)
      .setDepth(900)
      .setInteractive(); // swallow clicks beneath the overlay
    scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 70, 'HOST LEFT — MATCH ENDED', {
        fontFamily: VALUE_FONT,
        fontSize: '54px',
        color: '#ffffff',
        stroke: hexString(COLORS.wrongRed),
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(901);
    scene.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 - 14,
        'Your scores are safe with us. Care for a rematch?',
        {
          fontFamily: UI_FONT,
          fontSize: '22px',
          color: '#aab4ff',
        },
      )
      .setOrigin(0.5)
      .setDepth(901);
    makeTextButton(
      scene,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 70,
      380,
      66,
      'REMATCH VS THE HOUSE',
      () => {
        getAudio(scene).click();
        session.provider.leave();
        scene.registry.remove(REGISTRY_KEYS.session);
        const manager = scene.scene;
        for (const key of [
          SCENE_KEYS.clue,
          SCENE_KEYS.final,
          SCENE_KEYS.results,
          SCENE_KEYS.board,
        ]) {
          if (key !== scene.scene.key && (manager.isActive(key) || manager.isPaused(key))) {
            manager.stop(key);
          }
        }
        manager.start(SCENE_KEYS.lobby);
      },
      { fontSize: 28 },
    ).container.setDepth(902);
  });
  return unsubscribe ?? (() => undefined);
}

/** Full-stage backdrop with subtle vignette. */
export function drawStageBackdrop(scene: Phaser.Scene): void {
  scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.stageBlue);
  const g = scene.add.graphics();
  g.fillGradientStyle(COLORS.nearBlack, COLORS.nearBlack, COLORS.stageBlue, COLORS.stageBlue, 0.85);
  g.fillRect(0, 0, GAME_WIDTH, 120);
  g.fillGradientStyle(COLORS.stageBlue, COLORS.stageBlue, COLORS.nearBlack, COLORS.nearBlack, 0.85);
  g.fillRect(0, GAME_HEIGHT - 120, GAME_WIDTH, 120);
}
