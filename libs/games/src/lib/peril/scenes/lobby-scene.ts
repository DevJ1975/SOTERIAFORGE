/**
 * PERIL! lobby — title card, 4-second animated opponent scan ("Scanning the
 * floor for available players…"), then seats the AI contestants.
 */

import Phaser from 'phaser';
import { AiOpponentProvider } from '../ai-opponents';
import { PerilEngine } from '../game-rules';
import { OpponentProfile } from '../opponent-provider';
import {
  COLORS,
  drawAvatar,
  drawStageBackdrop,
  ensureSparkTexture,
  GAME_HEIGHT,
  GAME_WIDTH,
  getAudio,
  hexString,
  makeTextButton,
  PerilSession,
  REGISTRY_KEYS,
  SCENE_KEYS,
  UI_FONT,
  VALUE_FONT,
} from './theme';

const SCAN_MS = 4000;
export const HUMAN_ID = 'human-player';

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.lobby);
  }

  create(): void {
    drawStageBackdrop(this);
    ensureSparkTexture(this);
    const audio = getAudio(this);

    // Big title with staggered letter drop.
    const title = 'PERIL!';
    const letterWidth = 86;
    const startX = GAME_WIDTH / 2 - ((title.length - 1) * letterWidth) / 2;
    title.split('').forEach((ch, i) => {
      const letter = this.add
        .text(startX + i * letterWidth, -80, ch, {
          fontFamily: VALUE_FONT,
          fontSize: '120px',
          color: '#ffffff',
          stroke: hexString(COLORS.gold),
          strokeThickness: 6,
        })
        .setOrigin(0.5);
      this.tweens.add({
        targets: letter,
        y: 150,
        delay: 90 * i,
        duration: 520,
        ease: 'Bounce.easeOut',
        onStart: () => audio.blip(i),
      });
    });

    this.add
      .text(GAME_WIDTH / 2, 238, 'THE WORKPLACE SAFETY GAME SHOW', {
        fontFamily: UI_FONT,
        fontSize: '24px',
        color: hexString(COLORS.goldBright),
        letterSpacing: 6,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setData('subtitle', true);
    this.tweens.add({
      targets: this.children.list.filter((c) => c.getData?.('subtitle')),
      alpha: 1,
      delay: 700,
      duration: 600,
    });

    const playButton = makeTextButton(
      this,
      GAME_WIDTH / 2,
      420,
      320,
      84,
      'PLAY!',
      () => {
        audio.unlock();
        audio.click();
        playButton.setEnabled(false);
        playButton.container.setVisible(false);
        hint.setVisible(false);
        this.beginScan();
      },
      { fontSize: 44 },
    );
    this.tweens.add({
      targets: playButton.container,
      scale: { from: 1, to: 1.05 },
      yoyo: true,
      repeat: -1,
      duration: 700,
      ease: 'Sine.easeInOut',
    });

    const hint = this.add
      .text(
        GAME_WIDTH / 2,
        510,
        'Buzz with SPACE once the clue is read — buzz early and you lock out for 250ms!',
        { fontFamily: UI_FONT, fontSize: '18px', color: '#aab4ff' },
      )
      .setOrigin(0.5);
  }

  private beginScan(): void {
    const audio = getAudio(this);
    const provider = new AiOpponentProvider();

    const scanText = this.add
      .text(GAME_WIDTH / 2, 380, 'Scanning the floor for available players', {
        fontFamily: UI_FONT,
        fontSize: '26px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // Animated ellipsis.
    let dots = 0;
    const dotTimer = this.time.addEvent({
      delay: 350,
      loop: true,
      callback: () => {
        dots = (dots + 1) % 4;
        scanText.setText('Scanning the floor for available players' + '.'.repeat(dots));
        if (dots === 0) audio.blip(2);
      },
    });

    // Radar sweep.
    const radar = this.add.container(GAME_WIDTH / 2, 500);
    const ring = this.add.circle(0, 0, 60).setStrokeStyle(2, COLORS.gold, 0.8);
    const ring2 = this.add.circle(0, 0, 38).setStrokeStyle(1, COLORS.gold, 0.4);
    const sweep = this.add.graphics();
    sweep.fillStyle(COLORS.goldBright, 0.35);
    sweep.slice(0, 0, 60, -0.5, 0.35, false);
    sweep.fillPath();
    radar.add([ring, ring2, sweep]);
    this.tweens.add({ targets: sweep, rotation: Math.PI * 8, duration: SCAN_MS, ease: 'Linear' });

    void provider.joinLobby(SCAN_MS).then((opponents) => {
      if (!this.scene.isActive(SCENE_KEYS.lobby)) return;
      dotTimer.remove();
      scanText.setText('No human challengers found — seating our house contestants!');
      radar.destroy();
      audio.applause(1.2);
      this.seatContestants(provider, opponents);
    });
  }

  private seatContestants(provider: AiOpponentProvider, opponents: OpponentProfile[]): void {
    const audio = getAudio(this);
    const seats = [
      { id: opponents[0].id, name: opponents[0].name, isHuman: false },
      { id: HUMAN_ID, name: 'You', isHuman: true },
      { id: opponents[1].id, name: opponents[1].name, isHuman: false },
    ];
    const engine = new PerilEngine(seats);
    engine.controlId = HUMAN_ID; // the champ (you) selects first

    const avatars = new Map(opponents.map((o) => [o.id, o.avatar]));
    const session: PerilSession = {
      engine,
      provider,
      humanId: HUMAN_ID,
      opponents,
      avatars,
    };
    this.registry.set(REGISTRY_KEYS.session, session);

    // Introduce the seated contestants.
    const xs = [GAME_WIDTH / 2 - 360, GAME_WIDTH / 2, GAME_WIDTH / 2 + 360];
    seats.forEach((seat, i) => {
      const card = this.add.container(xs[i], GAME_HEIGHT + 120);
      const panel = this.add
        .rectangle(0, 0, 300, 140, COLORS.boardBlueDark)
        .setStrokeStyle(3, COLORS.gold);
      const bust = drawAvatar(this, avatars.get(seat.id) ?? null, 64);
      bust.setPosition(0, -16);
      const name = this.add
        .text(0, 46, seat.name.toUpperCase(), {
          fontFamily: VALUE_FONT,
          fontSize: '26px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      card.add([panel, bust, name]);
      this.tweens.add({
        targets: card,
        y: 600,
        delay: 250 * i,
        duration: 500,
        ease: 'Back.easeOut',
        onStart: () => audio.blip(i * 2),
      });
    });

    this.time.delayedCall(1400, () => {
      const start = makeTextButton(
        this,
        GAME_WIDTH / 2,
        430,
        380,
        76,
        'START THE GAME',
        () => {
          audio.click();
          this.scene.start(SCENE_KEYS.board, { round: 'round1' });
        },
        { fontSize: 34 },
      );
      start.container.setAlpha(0);
      this.tweens.add({ targets: start.container, alpha: 1, duration: 400 });
    });
  }
}
