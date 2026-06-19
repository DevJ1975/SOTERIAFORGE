/**
 * Hazard Hunter — first-person, turn-based OSHA hazard hunt.
 * Orchestrates the three.js world, the Phaser HUD overlay, WebAudio sfx and
 * the pure ShiftEngine. All DOM overlays (intro, reveals, incident reports,
 * scorecard) are Angular templates driven by signals.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  ViewChild,
  computed,
  signal,
  inject,
} from '@angular/core';
import { HazardDef, LevelDef, LEVELS, getLevel } from './hazard-data';
import { ShiftEngine, ShiftSummary } from './shift-engine';
import { HazardWorld, PickResult } from './world';
import { HazardHud } from './hud';
import { SfxEngine } from './audio';

type Phase = 'intro' | 'playing' | 'found' | 'incidents' | 'scorecard';

const FOUND_POINTS = 250;
const MISS_PENALTY = 150;
const UNUSED_BONUS = 100;

@Component({
  selector: 'forge-hazard-hunt',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="hh-stage">
      <div class="hh-layer hh-world" #worldHost></div>
      <div class="hh-layer hh-hud" #hudHost></div>

      @if (phase() === 'playing' && locked()) {
        <div class="hh-crosshair" aria-hidden="true">
          <span class="hh-crosshair-dot"></span>
        </div>
      }

      <div class="hh-topbar">
        <button type="button" class="hh-btn hh-btn--quiet" (click)="toggleMute()">
          {{ muted() ? 'Sound off' : 'Sound on' }}
        </button>
        @if (phase() === 'playing') {
          <button type="button" class="hh-btn hh-btn--quiet" (click)="endShiftEarly()">
            End shift early
          </button>
        }
      </div>

      @if (phase() === 'playing' && !locked()) {
        <button type="button" class="hh-resume" (click)="resume()">
          <span class="hh-resume-title">Inspection paused</span>
          <span class="hh-resume-sub">Click to resume your walk-through</span>
          <span class="hh-resume-keys"
            >WASD move · mouse look · click to inspect · Q ends the shift</span
          >
        </button>
      }

      @if (phase() === 'intro') {
        <div class="hh-overlay">
          <section class="hh-card hh-card--intro">
            <p class="hh-eyebrow">Workplace Safety Training</p>
            <h1 class="hh-title">Hazard Hunter</h1>
            <p class="hh-lede">
              You are the incoming safety officer. Walk the floor, spot the OSHA violations, and log
              them before the shift ends — every hazard you miss becomes a real incident report.
            </p>
            <ul class="hh-rules">
              <li>
                <strong>{{ firstLevel.inspections }} inspections</strong> per shift — wrong calls
                burn them too.
              </li>
              <li>
                Find <strong>at least 70%</strong> of hazards to unlock Shift 2 at the tool shop.
              </li>
              <li>
                <strong>WASD</strong> to move, <strong>mouse</strong> to look,
                <strong>click</strong> to inspect, <strong>Q</strong> to end the shift early.
              </li>
            </ul>
            <div class="hh-actions">
              <button type="button" class="hh-btn hh-btn--cta" (click)="start(1)">
                Clock in — Shift 1
              </button>
              @if (unlocked2()) {
                <button type="button" class="hh-btn hh-btn--secondary" (click)="start(2)">
                  Shift 2 — Tool shop
                </button>
              }
              <button type="button" class="hh-btn hh-btn--secondary" (click)="start(3)">
                Shift 3 — ATL RAMP
              </button>
            </div>
          </section>
        </div>
      }

      @if (phase() === 'found' && foundHazard(); as hz) {
        <div class="hh-overlay">
          <section class="hh-card hh-card--found">
            <p class="hh-eyebrow hh-eyebrow--positive">
              Hazard identified · +{{ foundPoints }} pts
            </p>
            <h2 class="hh-heading">{{ hz.name }}</h2>
            <p class="hh-section-label">What could have happened</p>
            <p class="hh-narrative">{{ hz.incident }}</p>
            <div class="hh-reg hh-reg--found">
              <span class="hh-reg-ref">{{ hz.oshaRef }}</span>
              <span class="hh-reg-title">{{ hz.oshaTitle }}</span>
            </div>
            <div class="hh-actions">
              <button type="button" class="hh-btn hh-btn--cta" (click)="continueAfterFound()">
                Log it &amp; keep inspecting
              </button>
            </div>
          </section>
        </div>
      }

      @if (phase() === 'incidents' && currentIncident(); as hz) {
        <div class="hh-overlay hh-overlay--incident">
          <section class="hh-card hh-card--incident">
            <header class="hh-incident-head">
              <span class="hh-incident-stamp">Missed hazard</span>
              <p class="hh-eyebrow hh-eyebrow--negative">
                Incident report {{ incidentIdx() + 1 }} / {{ missedHazards().length }} · −{{
                  missPenalty
                }}
                pts
              </p>
            </header>
            <h2 class="hh-heading">{{ hz.name }}</h2>
            <p class="hh-section-label">Incident narrative</p>
            <p class="hh-narrative">{{ hz.incident }}</p>
            <div class="hh-reg hh-reg--incident">
              <span class="hh-reg-ref">{{ hz.oshaRef }}</span>
              <span class="hh-reg-title">{{ hz.oshaTitle }}</span>
            </div>
            <div class="hh-actions">
              <button type="button" class="hh-btn hh-btn--negative" (click)="nextIncident()">
                {{
                  incidentIdx() + 1 < missedHazards().length
                    ? 'Next report'
                    : 'View shift scorecard'
                }}
              </button>
            </div>
          </section>
        </div>
      }

      @if (phase() === 'scorecard' && summary(); as s) {
        <div class="hh-overlay">
          <section class="hh-card hh-card--score">
            <p class="hh-eyebrow">{{ levelName() }} — shift complete</p>
            <div class="hh-grade" [class]="'hh-grade--' + s.grade">
              {{ s.grade }}
            </div>
            <h2 class="hh-heading hh-heading--center">
              {{ s.foundCount }} / {{ s.total }} hazards found
            </h2>
            <dl class="hh-breakdown">
              <div class="hh-row">
                <dt>Hazards identified ({{ s.foundCount }})</dt>
                <dd class="hh-pos">+{{ s.breakdown.foundPoints }}</dd>
              </div>
              <div class="hh-row">
                <dt>Unused inspections ({{ s.inspectionsLeft }})</dt>
                <dd class="hh-pos">+{{ s.breakdown.unusedBonus }}</dd>
              </div>
              <div class="hh-row">
                <dt>Incidents on your watch ({{ s.missed.length }})</dt>
                <dd class="hh-neg">−{{ s.breakdown.missPenalty }}</dd>
              </div>
              <div class="hh-row hh-row--total">
                <dt>Shift score</dt>
                <dd>{{ s.score }}</dd>
              </div>
              <div class="hh-row hh-row--subtle">
                <dt>Career total</dt>
                <dd>{{ totalScore() }}</dd>
              </div>
            </dl>
            @if (s.levelId === 1 && !s.unlockedNext) {
              <p class="hh-unlock-note">
                Find at least 70% of hazards to unlock Shift 2 — Tool shop.
              </p>
            }
            @if (s.levelId === 1 && s.unlockedNext) {
              <p class="hh-unlock-note hh-unlock-note--positive">
                Shift 2 unlocked — the tool shop needs you.
              </p>
            }
            <div class="hh-actions">
              <button type="button" class="hh-btn hh-btn--secondary" (click)="start(s.levelId)">
                Retry this shift
              </button>
              @if (s.levelId === 1 && s.unlockedNext) {
                <button type="button" class="hh-btn hh-btn--cta" (click)="start(2)">
                  Start Shift 2 — Tool shop
                </button>
              }
              @if (s.levelId === 2) {
                <button type="button" class="hh-btn hh-btn--cta" (click)="backToIntro()">
                  Back to the locker room
                </button>
              }
            </div>
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 480px;
      font-family: var(--forge-font, adobe-clean, 'Source Sans Pro', -apple-system, sans-serif);
      color: var(--forge-text, #2c2c2c);
    }
    .hh-stage {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 480px;
      overflow: hidden;
      background: #1a1d21;
      border-radius: var(--forge-radius, 8px);
      user-select: none;
    }
    .hh-layer {
      position: absolute;
      inset: 0;
    }
    .hh-hud {
      pointer-events: none;
      z-index: 2;
    }
    .hh-world {
      z-index: 1;
    }

    .hh-crosshair {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 3;
      pointer-events: none;
    }
    .hh-crosshair-dot {
      display: block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #ffffff;
      box-shadow:
        0 0 0 2px rgba(0, 0, 0, 0.45),
        0 0 12px rgba(255, 255, 255, 0.7);
    }

    .hh-topbar {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 8px;
      z-index: 6;
    }

    .hh-btn {
      height: 32px;
      padding: 0 18px;
      border-radius: 16px;
      border: 2px solid transparent;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      transition:
        background 130ms ease,
        border-color 130ms ease,
        transform 130ms ease;
      white-space: nowrap;
    }
    .hh-btn:active {
      transform: scale(0.97);
    }
    .hh-btn--cta {
      background: var(--forge-accent, #1473e6);
      color: #ffffff;
    }
    .hh-btn--cta:hover {
      background: var(--forge-accent-hover, #0d66d0);
    }
    .hh-btn--secondary {
      background: var(--forge-surface, #ffffff);
      border-color: var(--forge-border, #e1e1e1);
      color: var(--forge-text, #2c2c2c);
    }
    .hh-btn--secondary:hover {
      background: var(--forge-surface-dim, #f5f5f5);
    }
    .hh-btn--negative {
      background: var(--forge-negative, #d7373f);
      color: #ffffff;
    }
    .hh-btn--negative:hover {
      filter: brightness(0.92);
    }
    .hh-btn--quiet {
      background: rgba(20, 22, 26, 0.66);
      color: #e8eaee;
      border-color: rgba(255, 255, 255, 0.22);
      backdrop-filter: blur(4px);
    }
    .hh-btn--quiet:hover {
      background: rgba(20, 22, 26, 0.85);
    }

    .hh-overlay {
      position: absolute;
      inset: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(12, 14, 17, 0.62);
      backdrop-filter: blur(3px);
      animation: hh-fade 220ms ease both;
    }
    .hh-overlay--incident {
      background: radial-gradient(
          ellipse at center,
          rgba(12, 14, 17, 0.55) 55%,
          rgba(215, 55, 63, 0.4) 100%
        ),
        rgba(12, 14, 17, 0.4);
    }

    .hh-card {
      width: min(560px, 100%);
      max-height: 92%;
      overflow-y: auto;
      background: var(--forge-surface, #ffffff);
      border: 1px solid var(--forge-border, #e1e1e1);
      border-radius: var(--forge-radius, 8px);
      padding: 28px 32px;
      box-shadow: 0 14px 44px rgba(0, 0, 0, 0.45);
      animation: hh-pop 260ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
    }
    .hh-card--found {
      border-top: 4px solid var(--forge-positive, #268e6c);
    }
    .hh-card--incident {
      border-top: 4px solid var(--forge-negative, #d7373f);
      background: repeating-linear-gradient(
          -45deg,
          transparent 0 22px,
          rgba(215, 55, 63, 0.035) 22px 44px
        ),
        var(--forge-surface, #ffffff);
    }
    .hh-card--score {
      text-align: center;
    }

    .hh-eyebrow {
      margin: 0 0 6px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--forge-text-subtle, #6e6e6e);
    }
    .hh-eyebrow--positive {
      color: var(--forge-positive, #268e6c);
    }
    .hh-eyebrow--negative {
      color: var(--forge-negative, #d7373f);
    }
    .hh-title {
      margin: 0 0 12px;
      font-size: 40px;
      font-weight: 800;
      letter-spacing: -0.01em;
      color: var(--forge-text, #2c2c2c);
    }
    .hh-heading {
      margin: 0 0 14px;
      font-size: 24px;
      font-weight: 700;
      color: var(--forge-text, #2c2c2c);
    }
    .hh-heading--center {
      text-align: center;
    }
    .hh-lede {
      margin: 0 0 16px;
      font-size: 16px;
      line-height: 1.55;
      color: var(--forge-text, #2c2c2c);
    }
    .hh-rules {
      margin: 0 0 22px;
      padding-left: 20px;
      font-size: 14px;
      line-height: 1.7;
      color: var(--forge-text-subtle, #6e6e6e);
    }
    .hh-rules strong {
      color: var(--forge-text, #2c2c2c);
    }
    .hh-section-label {
      margin: 0 0 4px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--forge-text-subtle, #6e6e6e);
    }
    .hh-narrative {
      margin: 0 0 18px;
      font-size: 15px;
      line-height: 1.6;
      color: var(--forge-text, #2c2c2c);
    }

    .hh-reg {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 12px 16px;
      margin-bottom: 22px;
      border-radius: var(--forge-radius, 8px);
      background: var(--forge-surface-dim, #f5f5f5);
      border-left: 4px solid var(--forge-notice, #da7b11);
    }
    .hh-reg--found {
      border-left-color: var(--forge-positive, #268e6c);
    }
    .hh-reg--incident {
      border-left-color: var(--forge-negative, #d7373f);
    }
    .hh-reg-ref {
      font-size: 15px;
      font-weight: 700;
      color: var(--forge-text, #2c2c2c);
    }
    .hh-reg-title {
      font-size: 13px;
      color: var(--forge-text-subtle, #6e6e6e);
    }

    .hh-incident-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    .hh-incident-stamp {
      order: 2;
      padding: 4px 10px;
      border: 2px solid var(--forge-negative, #d7373f);
      border-radius: 4px;
      color: var(--forge-negative, #d7373f);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      transform: rotate(4deg);
    }

    .hh-grade {
      width: 86px;
      height: 86px;
      margin: 6px auto 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-size: 44px;
      font-weight: 800;
      color: #ffffff;
      animation: hh-pop 420ms cubic-bezier(0.2, 1.6, 0.4, 1) 120ms both;
    }
    .hh-grade--A,
    .hh-grade--B {
      background: var(--forge-positive, #268e6c);
    }
    .hh-grade--C {
      background: var(--forge-notice, #da7b11);
    }
    .hh-grade--D,
    .hh-grade--F {
      background: var(--forge-negative, #d7373f);
    }

    .hh-breakdown {
      margin: 0 0 18px;
      text-align: left;
    }
    .hh-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 2px;
      font-size: 14px;
      border-bottom: 1px solid var(--forge-border, #e1e1e1);
    }
    .hh-row dt {
      color: var(--forge-text-subtle, #6e6e6e);
    }
    .hh-row dd {
      margin: 0;
      font-weight: 700;
    }
    .hh-row--total {
      font-size: 16px;
      border-bottom: none;
    }
    .hh-row--total dt {
      color: var(--forge-text, #2c2c2c);
      font-weight: 700;
    }
    .hh-row--subtle {
      border-bottom: none;
      font-size: 13px;
    }
    .hh-pos {
      color: var(--forge-positive, #268e6c);
    }
    .hh-neg {
      color: var(--forge-negative, #d7373f);
    }
    .hh-unlock-note {
      margin: 0 0 18px;
      font-size: 13px;
      color: var(--forge-notice, #da7b11);
      font-weight: 600;
    }
    .hh-unlock-note--positive {
      color: var(--forge-positive, #268e6c);
    }

    .hh-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .hh-card--intro .hh-actions,
    .hh-card--found .hh-actions,
    .hh-card--incident .hh-actions {
      justify-content: flex-start;
    }

    .hh-resume {
      position: absolute;
      inset: 0;
      z-index: 4;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: rgba(12, 14, 17, 0.55);
      border: none;
      cursor: pointer;
      font-family: inherit;
      color: #ffffff;
      animation: hh-fade 200ms ease both;
    }
    .hh-resume-title {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .hh-resume-sub {
      font-size: 15px;
      font-weight: 600;
      color: #ffd866;
    }
    .hh-resume-keys {
      margin-top: 10px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.65);
    }

    @keyframes hh-fade {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes hh-pop {
      from {
        opacity: 0;
        transform: scale(0.82) translateY(14px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
  `,
})
export class HazardHuntComponent implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  @ViewChild('worldHost', { static: true })
  private worldHost!: ElementRef<HTMLDivElement>;
  @ViewChild('hudHost', { static: true })
  private hudHost!: ElementRef<HTMLDivElement>;

  /**
   * Optional explicit starting level (1, 2, or 3). When omitted, the level is
   * read from the `?level=` route query parameter; an absent or invalid value
   * leaves the player on the intro/locker-room screen (no auto-start).
   */
  @Input() startLevel?: number;

  readonly firstLevel = LEVELS[0];
  readonly foundPoints = FOUND_POINTS;
  readonly missPenalty = MISS_PENALTY;

  readonly phase = signal<Phase>('intro');
  readonly locked = signal(false);
  readonly muted = signal(false);
  readonly unlocked2 = signal(false);
  readonly foundHazard = signal<HazardDef | null>(null);
  readonly summary = signal<ShiftSummary | null>(null);
  readonly incidentIdx = signal(0);

  readonly missedHazards = computed<HazardDef[]>(() => {
    const s = this.summary();
    if (!s) return [];
    const level = getLevel(s.levelId);
    if (!level) return [];
    const byId = new Map(level.hazards.map((h) => [h.id, h]));
    return s.missed.map((id) => byId.get(id)).filter((h): h is HazardDef => !!h);
  });
  readonly currentIncident = computed<HazardDef | null>(
    () => this.missedHazards()[this.incidentIdx()] ?? null,
  );
  readonly levelName = computed(() => {
    const s = this.summary();
    return s ? (getLevel(s.levelId)?.name ?? '') : '';
  });

  private readonly levelScores = signal<Record<number, number>>({});
  readonly totalScore = computed(() =>
    Object.values(this.levelScores()).reduce((a, b) => a + b, 0),
  );

  private world: HazardWorld | null = null;
  private hud: HazardHud | null = null;
  private sfx: SfxEngine | null = null;
  private engine: ShiftEngine | null = null;
  private level: LevelDef | null = null;
  private pendingShiftEnd = false;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyQ' && this.phase() === 'playing') {
      this.zone.run(() => this.endShiftEarly());
    } else if (e.code === 'KeyM') {
      this.zone.run(() => this.toggleMute());
    }
  };

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.sfx = new SfxEngine();
      this.world = new HazardWorld(this.worldHost.nativeElement, {
        onInspect: (hit) => this.zone.run(() => this.handleInspect(hit)),
        onLockChange: (locked) => this.zone.run(() => this.locked.set(locked)),
      });
      this.hud = new HazardHud(this.hudHost.nativeElement);
      window.addEventListener('keydown', this.onKeyDown);
    });

    // Deep-link support: boot directly into a requested shift (e.g. the ATL
    // RAMP flagship via `?level=3`). Falls back to the intro for absent/invalid
    // values, and unlocks Shift 2 in the intro when jumping straight to it.
    const requested = this.resolveRequestedLevel();
    if (requested !== null) {
      if (requested >= 2) this.unlocked2.set(true);
      this.start(requested);
    }
  }

  /**
   * Resolve the requested starting level from the `@Input() startLevel` or the
   * `?level=` query param. Returns a valid level id, or `null` when none is
   * supplied or the value is invalid.
   */
  private resolveRequestedLevel(): number | null {
    const raw = this.startLevel ?? this.readLevelFromUrl();
    if (raw === null || raw === undefined) return null;
    const id = Math.floor(Number(raw));
    return Number.isFinite(id) && getLevel(id) ? id : null;
  }

  /** Reads the `?level=` query param off the current URL, if present. */
  private readLevelFromUrl(): string | null {
    if (typeof window === 'undefined' || !window.location) return null;
    try {
      return new URLSearchParams(window.location.search).get('level');
    } catch {
      return null;
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.world?.dispose();
    this.world = null;
    this.hud?.destroy();
    this.hud = null;
    this.sfx?.dispose();
    this.sfx = null;
  }

  // -- player actions ---------------------------------------------------------

  start(levelId: number): void {
    const level = getLevel(levelId);
    if (!level || !this.world || !this.hud) return;
    this.sfx?.resume();
    this.sfx?.click();

    this.level = level;
    this.engine = new ShiftEngine({
      levelId: level.id,
      hazardIds: level.hazards.map((h) => h.id),
      inspections: level.inspections,
      basePoints: FOUND_POINTS,
      unusedBonus: UNUSED_BONUS,
      missPenalty: MISS_PENALTY,
    });
    this.summary.set(null);
    this.foundHazard.set(null);
    this.incidentIdx.set(0);
    this.pendingShiftEnd = false;

    this.zone.runOutsideAngular(() => {
      this.world?.loadLevel(level);
      this.world?.setActive(true);
      this.world?.requestLock();
      this.hud?.setScore(this.otherLevelsScore(level.id), false);
      this.hud?.setFound(0, level.hazards.length);
      this.hud?.setInspections(level.inspections, level.inspections);
      this.hud?.showBanner(level.shiftLabel, 'Find the violations. Log them all.');
    });
    this.phase.set('playing');
  }

  resume(): void {
    this.sfx?.resume();
    this.world?.requestLock();
  }

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    this.sfx?.setMuted(next);
    if (!next) this.sfx?.click();
  }

  endShiftEarly(): void {
    if (this.phase() !== 'playing') return;
    this.sfx?.click();
    this.beginShiftEnd();
  }

  continueAfterFound(): void {
    this.foundHazard.set(null);
    this.sfx?.click();
    if (this.pendingShiftEnd) {
      this.beginShiftEnd();
      return;
    }
    this.phase.set('playing');
    this.world?.setActive(true);
    this.world?.requestLock();
  }

  nextIncident(): void {
    this.sfx?.click();
    const next = this.incidentIdx() + 1;
    if (next >= this.missedHazards().length) {
      this.showScorecard();
      return;
    }
    this.incidentIdx.set(next);
    this.sfx?.alarm();
    this.hud?.incidentPulse();
  }

  backToIntro(): void {
    this.sfx?.click();
    this.summary.set(null);
    this.phase.set('intro');
  }

  // -- world events -------------------------------------------------------------

  private handleInspect(hit: PickResult): void {
    if (this.phase() !== 'playing' || !this.engine || !this.level) return;
    this.sfx?.resume();

    if (hit.kind === 'nothing') {
      this.hud?.popup('Nothing to inspect', '#cfd6e4');
      return;
    }
    if (hit.kind === 'too-far') {
      this.hud?.popup('Move closer to inspect', '#cfd6e4');
      return;
    }

    const result = this.engine.inspect(hit.kind === 'hazard' ? (hit.hazardId ?? null) : null);

    switch (result.outcome) {
      case 'duplicate':
        this.hud?.popup('Already logged', '#cfd6e4');
        return;
      case 'no-inspections':
      case 'shift-over':
        return;
      case 'found': {
        const hazard = this.level.hazards.find((h) => h.id === result.hazardId);
        this.sfx?.success();
        if (result.hazardId) this.world?.markFound(result.hazardId);
        this.hud?.popup('+' + FOUND_POINTS + '!');
        this.hud?.setScore(this.otherLevelsScore(this.level.id) + result.score);
        this.hud?.setFound(result.foundCount, result.total);
        this.hud?.setInspections(result.inspectionsLeft, this.level.inspections);
        this.pendingShiftEnd = result.shiftEnded;
        this.foundHazard.set(hazard ?? null);
        this.phase.set('found');
        this.world?.setActive(false);
        this.world?.exitLock();
        return;
      }
      case 'wrong': {
        this.sfx?.error();
        this.hud?.popup(
          (hit.propName ? 'Compliant: ' + hit.propName : 'Not a violation') + ' · −1 inspection',
          '#ff9d9d',
        );
        this.hud?.setInspections(result.inspectionsLeft, this.level.inspections);
        if (result.shiftEnded) this.beginShiftEnd();
        return;
      }
    }
  }

  // -- shift end flow ----------------------------------------------------------

  private beginShiftEnd(): void {
    if (!this.engine) return;
    this.pendingShiftEnd = false;
    const summary = this.engine.endShift();
    this.summary.set(summary);
    this.world?.setActive(false);
    this.world?.exitLock();

    if (summary.missed.length > 0) {
      this.incidentIdx.set(0);
      this.phase.set('incidents');
      this.sfx?.alarm();
      this.hud?.incidentPulse();
    } else {
      this.showScorecard();
    }
  }

  private showScorecard(): void {
    const summary = this.summary();
    if (!summary) return;
    this.levelScores.update((scores) => ({
      ...scores,
      [summary.levelId]: summary.score,
    }));
    this.hud?.setScore(this.totalScore());
    if (summary.levelId === 1 && summary.unlockedNext) {
      this.unlocked2.set(true);
    }
    if (summary.unlockedNext) {
      this.sfx?.fanfare();
      this.hud?.confetti();
    }
    this.phase.set('scorecard');
  }

  private otherLevelsScore(levelId: number): number {
    return Object.entries(this.levelScores()).reduce(
      (sum, [id, score]) => (Number(id) === levelId ? sum : sum + score),
      0,
    );
  }
}
