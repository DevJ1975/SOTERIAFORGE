/**
 * PERIL! game board — 6 categories x 5 clues, podiums, category intro
 * animation, control passing, tile zoom into the clue scene.
 */

import Phaser from 'phaser';
import { CellRef, formatMoney } from '../game-rules';
import {
  COLORS,
  GAME_HEIGHT,
  GAME_WIDTH,
  getAudio,
  getSession,
  hexString,
  makePodium,
  PodiumDisplay,
  SCENE_KEYS,
  UI_FONT,
  VALUE_FONT,
} from './theme';
import { ClueSceneData } from './clue-scene';

const MARGIN_X = 42;
const TILE_W = 196;
const TILE_H = 80;
const GAP_X = 4;
const GAP_Y = 5;
const HEADER_H = 62;
const BOARD_TOP = 20;

export interface BoardSceneData {
  round: 'round1' | 'round2';
  skipIntro?: boolean;
}

interface TileSprite {
  rect: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  ref: CellRef;
}

export class BoardScene extends Phaser.Scene {
  private tiles: TileSprite[] = [];
  private podiums = new Map<string, PodiumDisplay>();
  private controlBanner!: Phaser.GameObjects.Text;
  private selecting = false;

  constructor() {
    super(SCENE_KEYS.board);
  }

  create(data: BoardSceneData): void {
    const session = getSession(this);
    const audio = getAudio(this);
    this.tiles = [];
    this.podiums.clear();
    this.selecting = false;

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.nearBlack);

