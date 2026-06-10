/**
 * Hazard Hunter — Phaser HUD running as a transparent, pointer-events:none
 * overlay canvas above the three.js world.
 */
import Phaser from 'phaser';

const FONT = "adobe-clean, 'Source Sans Pro', -apple-system, BlinkMacSystemFont, sans-serif";

class HudScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private foundText!: Phaser.GameObjects.Text;
  private inspectLabel!: Phaser.GameObjects.Text;
  private pips: Phaser.GameObjects.Arc[] = [];
  private vignette!: Phaser.GameObjects.Graphics;
  private banner?: Phaser.GameObjects.Container;
  private displayedScore = 0;
  private targetScore = 0;
  private pipTotal = 0;

  constructor() {
    super('hud');
  }

  create(): void {
    const pad = 18;
    this.scoreText = this.add
      .text(pad, pad, 'SCORE 0', {
        fontFamily: FONT,
        fontSize: '26px',
        fontStyle: '700',
        color: '#ffffff',
        stroke: '#00000088',
        strokeThickness: 4,
      })
      .setShadow(0, 2, '#000000', 6, true, true);

    this.foundText = this.add
      .text(pad, pad + 34, 'HAZARDS 0 / 0', {
        fontFamily: FONT,
        fontSize: '16px',
        fontStyle: '600',
        color: '#9ce0ff',
        stroke: '#00000088',
        strokeThickness: 3,
      })
      .setShadow(0, 2, '#000000', 5, true, true);

    this.inspectLabel = this.add
      .text(this.scale.width - pad, pad, 'INSPECTIONS', {
        fontFamily: FONT,
        fontSize: '13px',
        fontStyle: '700',
        color: '#ffd866',
        stroke: '#00000088',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setShadow(0, 2, '#000000', 5, true, true);

    this.vignette = this.add.graphics().setDepth(50).setAlpha(0);
    this.drawVignette();

    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.inspectLabel.setX(this.scale.width - pad);
      this.layoutPips();
      this.drawVignette();
    });
  }

  setScore(score: number, animate = true): void {
    this.targetScore = score;
    if (!animate) {
      this.displayedScore = score;
      this.scoreText.setText(`SCORE ${score}`);
      return;
    }
    this.tweens.addCounter({
      from: this.displayedScore,
      to: score,
      duration: 650,
      ease: Phaser.Math.Easing.Cubic.Out,
      onUpdate: (tw) => {
        this.displayedScore = Math.round(tw.getValue() ?? 0);
        this.scoreText.setText(`SCORE ${this.displayedScore}`);
      },
      onComplete: () => {
        this.displayedScore = this.targetScore;
        this.scoreText.setText(`SCORE ${this.targetScore}`);
      },
    });
    this.tweens.add({
      targets: this.scoreText,
      scale: { from: 1.35, to: 1 },
      duration: 420,
      ease: Phaser.Math.Easing.Back.Out,
    });
  }

  setFound(found: number, total: number): void {
    this.foundText.setText(`HAZARDS ${found} / ${total}`);
    this.tweens.add({
      targets: this.foundText,
      scale: { from: 1.25, to: 1 },
      duration: 360,
      ease: Phaser.Math.Easing.Back.Out,
    });
  }

  setInspections(left: number, total: number): void {
    if (total !== this.pipTotal) {
      this.pipTotal = total;
      this.pips.forEach((p) => p.destroy());
      this.pips = [];
      for (let i = 0; i < total; i++) {
        this.pips.push(this.add.circle(0, 0, 6, 0xffd866).setDepth(5));
      }
      this.layoutPips();
    }
    this.pips.forEach((pip, i) => {
      const active = i < left;
      const wasActive = pip.fillAlpha > 0.55;
      pip.setFillStyle(active ? 0xffd866 : 0x666666, active ? 1 : 0.45);
      if (wasActive && !active) {
        this.tweens.add({
          targets: pip,
          scale: { from: 2.1, to: 1 },
          duration: 420,
          ease: Phaser.Math.Easing.Elastic.Out,
        });
      }
    });
  }

  /** "SHIFT 1 — WAREHOUSE" sweep-in banner. */
  showBanner(title: string, subtitle: string): void {
    this.banner?.destroy();
    const w = this.scale.width;
    const cy = this.scale.height * 0.24;

    const bg = this.add.rectangle(0, 0, w * 0.62, 86, 0x101418, 0.86);
    bg.setStrokeStyle(2, 0xffd866, 0.9);
    const stripeT = this.add.rectangle(0, -43, w * 0.62, 6, 0xffd866);
    const stripeB = this.add.rectangle(0, 43, w * 0.62, 6, 0xffd866);
    const titleText = this.add
      .text(0, -12, title, {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: '800',
        color: '#ffffff',
        letterSpacing: 3,
      })
      .setOrigin(0.5);
    const subText = this.add
      .text(0, 22, subtitle, {
        fontFamily: FONT,
        fontSize: '15px',
        fontStyle: '600',
        color: '#ffd866',
        letterSpacing: 2,
      })
      .setOrigin(0.5);

    const banner = this.add.container(-w * 0.6, cy, [bg, stripeT, stripeB, titleText, subText]);
    banner.setDepth(60);
    this.banner = banner;

    this.tweens.chain({
      targets: banner,
      tweens: [
        {
          x: w / 2,
          duration: 620,
          ease: Phaser.Math.Easing.Back.Out,
        },
        { x: w / 2, duration: 1500 },
        {
          x: w * 1.65,
          duration: 480,
          ease: Phaser.Math.Easing.Cubic.In,
          onComplete: () => {
            banner.destroy();
            if (this.banner === banner) this.banner = undefined;
          },
        },
      ],
    });
  }

  /** Tweened "+250!" style popup at screen centre. */
  popup(message: string, color = '#7df2a8'): void {
    const t = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 40, message, {
        fontFamily: FONT,
        fontSize: '34px',
        fontStyle: '800',
        color,
        stroke: '#000000aa',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(70)
      .setScale(0.2)
      .setAlpha(0);
    this.tweens.add({
      targets: t,
      scale: 1,
      alpha: 1,
      duration: 380,
      ease: Phaser.Math.Easing.Back.Out,
    });
    this.tweens.add({
      targets: t,
      y: t.y - 90,
      alpha: 0,
      delay: 700,
      duration: 600,
      ease: Phaser.Math.Easing.Cubic.In,
      onComplete: () => t.destroy(),
    });
  }

  /** Red screen-edge pulse while an incident report plays. */
  incidentPulse(): void {
    this.vignette.setAlpha(0);
    this.tweens.add({
      targets: this.vignette,
      alpha: { from: 0, to: 1 },
      duration: 260,
      yoyo: true,
      repeat: 3,
      ease: Phaser.Math.Easing.Sine.InOut,
    });
  }

  /** Confetti burst on level clear. */
  confetti(): void {
    const colors = [0xffd866, 0x7df2a8, 0x6cb8ff, 0xff6c8f, 0xffffff];
    const w = this.scale.width;
    for (let i = 0; i < 90; i++) {
      const x = w / 2 + Phaser.Math.Between(-60, 60);
      const y = this.scale.height * 0.3;
      const piece = this.add
        .rectangle(
          x,
          y,
          Phaser.Math.Between(6, 11),
          Phaser.Math.Between(8, 16),
          colors[i % colors.length],
        )
        .setDepth(80);
      this.tweens.add({
        targets: piece,
        x: x + Phaser.Math.Between(-360, 360),
        y: this.scale.height + 40,
        angle: Phaser.Math.Between(-540, 540),
        alpha: { from: 1, to: 0.4 },
        duration: Phaser.Math.Between(1300, 2300),
        ease: Phaser.Math.Easing.Quadratic.In,
        onComplete: () => piece.destroy(),
      });
    }
  }

  private layoutPips(): void {
    const pad = 18;
    const right = this.scale.width - pad;
    this.pips.forEach((pip, i) => {
      pip.setPosition(right - 7 - (this.pips.length - 1 - i) * 19, pad + 32);
    });
  }

  private drawVignette(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const g = this.vignette;
    g.clear();
    const band = Math.min(w, h) * 0.16;
    for (let i = 0; i < 10; i++) {
      const a = 0.32 * (1 - i / 10);
      const inset = (band / 10) * i;
      g.lineStyle(band / 10 + 1, 0xd7373f, a);
      g.strokeRect(
        inset + band / 20,
        inset + band / 20,
        w - inset * 2 - band / 10,
        h - inset * 2 - band / 10,
      );
    }
  }
}

