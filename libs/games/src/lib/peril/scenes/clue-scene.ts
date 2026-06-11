/**
 * PERIL! clue scene — full-screen clue reveal, authentic buzzer window with
 * the 250ms early-buzz lockout, multiple-choice answering, Daily Double
 * splash + wagering, scoring, and explanations.
 */

import Phaser from 'phaser';
import { buildClueOptions, PerilClue } from '../peril-data';
import {
  BuzzerWindow,
  CellRef,
  createSeededRng,
  formatMoney,
  THINK_WINDOW_MS,
} from '../game-rules';
import { clueOptionSeed } from '../match-protocol';
import { ClueContext, OpponentEvent, Unsubscribe } from '../opponent-provider';
import {
  COLORS,
  GAME_HEIGHT,
  GAME_WIDTH,
  getAudio,
  getSession,
  hexString,
  makeClueText,
  makeTextButton,
  SCENE_KEYS,
  TextButton,
  UI_FONT,
  VALUE_FONT,
  watchHostDeparture,
} from './theme';

export interface ClueSceneData {
  ref: CellRef;
  clue: PerilClue;
  categoryName: string;
  value: number;
  isDailyDouble: boolean;
  selectorId: string;
}

type Phase = 'splash' | 'wager' | 'reading' | 'buzz' | 'answer' | 'resolve' | 'done';

const ANSWER_WINDOW_MS = 8000;
const REOPEN_WINDOW_MS = 5000;

export class ClueScene extends Phaser.Scene {
  private params!: ClueSceneData;
  private phase: Phase = 'reading';
  private buzzer = new BuzzerWindow();
  private unsubscribe: Unsubscribe | null = null;
  private options: string[] = [];
  private correctIndex = 0;
  private optionButtons: TextButton[] = [];
  private stake = 0;
  private answererId: string | null = null;
  private timerBar!: Phaser.GameObjects.Rectangle;
  private timerTween: Phaser.Tweens.Tween | null = null;
  private timerCall: Phaser.Time.TimerEvent | null = null;
  private buzzHint!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private miniScores = new Map<string, Phaser.GameObjects.Text>();
  private lockoutFlash!: Phaser.GameObjects.Rectangle;
  private buzzOpenedAt = 0;
  private answerStartedAt = 0;

  constructor() {
    super(SCENE_KEYS.clue);
  }

  init(data: ClueSceneData): void {
    this.params = data;
    this.phase = 'reading';
    this.buzzer = new BuzzerWindow();
    this.optionButtons = [];
    this.miniScores.clear();
    this.answererId = null;
    this.timerTween = null;
    this.timerCall = null;
    this.unsubscribe = null;
  }

