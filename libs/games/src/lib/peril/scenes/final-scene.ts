/**
 * FINAL PERIL! — contestants with positive scores wager privately, the
 * original 30-second think-music loop plays, then responses and wagers are
 * revealed lowest score first.
 */

import Phaser from 'phaser';
import { buildClueOptions, FINAL_PERIL } from '../peril-data';
import { ContestantState, formatMoney } from '../game-rules';
import { OpponentEvent, Unsubscribe } from '../opponent-provider';
import {
  COLORS,
  GAME_HEIGHT,
  GAME_WIDTH,
  getAudio,
  getSession,
  hexString,
  makeClueText,
  makePodium,
  makeTextButton,
  PodiumDisplay,
  SCENE_KEYS,
  TextButton,
  UI_FONT,
  VALUE_FONT,
} from './theme';

const THINK_MS = 30000;

export class FinalScene extends Phaser.Scene {
  private finalists: ContestantState[] = [];
  private wagers = new Map<string, number>();
  private answers = new Map<string, number | null>();
  private podiums = new Map<string, PodiumDisplay>();
  private unsubscribe: Unsubscribe | null = null;
  private options: string[] = [];
  private correctIndex = 0;
  private optionButtons: TextButton[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private humanLocked = false;

  constructor() {
    super(SCENE_KEYS.final);
  }

  create(): void {
    const session = getSession(this);
    this.finalists = session.engine.finalists();
    this.wagers.clear();
    this.answers.clear();
    this.podiums.clear();
    this.optionButtons = [];
    this.humanLocked = false;

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.boardBlue);

    this.unsubscribe = session.provider.subscribe((e) => this.onOpponentEvent(e));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      getAudio(this).stopThinkMusic();
      session.provider.cancelPending();
    });

    this.statusText = this.add
      .text(GAME_WIDTH / 2, 540, '', {
        fontFamily: UI_FONT,
        fontSize: '24px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(20);

    // Podium strip.
    const xs = [240, GAME_WIDTH / 2, GAME_WIDTH - 240];
    session.engine.contestants.forEach((c, i) => {
      const p = makePodium(this, xs[i], 648, c, session.avatars.get(c.id) ?? null, 260, 116);
      if (!this.finalists.some((f) => f.id === c.id)) p.container.setAlpha(0.35);
      this.podiums.set(c.id, p);
    });

    if (this.finalists.length === 0) {
      this.statusText.setText('No contestant finished with a positive score!');
      this.time.delayedCall(2200, () => this.scene.start(SCENE_KEYS.results));
      return;
    }

    this.playSplash(() => this.beginWagers());
  }

  private playSplash(done: () => void): void {
    const audio = getAudio(this);
    audio.dailyDouble();
    const splash = this.add
      .text(GAME_WIDTH / 2, 240, 'FINAL PERIL!', {
        fontFamily: VALUE_FONT,
        fontSize: '110px',
        color: '#ffffff',
        stroke: hexString(COLORS.gold),
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setScale(0.2);
    const category = this.add
      .text(GAME_WIDTH / 2, 360, `THE CATEGORY:  ${FINAL_PERIL.category}`, {
        fontFamily: UI_FONT,
        fontSize: '32px',
        fontStyle: 'bold',
        color: hexString(COLORS.goldBright),
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: splash, scale: 1, duration: 600, ease: 'Back.easeOut' });
    this.tweens.add({ targets: category, alpha: 1, delay: 700, duration: 400 });
    this.time.delayedCall(2300, () => {
      this.tweens.add({
        targets: [splash],
        y: 110,
        scale: 0.5,
        duration: 450,
        ease: 'Cubic.easeInOut',
      });
      this.tweens.add({
        targets: [category],
        y: 175,
        duration: 450,
        ease: 'Cubic.easeInOut',
        onComplete: done,
      });
    });
  }

  // ---- Wagers --------------------------------------------------------------------

  private beginWagers(): void {
    const session = getSession(this);
    const audio = getAudio(this);

    // AI finalists wager privately.
    for (const f of this.finalists) {
      if (!f.isHuman) {
        session.provider.requestWager(f.id, 'final', f.score, session.engine.roundTopValue);
      }
    }

    const human = this.finalists.find((f) => f.isHuman);
    if (!human) {
      const msg =
        session.engine.score(session.humanId) <= 0
          ? 'Your score is not positive — you sit out Final PERIL! and watch the reveal.'
          : '';
      this.statusText.setText(msg);
      this.maybeStartThinking();
      return;
    }

    let wager = session.engine.clampFinalWager(human.id, Math.floor(human.score / 2));
    const prompt = this.add
      .text(GAME_WIDTH / 2, 270, 'Wager privately — how much of your money is on the line?', {
        fontFamily: UI_FONT,
        fontSize: '26px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const amount = this.add
      .text(GAME_WIDTH / 2, 340, formatMoney(wager), {
        fontFamily: VALUE_FONT,
        fontSize: '64px',
        color: hexString(COLORS.goldBright),
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const range = this.add
      .text(GAME_WIDTH / 2, 392, `$0 to ${formatMoney(human.score)}`, {
        fontFamily: UI_FONT,
        fontSize: '20px',
        color: '#aab4ff',
      })
      .setOrigin(0.5);

    const widgets: TextButton[] = [];
    const setWager = (v: number) => {
      wager = session.engine.clampFinalWager(human.id, v);
      amount.setText(formatMoney(wager));
      audio.click();
    };
    const mk = (x: number, label: string, fn: () => void, w = 130) =>
      widgets.push(makeTextButton(this, x, 450, w, 54, label, fn, { fontSize: 24 }));
    mk(GAME_WIDTH / 2 - 320, '-500', () => setWager(wager - 500));
    mk(GAME_WIDTH / 2 - 170, '-100', () => setWager(wager - 100));
    mk(GAME_WIDTH / 2 - 20, '+100', () => setWager(wager + 100));
    mk(GAME_WIDTH / 2 + 130, '+500', () => setWager(wager + 500));
    mk(GAME_WIDTH / 2 + 300, 'ALL IN', () => setWager(human.score), 160);
    const lock = makeTextButton(
      this,
      GAME_WIDTH / 2,
      512,
      280,
      58,
      'LOCK IN WAGER',
      () => {
        audio.click();
        this.wagers.set(human.id, wager);
        [prompt, amount, range].forEach((o) => o.destroy());
        widgets.forEach((w) => w.container.destroy());
        lock.container.destroy();
        this.maybeStartThinking();
      },
      { fontSize: 26 },
    );
  }

  private maybeStartThinking(): void {
    const pendingWagers = this.finalists.some((f) => !this.wagers.has(f.id));
    if (pendingWagers) {
      this.statusText.setText('Waiting for all wagers to lock in…');
      return;
    }
    this.statusText.setText('');
    this.beginThinking();
  }

  // ---- Clue + think music ------------------------------------------------------------

  private beginThinking(): void {
    const session = getSession(this);
    const audio = getAudio(this);
    const shuffled = buildClueOptions(FINAL_PERIL.clue);
    this.options = shuffled.options;
    this.correctIndex = shuffled.correctIndex;

    const clueText = makeClueText(this, GAME_WIDTH / 2, 270, FINAL_PERIL.clue.clue, 30, 1100);
    clueText.setAlpha(0);
    this.tweens.add({ targets: clueText, alpha: 1, duration: 450 });
    audio.reveal();
    audio.startThinkMusic();

    // AI finalists pick (privately).
    for (const f of this.finalists) {
      if (!f.isHuman) {
        this.answers.set(f.id, null);
        session.provider.requestAnswer(f.id, {
          value: this.wagers.get(f.id) ?? 0,
          roundTopValue: session.engine.roundTopValue,
          optionCount: this.options.length,
          correctOptionIndex: this.correctIndex,
          lockedOutIds: [],
        });
      }
    }

    const humanPlays = this.finalists.some((f) => f.isHuman);
    const positions: Array<[number, number]> = [
      [GAME_WIDTH / 2 - 305, 420],
      [GAME_WIDTH / 2 + 305, 420],
      [GAME_WIDTH / 2 - 305, 496],
      [GAME_WIDTH / 2 + 305, 496],
    ];
    this.options.forEach((option, i) => {
      const btn = makeTextButton(
        this,
        positions[i][0],
        positions[i][1],
        590,
        66,
        option,
        () => {
          if (!humanPlays || this.humanLocked) return;
          this.humanLocked = true;
          this.answers.set(getSession(this).humanId, i);
          btn.background.setFillStyle(COLORS.boardBlue);
          btn.background.setStrokeStyle(4, COLORS.goldBright, 1);
          this.statusText.setText('Response locked in!');
          getAudio(this).click();
        },
        { fontSize: 21, fill: COLORS.boardBlueDark },
      );
      if (!humanPlays) btn.setEnabled(false);
      this.optionButtons.push(btn);
    });

    if (humanPlays) {
      this.statusText.setText('30 seconds — choose your response!');
    }

    // Timer bar across the top.
    const bar = this.add.rectangle(GAME_WIDTH / 2, 8, GAME_WIDTH, 8, COLORS.goldBright);
    this.tweens.add({ targets: bar, scaleX: 0, duration: THINK_MS, ease: 'Linear' });
    this.time.delayedCall(THINK_MS, () => this.beginReveal());
  }

  private onOpponentEvent(e: OpponentEvent): void {
    if (e.type === 'wager' && e.kind === 'final') {
      const session = getSession(this);
      this.wagers.set(e.opponentId, session.engine.clampFinalWager(e.opponentId, e.amount));
      this.maybeStartThinking();
    } else if (e.type === 'answer') {
      if (this.answers.has(e.opponentId)) this.answers.set(e.opponentId, e.optionIndex);
    }
  }

  // ---- Reveal --------------------------------------------------------------------------

  private beginReveal(): void {
    const audio = getAudio(this);
    audio.stopThinkMusic();
    audio.timesUp();
    this.optionButtons.forEach((b) => b.setEnabled(false));
    this.statusText.setText("Time's up! Let's see the responses…");

    // Highlight the correct response for the audience.
    const correctBtn = this.optionButtons[this.correctIndex];
    this.time.delayedCall(900, () => {
      correctBtn.background.setFillStyle(COLORS.correctGreen);
      correctBtn.container.setAlpha(1);
    });

    const order = [...this.finalists].sort((a, b) => a.score - b.score);
    order.forEach((finalist, i) => {
      this.time.delayedCall(2200 + i * 3000, () => this.revealOne(finalist));
    });
    this.time.delayedCall(2200 + order.length * 3000 + 800, () => {
      this.scene.start(SCENE_KEYS.results);
    });
  }

  private revealOne(finalist: ContestantState): void {
    const session = getSession(this);
    const audio = getAudio(this);
    const wager = this.wagers.get(finalist.id) ?? 0;
    const picked = this.answers.get(finalist.id) ?? null;
    const correct = picked === this.correctIndex;
    const response = picked === null ? '(no response)' : this.options[picked];

    this.statusText.setText(
      `${finalist.isHuman ? 'YOU' : finalist.name}: "${response}" — wagered ${formatMoney(wager)}`,
    );
    if (correct) {
      audio.correct();
      session.engine.applyCorrect(finalist.id, wager);
    } else {
      audio.wrong();
      this.cameras.main.shake(180, 0.004);
      session.engine.applyWrong(finalist.id, wager);
    }
    this.podiums.get(finalist.id)?.rollScoreTo(this, session.engine.score(finalist.id));
    this.podiums
      .get(finalist.id)
      ?.setHighlight(true, correct ? COLORS.correctGreen : COLORS.wrongRed);
  }
}