/** Thin imperative facade the Angular component drives. */
export class HazardHud {
  private game: Phaser.Game;
  private sceneRef: HudScene | null = null;
  private ready = false;
  private queue: Array<() => void> = [];

  constructor(parent: HTMLElement) {
    const scene = new HudScene();
    this.game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent,
      transparent: true,
      width: parent.clientWidth || 800,
      height: parent.clientHeight || 600,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      banner: false,
      audio: { noAudio: true },
      scene,
    });
    scene.events.once(Phaser.Scenes.Events.CREATE, () => {
      this.sceneRef = scene;
      this.ready = true;
      this.queue.forEach((fn) => fn());
      this.queue = [];
    });
    // The HUD must never intercept pointer events meant for the world.
    this.game.events.once(Phaser.Core.Events.READY, () => {
      const canvas = this.game.canvas;
      if (canvas) {
        canvas.style.pointerEvents = 'none';
        canvas.style.position = 'absolute';
        canvas.style.inset = '0';
      }
    });
  }

  setScore(score: number, animate = true): void {
    this.run((s) => s.setScore(score, animate));
  }

  setFound(found: number, total: number): void {
    this.run((s) => s.setFound(found, total));
  }

  setInspections(left: number, total: number): void {
    this.run((s) => s.setInspections(left, total));
  }

  showBanner(title: string, subtitle: string): void {
    this.run((s) => s.showBanner(title, subtitle));
  }

  popup(message: string, color?: string): void {
    this.run((s) => s.popup(message, color));
  }

  incidentPulse(): void {
    this.run((s) => s.incidentPulse());
  }

  confetti(): void {
    this.run((s) => s.confetti());
  }

  destroy(): void {
    this.queue = [];
    this.sceneRef = null;
    this.game.destroy(true);
  }

  private run(fn: (scene: HudScene) => void): void {
    if (this.ready && this.sceneRef) fn(this.sceneRef);
    else this.queue.push(() => this.sceneRef && fn(this.sceneRef));
  }
}