  create(): void {
    const session = getSession(this);
    const audio = getAudio(this);
    // Realtime matches shuffle options from the shared match seed so every
    // client renders the identical layout; AI matches stay random.
    const optionRng =
      session.seed !== undefined
        ? createSeededRng(
            clueOptionSeed(session.seed, this.params.ref.categoryIndex, this.params.ref.clueIndex),
          )
        : Math.random;
    const shuffled = buildClueOptions(this.params.clue, optionRng);
    this.options = shuffled.options;
    this.correctIndex = shuffled.correctIndex;
    this.stake = this.params.value;

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.boardBlue);
    this.lockoutFlash = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT)
      .setStrokeStyle(14, COLORS.lockoutRed, 1)
      .setAlpha(0)
      .setDepth(60);

    this.unsubscribe = session.provider.subscribe((e) => this.onOpponentEvent(e));
    const unsubHostLeft = watchHostDeparture(this, session);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      unsubHostLeft();
      session.provider.cancelPending();
    });

    this.buzzer.arm();

    if (this.params.isDailyDouble) {
      this.playDailyDoubleSplash(() => this.beginWager());
    } else {
      this.buildCommonChrome();
      this.revealClue(() => this.openBuzzWindow());
    }

    // Human buzzer: SPACE.
    this.input.keyboard?.on('keydown-SPACE', () => this.humanBuzz());
    audio.unlock();
  }

  // ---- Layout -------------------------------------------------------------------

  private buildCommonChrome(): void {
    const session = getSession(this);
    this.add
      .text(GAME_WIDTH / 2, 46, `${this.params.categoryName}  —  ${formatMoney(this.stake)}`, {
        fontFamily: VALUE_FONT,
        fontSize: '34px',
        color: hexString(COLORS.goldBright),
      })
      .setOrigin(0.5)
      .setName('chrome-header');

    this.statusText = this.add
      .text(GAME_WIDTH / 2, 568, '', {
        fontFamily: UI_FONT,
        fontSize: '24px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.buzzHint = this.add
      .text(GAME_WIDTH / 2, 614, '', {
        fontFamily: UI_FONT,
        fontSize: '20px',
        color: '#aab4ff',
      })
      .setOrigin(0.5);

    // Timer bar.
    this.add.rectangle(GAME_WIDTH / 2, 648, 720, 14, COLORS.nearBlack).setDepth(10);
    this.timerBar = this.add
      .rectangle(GAME_WIDTH / 2, 648, 716, 10, COLORS.goldBright)
      .setDepth(11)
      .setVisible(false);

    // Mini score strip.
    const xs = [240, GAME_WIDTH / 2, GAME_WIDTH - 240];
    session.engine.contestants.forEach((c, i) => {
      const t = this.add
        .text(xs[i], 692, `${c.name.toUpperCase()}  ${formatMoney(c.score)}`, {
          fontFamily: UI_FONT,
          fontSize: '20px',
          color: '#dfe4ff',
        })
        .setOrigin(0.5);
      this.miniScores.set(c.id, t);
    });
  }

  private refreshMiniScores(): void {
    const session = getSession(this);
    session.engine.contestants.forEach((c) => {
      this.miniScores
        .get(c.id)
        ?.setText(`${c.name.toUpperCase()}  ${formatMoney(c.score)}`)
        .setColor(c.score < 0 ? '#ff8d8d' : '#dfe4ff');
    });
  }

  private highlightAnswerer(id: string | null): void {
    this.miniScores.forEach((t, cid) => {
      t.setColor(cid === id ? hexString(COLORS.goldBright) : '#dfe4ff');
      t.setFontStyle(cid === id ? 'bold' : 'normal');
    });
  }

  // ---- Daily Double ----------------------------------------------------------------

  private playDailyDoubleSplash(done: () => void): void {
    const audio = getAudio(this);
    this.phase = 'splash';
    audio.dailyDouble();

    // Spinning rays.
    const rays = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(5);
    const g = this.add.graphics();
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2;
      g.fillStyle(i % 2 === 0 ? COLORS.gold : COLORS.boardBlueDark, 0.5);
      g.slice(0, 0, 900, a0, a0 + Math.PI / 12, false);
      g.fillPath();
    }
    rays.add(g);
    this.tweens.add({ targets: rays, rotation: Math.PI * 2, duration: 6000, repeat: -1 });

    const splash = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'DAILY\nDOUBLE!', {
        fontFamily: VALUE_FONT,
        fontSize: '128px',
        color: '#ffffff',
        align: 'center',
        stroke: hexString(COLORS.gold),
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setScale(0.1)
      .setDepth(6);
    this.cameras.main.flash(220, 255, 215, 120);
    this.tweens.add({
      targets: splash,
      scale: 1,
      duration: 650,
      ease: 'Back.easeOut',
    });
    this.time.delayedCall(2000, () => {
      this.tweens.add({
        targets: [splash, rays],
        alpha: 0,
        duration: 320,
        onComplete: () => {
          splash.destroy();
          rays.destroy();
          done();
        },
      });
    });
  }

  private beginWager(): void {
    const session = getSession(this);
    this.phase = 'wager';
    this.buildCommonChrome();
    const selector = session.engine.contestant(this.params.selectorId);
    const bounds = session.engine.dailyDoubleWagerBounds(selector.id);

    if (!selector.isHuman) {
      this.statusText.setText(`${selector.name} is wagering…`);
      session.provider.requestWager(
        selector.id,
        'daily-double',
        selector.score,
        session.engine.roundTopValue,
      );
      return; // continues in onOpponentEvent('wager')
    }

    let wager = session.engine.clampDailyDoubleWager(selector.id, this.params.value);
    const title = this.add
      .text(GAME_WIDTH / 2, 200, 'Only you may answer.\nMake your wager!', {
        fontFamily: UI_FONT,
        fontSize: '30px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);
    const amount = this.add
      .text(GAME_WIDTH / 2, 300, formatMoney(wager), {
        fontFamily: VALUE_FONT,
        fontSize: '72px',
        color: hexString(COLORS.goldBright),
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const range = this.add
      .text(GAME_WIDTH / 2, 360, `Wager ${formatMoney(bounds.min)} to ${formatMoney(bounds.max)}`, {
        fontFamily: UI_FONT,
        fontSize: '20px',
        color: '#aab4ff',
      })
      .setOrigin(0.5);

    const widgets: TextButton[] = [];
    const setWager = (v: number) => {
      wager = session.engine.clampDailyDoubleWager(selector.id, v);
      amount.setText(formatMoney(wager));
      getAudio(this).click();
    };
    const mk = (x: number, label: string, fn: () => void, w = 130) =>
      widgets.push(makeTextButton(this, x, 440, w, 56, label, fn, { fontSize: 26 }));
    mk(GAME_WIDTH / 2 - 330, '-500', () => setWager(wager - 500));
    mk(GAME_WIDTH / 2 - 180, '-100', () => setWager(wager - 100));
    mk(GAME_WIDTH / 2 - 30, '+100', () => setWager(wager + 100));
    mk(GAME_WIDTH / 2 + 120, '+500', () => setWager(wager + 500));
    widgets.push(
      makeTextButton(
        this,
        GAME_WIDTH / 2 + 330,
        440,
        220,
        56,
        'TRUE DAILY DOUBLE',
        () => setWager(bounds.max),
        { fontSize: 20, fill: COLORS.boardBlueDark },
      ),
    );
    const confirm = makeTextButton(
      this,
      GAME_WIDTH / 2,
      520,
      260,
      62,
      'LOCK IT IN',
      () => {
        [title, amount, range].forEach((o) => o.destroy());
        widgets.forEach((w) => w.container.destroy());
        confirm.container.destroy();
        // Relay the local wager to remote clients (realtime matches only).
        session.provider.sendLocalWager?.('daily-double', wager);
        this.acceptWager(wager);
      },
      { fontSize: 30 },
    );
  }

  private acceptWager(wager: number): void {
    this.stake = wager;
    const header = this.children.getByName('chrome-header') as Phaser.GameObjects.Text | null;
    header?.setText(`${this.params.categoryName}  —  WAGER ${formatMoney(wager)}`);
    getAudio(this).reveal();
    this.statusText.setText('');
    this.revealClue(() => this.beginAnswerPhase(this.params.selectorId, 12000));
  }

  // ---- Clue reveal / buzzing ------------------------------------------------------

  private revealClue(done: () => void): void {
    const audio = getAudio(this);
    this.phase = 'reading';
    const clueText = makeClueText(this, GAME_WIDTH / 2, 215, this.params.clue.clue, 34, 1120);
    clueText.setScale(0.6).setAlpha(0);
    audio.reveal();
    this.tweens.add({
      targets: clueText,
      scale: 1,
      alpha: 1,
      duration: 480,
      ease: 'Cubic.easeOut',
    });

    // Multiple-choice options (visible immediately for reading; enabled later).
    const positions: Array<[number, number]> = [
      [GAME_WIDTH / 2 - 305, 408],
      [GAME_WIDTH / 2 + 305, 408],
      [GAME_WIDTH / 2 - 305, 488],
      [GAME_WIDTH / 2 + 305, 488],
    ];
    this.options.forEach((option, i) => {
      const btn = makeTextButton(
        this,
        positions[i][0],
        positions[i][1],
        590,
        70,
        option,
        () => this.humanAnswer(i),
        { fontSize: 22, fill: COLORS.boardBlueDark },
      );
      btn.setEnabled(false);
      btn.container.setAlpha(0);
      this.tweens.add({
        targets: btn.container,
        alpha: 0.85,
        delay: 350 + i * 90,
        duration: 250,
      });
      this.optionButtons.push(btn);
    });

    this.time.delayedCall(1100, done);
  }

  private openBuzzWindow(): void {
    const session = getSession(this);
    this.phase = 'buzz';
    this.answererId = null;
    this.highlightAnswerer(null);
    this.buzzer.open();
    this.buzzOpenedAt = this.time.now;
    this.statusText.setText('BUZZ IN!');
    this.buzzHint.setText('Press SPACE to buzz');
    this.tweens.add({ targets: this.statusText, scale: 1.12, yoyo: true, duration: 140 });
    session.provider.openBuzzers(this.clueContext());
    this.startTimer(THINK_WINDOW_MS, () => this.onBuzzTimeout());
  }

  private reopenBuzzWindow(): void {
    const session = getSession(this);
    const eligible = session.engine.contestants.filter((c) => !this.buzzer.isExcluded(c.id));
    if (eligible.length === 0) {
      this.revealAndClose(null);
      return;
    }
    this.phase = 'buzz';
    this.answererId = null;
    this.highlightAnswerer(null);
    this.buzzer.reopen();
    this.buzzOpenedAt = this.time.now;
    this.statusText.setText('BUZZ IN!');
    this.buzzHint.setText(
      this.buzzer.isExcluded(session.humanId)
        ? 'You are locked out of this clue'
        : 'Press SPACE to buzz',
    );
    session.provider.openBuzzers(this.clueContext());
    this.startTimer(REOPEN_WINDOW_MS, () => this.onBuzzTimeout());
  }

  private clueContext(): ClueContext {
    const session = getSession(this);
    return {
      value: this.stake,
      roundTopValue: session.engine.roundTopValue,
      optionCount: this.options.length,
      correctOptionIndex: this.correctIndex,
      lockedOutIds: session.engine.contestants
        .filter((c) => this.buzzer.isExcluded(c.id))
        .map((c) => c.id),
    };
  }

  private humanBuzz(): void {
    const session = getSession(this);
    if (this.phase !== 'buzz' && this.phase !== 'reading') return;
    if (this.params.isDailyDouble) return;
    const result = this.buzzer.attempt(session.humanId, this.time.now);
    const audio = getAudio(this);
    if (result === 'win') {
      // Relay the local buzz to remote clients (realtime matches only).
      session.provider.sendLocalBuzz?.(Math.max(0, this.time.now - this.buzzOpenedAt));
      this.onBuzzWon(session.humanId);
    } else if (result === 'too-early') {
      // Authentic 250ms early-buzz lockout with a flash.
      audio.lockout();
      this.lockoutFlash.setAlpha(1);
      this.tweens.add({ targets: this.lockoutFlash, alpha: 0, duration: 300 });
      this.buzzHint.setText('Too early! Locked out for 250ms');
    } else if (result === 'locked-out') {
      audio.lockout();
      this.cameras.main.shake(80, 0.002);
    }
  }

  private onOpponentEvent(e: OpponentEvent): void {
    const session = getSession(this);
    switch (e.type) {
      case 'buzz': {
        if (this.phase !== 'buzz') return;
        const result = this.buzzer.attempt(e.opponentId, this.time.now);
        if (result === 'win') this.onBuzzWon(e.opponentId);
        return;
      }
      case 'answer': {
        if (this.phase !== 'answer' || e.opponentId !== this.answererId) return;
        this.resolveAnswer(e.opponentId, e.optionIndex);
        return;
      }
      case 'wager': {
        if (this.phase !== 'wager' || e.kind !== 'daily-double') return;
        const amount = session.engine.clampDailyDoubleWager(e.opponentId, e.amount);
        const name = session.engine.contestant(e.opponentId).name;
        this.statusText.setText(`${name} wagers ${formatMoney(amount)}!`);
        getAudio(this).buzzIn();
        this.time.delayedCall(1000, () => this.acceptWager(amount));
        return;
      }
      case 'leave':
        return;
    }
  }

  private onBuzzWon(id: string): void {
    const session = getSession(this);
    this.stopTimer();
    session.provider.closeBuzzers();
    const audio = getAudio(this);
    audio.buzzIn();
    const contestant = session.engine.contestant(id);
    this.statusText.setText(`${contestant.isHuman ? 'YOU' : contestant.name} buzzed in!`);
    this.buzzHint.setText('');
    this.highlightAnswerer(id);
    this.cameras.main.flash(120, 255, 255, 255);
    this.beginAnswerPhase(id, ANSWER_WINDOW_MS);
  }

  private beginAnswerPhase(id: string, windowMs: number): void {
    const session = getSession(this);
    this.phase = 'answer';
    this.answererId = id;
    this.answerStartedAt = this.time.now;
    this.highlightAnswerer(id);
    const contestant = session.engine.contestant(id);
    if (contestant.isHuman) {
      this.optionButtons.forEach((b) => {
        b.setEnabled(true);
        b.container.setAlpha(1);
      });
      this.statusText.setText('Your response?  Remember — it must be a question!');
      this.startTimer(windowMs, () => this.resolveAnswer(id, null));
    } else {
      this.statusText.setText(`${contestant.name} is thinking…`);
      session.provider.requestAnswer(id, this.clueContext());
      // Safety net in case the provider never answers.
      this.startTimer(windowMs, () => this.resolveAnswer(id, null));
    }
  }

  private humanAnswer(index: number): void {
    const session = getSession(this);
    if (this.phase !== 'answer' || this.answererId !== session.humanId) return;
    // Relay the local answer to remote clients (realtime matches only).
    session.provider.sendLocalAnswer?.(index, Math.max(0, this.time.now - this.answerStartedAt));
    this.resolveAnswer(session.humanId, index);
  }

  // ---- Resolution --------------------------------------------------------------------

  private resolveAnswer(id: string, optionIndex: number | null): void {
    if (this.phase !== 'answer') return;
    this.phase = 'resolve';
    this.stopTimer();
    const session = getSession(this);
    const audio = getAudio(this);
    const contestant = session.engine.contestant(id);
    const correct = optionIndex === this.correctIndex;
    this.optionButtons.forEach((b) => b.setEnabled(false));

    if (optionIndex !== null) {
      const chosen = this.optionButtons[optionIndex];
      chosen.background.setFillStyle(correct ? COLORS.correctGreen : COLORS.wrongRed);
      chosen.container.setAlpha(1);
      this.tweens.add({ targets: chosen.container, scale: 1.06, yoyo: true, duration: 130 });
    }

    if (correct) {
      audio.correct();
      session.engine.applyCorrect(id, this.stake);
      this.refreshMiniScores();
      this.statusText.setText(
        `${contestant.isHuman ? 'YOU are' : contestant.name + ' is'} right for ${formatMoney(this.stake)}!`,
      );
      if (this.stake >= 1000) audio.applause(1.2);
      this.revealAndClose(optionIndex);
      return;
    }

    // Wrong (or ran out of time): deduct and possibly re-open the buzzer.
    audio.wrong();
    this.cameras.main.shake(220, 0.006);
    session.engine.applyWrong(id, this.stake);
    this.buzzer.exclude(id);
    this.refreshMiniScores();
    this.statusText.setText(
      optionIndex === null
        ? `Time! That costs ${contestant.isHuman ? 'you' : contestant.name} ${formatMoney(this.stake)}.`
        : `Ooh, no — ${formatMoney(this.stake)} away from ${contestant.isHuman ? 'you' : contestant.name}.`,
    );

    if (this.params.isDailyDouble) {
      this.revealAndClose(null);
      return;
    }
    this.time.delayedCall(1100, () => this.reopenBuzzWindow());
  }

  private onBuzzTimeout(): void {
    if (this.phase !== 'buzz') return;
    this.phase = 'resolve';
    const session = getSession(this);
    session.provider.closeBuzzers();
    getAudio(this).timesUp();
    this.statusText.setText("Time's up!");
    this.revealAndClose(null);
  }

  /** Shows the correct response + explanation, then returns to the board. */
  private revealAndClose(answeredIndex: number | null): void {
    this.phase = 'done';
    const correctBtn = this.optionButtons[this.correctIndex];
    if (answeredIndex !== this.correctIndex) {
      this.time.delayedCall(700, () => {
        correctBtn.background.setFillStyle(COLORS.correctGreen);
        correctBtn.container.setAlpha(1);
        this.tweens.add({ targets: correctBtn.container, scale: 1.06, yoyo: true, duration: 140 });
      });
    }

    const explanation = this.params.clue.explanation;
    if (explanation) {
      const bar = this.add
        .rectangle(GAME_WIDTH / 2, 330, 1160, 64, COLORS.nearBlack, 0.92)
        .setDepth(30)
        .setAlpha(0);
      const text = this.add
        .text(GAME_WIDTH / 2, 330, explanation, {
          fontFamily: UI_FONT,
          fontSize: '19px',
          color: hexString(COLORS.goldBright),
          align: 'center',
          wordWrap: { width: 1120 },
        })
        .setOrigin(0.5)
        .setDepth(31)
        .setAlpha(0);
      this.tweens.add({ targets: [bar, text], alpha: 1, delay: 900, duration: 300 });
    }

    this.time.delayedCall(3400, () => this.closeScene());
  }

  private closeScene(): void {
    const board = this.scene.get(SCENE_KEYS.board);
    this.scene.stop(SCENE_KEYS.clue);
    this.scene.resume(SCENE_KEYS.board);
    board.events.emit('peril:clue-done', this.params.ref);
  }

  // ---- Timer bar -----------------------------------------------------------------------

  private startTimer(ms: number, onExpire: () => void): void {
    this.stopTimer();
    this.timerBar.setVisible(true).setScale(1, 1).setFillStyle(COLORS.goldBright);
    this.timerTween = this.tweens.add({
      targets: this.timerBar,
      scaleX: 0,
      duration: ms,
      ease: 'Linear',
      onUpdate: () => {
        if (this.timerBar.scaleX < 0.25) this.timerBar.setFillStyle(COLORS.wrongRed);
      },
    });
    this.timerCall = this.time.delayedCall(ms, onExpire);
  }

  private stopTimer(): void {
    this.timerTween?.stop();
    this.timerTween = null;
    this.timerCall?.remove(false);
    this.timerCall = null;
    this.timerBar.setVisible(false);
  }
}
