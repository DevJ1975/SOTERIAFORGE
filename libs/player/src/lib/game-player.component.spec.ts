import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import { GameRepository } from '@assurance/data-access';
import { EnrollmentService } from '@assurance/lms-core';
import { XapiClient } from '@assurance/standards';
import { GamePlayerComponent } from './game-player.component';
import { PlayerProgressService } from './player-progress.service';
import type { Game } from '@assurance/shared';

const testEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  firebase: {
    apiKey: 'x',
    authDomain: 'x',
    projectId: 'x',
    storageBucket: 'x',
    messagingSenderId: 'x',
    appId: 'x',
  },
};

const mockGame: Game = {
  id: 'game-1',
  tenantId: 'tenant-1',
  title: 'Safety Card Flip',
  engine: 'phaser',
  config: {
    kind: 'flip_reveal',
    title: 'Safety Card Flip',
    cards: [{ id: 'c1', label: 'PPE', revealText: 'Always wear PPE.' }],
  },
  assetRefs: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockGameRepository: Partial<GameRepository> = {
  getById: jest.fn().mockResolvedValue(mockGame),
};

const mockPlayerProgressService: Partial<PlayerProgressService> = {
  recordCompletion: jest.fn().mockResolvedValue(undefined),
};

const mockEnrollmentService: Partial<EnrollmentService> = {
  markModuleComplete: jest.fn().mockResolvedValue(undefined),
};

const mockXapiClient: Partial<XapiClient> = {
  buildStatement: jest.fn().mockReturnValue({ actor: {}, verb: {}, object: {} }),
  send: jest.fn().mockResolvedValue(undefined),
};

describe('GamePlayerComponent', () => {
  let fixture: ComponentFixture<GamePlayerComponent>;

  beforeEach(async () => {
    jest.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [GamePlayerComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: GameRepository, useValue: mockGameRepository },
        { provide: PlayerProgressService, useValue: mockPlayerProgressService },
        { provide: EnrollmentService, useValue: mockEnrollmentService },
        { provide: XapiClient, useValue: mockXapiClient },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GamePlayerComponent);
    fixture.componentRef.setInput('gameId', 'game-1');
    fixture.componentRef.setInput('courseId', 'course-1');
    fixture.componentRef.setInput('moduleId', 'mod-1');
    fixture.componentRef.setInput('tenantId', 'tenant-1');
    fixture.componentRef.setInput('uid', 'user-1');
  });

  it('creates the component', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows loading state initially', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toBeTruthy();
  });

  it('renders assurance-phaser-host after a phaser game loads', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    // assurance-phaser-host is rendered; PhaserHostComponent is @defer-safe in tests
    // because isPlatformBrowser returns false in jsdom — no actual Phaser loaded.
    expect(el.querySelector('assurance-phaser-host')).not.toBeNull();
  });

  it('shows error when game is not found', async () => {
    (mockGameRepository.getById as jest.Mock).mockResolvedValueOnce(null);

    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Game not found');
  });

  it('renders assurance-rive-character for rive engine game', async () => {
    const riveGame: Game = {
      ...mockGame,
      engine: 'rive',
      riveAssetRef: '/assets/character.riv',
    };
    (mockGameRepository.getById as jest.Mock).mockResolvedValueOnce(riveGame);

    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('assurance-rive-character')).not.toBeNull();
  });
});