    this.events.on('peril:clue-done', this.onClueDone, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('peril:clue-done', this.onClueDone, this);
    });

    // Podiums.
    const xs = [250, GAME_WIDTH / 2, GAME_WIDTH - 250];
    session.engine.contestants.forEach((c, i) => {
      const podium = makePodium(this, xs[i], 632, c, session.avatars.get(c.id) ?? null, 280, 132);
      this.podiums.set(c.id, podium);
    });

    this.controlBanner = this.add
      .text(GAME_WIDTH / 2, 532, '', {
        fontFamily: UI_FONT,
        fontSize: '22px',
        color: hexString(COLORS.goldBright),
      })
      .setOrigin(0.5);

    this.buildBoard();

    if (data.skipIntro) {
      this.showBoardInstant();
      this.beginSelection();
    } else {
      this.playRoundIntro(data.round, () => {
        audio.applause(1.1);
        this.beginSelection();
      });
    }
  }

  // ---- Board construction -----------------------------------------------------

  private tileCenter(categoryIndex: number, clueIndex: number): { x: number; y: number } {
    const x = MARGIN_X + categoryIndex * (TILE_W + GAP_X) + TILE_W / 2;
    const y = BOARD_TOP + HEADER_H + GAP_Y + clueIndex * (TILE_H + GAP_Y) + TILE_H / 2;
    return { x, y };
  }

  private buildBoard(): void {
    const session = getSession(this);
    const categories = session.engine.categoriesForRound(session.engine.round);

    // Category headers.
    categories.forEach((cat, i) => {
      const x = MARGIN_X + i * (TILE_W + GAP_X) + TILE_W / 2;
      const y = BOARD_TOP + HEADER_H / 2;
      this.add
        .rectangle(x, y, TILE_W, HEADER_H, COLORS.boardBlue)
        .setStrokeStyle(1, COLORS.nearBlack)
        .setName(`header-rect-${i}`);
      this.add
        .text(x, y, cat.name, {
          fontFamily: UI_FONT,
          fontSize: '17px',
          fontStyle: 'bold',
          color: '#ffffff',
          align: 'center',
          wordWrap: { width: TILE_W - 12 },
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setName(`header-text-${i}`);
    });

    // Value tiles.
    for (let categoryIndex = 0; categoryIndex < 6; categoryIndex++) {
      for (let clueIndex = 0; clueIndex < 5; clueIndex++) {
        const ref: CellRef = { categoryIndex, clueIndex };
        const cell = session.engine.getCell(ref);
        const { x, y } = this.tileCenter(categoryIndex, clueIndex);
        const rect = this.add
          .rectangle(x, y, TILE_W, TILE_H, COLORS.boardBlue)
          .setStrokeStyle(1, COLORS.nearBlack);
        const text = this.add
          .text(x, y, `$${cell.value}`, {
            fontFamily: VALUE_FONT,
            fontSize: '44px',
            color: hexString(COLORS.gold),
            stroke: '#000000',
            strokeThickness: 3,
          })
          .setOrigin(0.5);
        if (cell.used) {
          text.setVisible(false);
          rect.setFillStyle(COLORS.stageBlue);
        }
        rect.setScale(0);
        text.setScale(0);
        this.tiles.push({ rect, text, ref });
      }
    }
  }

  private showBoardInstant(): void {
    this.tiles.forEach((t) => {
      t.rect.setScale(1);
      t.text.setScale(1);
    });
    for (let i = 0; i < 6; i++) {
      (this.children.getByName(`header-text-${i}`) as Phaser.GameObjects.Text | null)?.setAlpha(1);
    }
  }

  private playRoundIntro(round: 'round1' | 'round2', done: () => void): void {
    const audio = getAudio(this);
    const label = round === 'round1' ? 'PERIL!' : 'DOUBLE PERIL!';
    const splash = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, label, {
        fontFamily: VALUE_FONT,
        fontSize: '140px',
        color: '#ffffff',
        stroke: hexString(COLORS.gold),
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setScale(0.2)
      .setAlpha(0)
      .setDepth(50);
    audio.dailyDouble();
    this.tweens.add({
      targets: splash,
      scale: 1,
      alpha: 1,
      duration: 600,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: splash,
          alpha: 0,
          scale: 1.4,
          delay: 700,
          duration: 350,
          onComplete: () => {
            splash.destroy();
            this.fillBoard(done);
          },
        });
      },
    });
  }

  /** Classic random-order board fill with blips, then headers one by one. */
  private fillBoard(done: () => void): void {
    const audio = getAudio(this);
    const order = Phaser.Utils.Array.Shuffle([...this.tiles]);
    order.forEach((tile, i) => {
      this.time.delayedCall(i * 45, () => {
        audio.blip(i % 6);
        this.tweens.add({
          targets: [tile.rect, tile.text],
          scale: 1,
          duration: 160,
          ease: 'Back.easeOut',
        });
      });
    });
    const headersAt = order.length * 45 + 250;
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(headersAt + i * 280, () => {
        audio.blip(6 + i);
        const text = this.children.getByName(`header-text-${i}`) as Phaser.GameObjects.Text | null;
        if (text) this.tweens.add({ targets: text, alpha: 1, duration: 240 });
      });
    }
    this.time.delayedCall(headersAt + 6 * 280 + 300, done);
  }

  // ---- Selection ----------------------------------------------------------------

  private beginSelection(): void {
    const session = getSession(this);
    if (session.engine.isRoundComplete()) {
      this.advanceRound();
      return;
    }
    this.selecting = true;
    const controller = session.engine.contestant(session.engine.controlId);
    this.podiums.forEach((p, id) => p.setHighlight(id === controller.id, COLORS.goldBright));

    if (controller.isHuman) {
      this.controlBanner.setText('YOU control the board — pick a clue!');
      this.enableTileInput();
    } else {
      this.controlBanner.setText(`${controller.name} is choosing…`);
      const available = session.engine.availableCells();
      const ref = available[Math.floor(Math.random() * available.length)];
      this.time.delayedCall(1500, () => {
        if (!this.selecting) return;
        const cat = session.engine.categoriesForRound(session.engine.round)[ref.categoryIndex];
        const value = session.engine.getCell(ref).value;
        this.controlBanner.setText(
          `${controller.name} selects ${cat.name} for ${formatMoney(value)}`,
        );
        this.time.delayedCall(900, () => this.selectTile(ref));
      });
    }
  }

  private enableTileInput(): void {
    const session = getSession(this);
    this.tiles.forEach((tile) => {
      if (session.engine.getCell(tile.ref).used) return;
      tile.rect.setInteractive({ useHandCursor: true });
      tile.rect.on('pointerover', () => tile.rect.setFillStyle(COLORS.boardBlueDark));
      tile.rect.on('pointerout', () => tile.rect.setFillStyle(COLORS.boardBlue));
      tile.rect.on('pointerdown', () => {
        if (!this.selecting) return;
        getAudio(this).click();
        this.selectTile(tile.ref);
      });
    });
  }

  private disableTileInput(): void {
    this.tiles.forEach((tile) => {
      tile.rect.removeAllListeners();
      tile.rect.disableInteractive();
      tile.rect.setFillStyle(
        getSession(this).engine.getCell(tile.ref).used ? COLORS.stageBlue : COLORS.boardBlue,
      );
    });
  }

  private selectTile(ref: CellRef): void {
    const session = getSession(this);
    if (!this.selecting || !session.engine.isCellAvailable(ref)) return;
    this.selecting = false;
    this.disableTileInput();

    const tile = this.tiles.find(
      (t) => t.ref.categoryIndex === ref.categoryIndex && t.ref.clueIndex === ref.clueIndex,
    );
    if (!tile) return;

    const cell = session.engine.getCell(ref);
    const category = session.engine.categoriesForRound(session.engine.round)[ref.categoryIndex];
    const clue = session.engine.getClue(ref);

    // Tile flash + zoom-to-fullscreen reveal.
    getAudio(this).reveal();
    tile.text.setVisible(false);
    const zoom = this.add
      .rectangle(tile.rect.x, tile.rect.y, TILE_W, TILE_H, COLORS.boardBlue)
      .setDepth(80);
    this.tweens.add({
      targets: zoom,
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      scaleX: GAME_WIDTH / TILE_W,
      scaleY: GAME_HEIGHT / TILE_H,
      duration: 380,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        const payload: ClueSceneData = {
          ref,
          clue,
          categoryName: category.name,
          value: cell.value,
          isDailyDouble: cell.isDailyDouble,
          selectorId: session.engine.controlId,
        };
        this.scene.pause(SCENE_KEYS.board);
        this.scene.launch(SCENE_KEYS.clue, payload);
        this.time.delayedCall(150, () => zoom.destroy());
      },
    });
  }

  // ---- Resolution -----------------------------------------------------------------

  private onClueDone(ref: CellRef): void {
    const session = getSession(this);
    session.engine.markUsed(ref);

    // Refresh tile + podium scores with odometer rolls.
    const tile = this.tiles.find(
      (t) => t.ref.categoryIndex === ref.categoryIndex && t.ref.clueIndex === ref.clueIndex,
    );
    if (tile) {
      tile.text.setVisible(false);
      tile.rect.setFillStyle(COLORS.stageBlue);
    }
    session.engine.contestants.forEach((c) => {
      this.podiums.get(c.id)?.rollScoreTo(this, c.score);
    });

    this.time.delayedCall(420, () => {
      if (session.engine.isRoundComplete()) this.advanceRound();
      else this.beginSelection();
    });
  }

  private advanceRound(): void {
    const session = getSession(this);
    if (session.engine.round === 'round1') {
      session.engine.startRound('round2');
      this.scene.restart({ round: 'round2' } satisfies BoardSceneData);
    } else {
      this.scene.start(SCENE_KEYS.final);
    }
  }
}
