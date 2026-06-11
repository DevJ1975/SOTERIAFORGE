/**
 * PERIL! results — winner announcement with confetti rain, spotlight sweep,
 * applause + fanfare, final standings, and play-again.
 */

import Phaser from 'phaser';
import {
  COLORS,
  ensureSparkTexture,
  GAME_HEIGHT,
  GAME_WIDTH,
  getAudio,
  getSession,
  hexString,
  makePodium,
  makeTextButton,
  REGISTRY_KEYS,
  SCENE_KEYS,
  UI_FONT,
  VALUE_FONT,
} from './theme';
import { formatMoney } from '../game-rules';

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.results);
  }

  create(): void {
    const session = getSession(this);
    const audio = getAudio(this);
    const sparkKey = ensureSparkTexture(this);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.stageBlue);

    const standings = [...session.engine.contestants].sort((a, b) => b.score - a.score);
    const winner = standings[0];
    const humanWon = winner.isHuman;

    // Spotlight sweep.
    const spotlight = this.add.graphics().setDepth(2);
    spotlight.fillStyle(0xfff7d6, 0.18);
    spotlight.slice(0, 0, 1500, -Math.PI / 2 - 0.22, -Math.PI / 2 + 0.22, false);
    spotlight.fillPath();
    spotlight.setPosition(GAME_WIDTH / 2, GAME_HEIGHT + 60);
    this.tweens.add({
      targets: spotlight,
      rotation: { from: -0.7, to: 0.7 },
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Headline.
    const headline = this.add
      .text(
        GAME_WIDTH / 2,
        120,
        humanWon ? 'YOU ARE THE PERIL! CHAMPION!' : `${winner.name.toUpperCase()} WINS!`,
        {
          fontFamily: VALUE_FONT,
          fontSize: '64px',
          color: '#ffffff',
          stroke: hexString(COLORS.gold),
          strokeThickness: 6,
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setScale(0.2)
      .setDepth(10);
    this.tweens.add({ targets: headline, scale: 1, duration: 700, ease: 'Back.easeOut' });

    this.add
      .text(GAME_WIDTH / 2, 188, `Final total: ${formatMoney(winner.score)}`, {
        fontFamily: UI_FONT,
        fontSize: '28px',
        color: hexString(COLORS.goldBright),
      })
      .setOrigin(0.5)
      .setDepth(10);

    // Podium standings: winner center + raised.
    const xs = [GAME_WIDTH / 2, GAME_WIDTH / 2 - 380, GAME_WIDTH / 2 + 380];
    const ys = [430, 480, 480];
    standings.forEach((c, i) => {
      const podium = makePodium(
        this,
        xs[i],
        ys[i],
        c,
        session.avatars.get(c.id) ?? null,
        i === 0 ? 300 : 250,
        i === 0 ? 150 : 120,
      );
      podium.container.setDepth(10);
      if (i === 0) podium.setHighlight(true, COLORS.goldBright);
      const place = this.add
        .text(xs[i], ys[i] - (i === 0 ? 130 : 110), ['1ST', '2ND', '3RD'][i], {
          fontFamily: VALUE_FONT,
          fontSize: '30px',
          color: hexString(COLORS.goldBright),
        })
        .setOrigin(0.5)
        .setDepth(10);
      place.setAlpha(0);
      this.tweens.add({ targets: place, alpha: 1, delay: 400 + i * 250, duration: 300 });
    });

    // Confetti rain.
    const emitter = this.add.particles(0, 0, sparkKey, {
      x: { min: 0, max: GAME_WIDTH },
      y: -16,
      lifespan: 4200,
      speedY: { min: 130, max: 320 },
      speedX: { min: -60, max: 60 },
      rotate: { min: 0, max: 360 },
      scale: { min: 0.4, max: 1.1 },
      quantity: 4,
      frequency: 36,
      tint: [0xd69f4c, 0x060ce9, 0xffffff, 0xffcc66, 0x2ecc71, 0xe05c4b],
    });
    emitter.setDepth(20);

    audio.fanfare();
    audio.applause(2.4);
    this.time.delayedCall(1600, () => audio.applause(2.0));

    makeTextButton(
      this,
      GAME_WIDTH / 2,
      630,
      300,
      66,
      'PLAY AGAIN',
      () => {
        audio.click();
        session.provider.leave();
        this.registry.remove(REGISTRY_KEYS.session);
        this.scene.start(SCENE_KEYS.lobby);
      },
      { fontSize: 30 },
    ).container.setDepth(30);
  }
}
