/**
 * PERIL! lobby — title card, then a REAL opponent scan ("Scanning the floor
 * for available players…"): when Firestore + a signed-in principal are
 * available the scan queries open realtime matches in the tenant (joining the
 * freshest or hosting a new one); when no humans show up — or when signed
 * out — the existing AI fallback seats the house contestants.
 */

import Phaser from 'phaser';
import { AiOpponentProvider } from '../ai-opponents';
import { createSeededRng, PerilEngine } from '../game-rules';
import type { FirestoreMatchProvider } from '../firestore-match-provider';
import { OpponentAvatar, OpponentProfile } from '../opponent-provider';
import {
  COLORS,
  drawAvatar,
  drawStageBackdrop,
  ensureSparkTexture,
  GAME_HEIGHT,
  GAME_WIDTH,
  getAudio,
  getServices,
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

interface SeatCard {
  id: string;
  name: string;
  isHuman: boolean;
}

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
    const realtime = getServices(this)?.createMatchProvider?.() ?? null;
    const scanStartedAt = this.time.now;

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

    // Radar sweep (loops: a realtime scan can outlast the base window).
    const radar = this.add.container(GAME_WIDTH / 2, 500);
    const ring = this.add.circle(0, 0, 60).setStrokeStyle(2, COLORS.gold, 0.8);
    const ring2 = this.add.circle(0, 0, 38).setStrokeStyle(1, COLORS.gold, 0.4);
    const sweep = this.add.graphics();
    sweep.fillStyle(COLORS.goldBright, 0.35);
    sweep.slice(0, 0, 60, -0.5, 0.35, false);
    sweep.fillPath();
    radar.add([ring, ring2, sweep]);
    this.tweens.add({
      targets: sweep,
      rotation: Math.PI * 8,
      duration: SCAN_MS,
      ease: 'Linear',
      repeat: -1,
    });

    const endScan = (message: string) => {
      dotTimer.remove();
      scanText.setText(message);
      radar.destroy();
      audio.applause(1.2);
    };

    // The unchanged AI fallback: pads out the remaining scan time, then
    // seats the house bots.
    const seatAi = () => {
      const aiProvider = new AiOpponentProvider();
      const remaining = Math.max(0, SCAN_MS - (this.time.now - scanStartedAt));
      void aiProvider.joinLobby(remaining).then((opponents) => {
        if (!this.scene.isActive(SCENE_KEYS.lobby)) return;
        endScan('No human challengers found — seating our house contestants!');
        this.seatAiContestants(aiProvider, opponents);
      });
    };

    if (!realtime) {
      seatAi();
      return;
    }

    // Really scan the floor: join the freshest open match, or host one and
    // wait for joiners; an empty result hands over to the AI fallback.
    void realtime.joinLobby(SCAN_MS).then((humans) => {
      if (!this.scene.isActive(SCENE_KEYS.lobby)) {
        realtime.leave();
        return;
      }
      if (humans.length === 0) {
        realtime.leave();
        seatAi();
        return;
      }
      endScan(
        humans.length === 1
          ? 'A challenger steps up to the podiums!'
          : 'Challengers step up to the podiums!',
      );
      this.seatHumanContestants(realtime, humans);
    });
  }

  // ---- Realtime humans ---------------------------------------------------------

  private seatHumanContestants(
    provider: FirestoreMatchProvider,
    opponents: OpponentProfile[],
  ): void {
    const audio = getAudio(this);
    const selfUid = provider.selfUid ?? HUMAN_ID;
    // Seat order comes from the match roster (join order, host first) so
    // every client builds the identical contestant list.
    const seats: SeatCard[] = provider.players.map((p) => ({
      id: p.uid,
      name: p.uid === selfUid ? 'You' : p.displayName,
      isHuman: p.uid === selfUid,
    }));
    const seed = provider.matchSeed ?? Math.floor(Math.random() * 0x7fffffff);
    const engine = new PerilEngine(seats, createSeededRng(seed));
    engine.controlId = provider.hostUid ?? seats[0].id; // the host selects first

    const avatars = new Map<string, OpponentAvatar>(opponents.map((o) => [o.id, o.avatar]));
    const session: PerilSession = {
      engine,
      provider,
      humanId: selfUid,
      opponents,
      avatars,
      seed,
    };
    this.registry.set(REGISTRY_KEYS.session, session);
    this.dealSeatCards(seats, avatars);

    // Seats filled — countdown, then the host locks the match to 'playing'.
    this.time.delayedCall(1300, () => {
      const countdown = this.add
        .text(GAME_WIDTH / 2, 430, 'Starting in 3…', {
          fontFamily: VALUE_FONT,
          fontSize: '44px',
          color: hexString(COLORS.goldBright),
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5);
      let remaining = 3;
      audio.blip(remaining);
      this.time.addEvent({
        delay: 1000,
        repeat: 2,
        callback: () => {
          remaining -= 1;
          if (remaining > 0) {
            countdown.setText(`Starting in ${remaining}…`);
            audio.blip(remaining);
          } else {
            provider.markStarted?.();
            this.scene.start(SCENE_KEYS.board, { round: 'round1' });
          }
        },
      });
    });
  }

  // ---- AI fallback ----------------------------------------------------------------

  private seatAiContestants(provider: AiOpponentProvider, opponents: OpponentProfile[]): void {
    const seats: SeatCard[] = [
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
    this.dealSeatCards(seats, avatars);

    this.time.delayedCall(1400, () => {
      const audio = getAudio(this);
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

  // ---- Shared podium introduction ----------------------------------------------------

  private dealSeatCards(seats: SeatCard[], avatars: Map<string, OpponentAvatar>): void {
    const audio = getAudio(this);
    const xs =
      seats.length === 2
        ? [GAME_WIDTH / 2 - 200, GAME_WIDTH / 2 + 200]
        : [GAME_WIDTH / 2 - 360, GAME_WIDTH / 2, GAME_WIDTH / 2 + 360];
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
  }
}
