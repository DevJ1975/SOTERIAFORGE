import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment, TenantService } from '@forge/auth';
import { GameRepository } from '@forge/data-access';
import { GameEditorComponent } from './game-editor.component';

const testEnv: ForgeEnvironment = {
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

const sampleFlipGame = {
  id: 'game-1',
  tenantId: 'acme',
  title: 'Flip Game',
  engine: 'phaser' as const,
  config: {
    kind: 'flip_reveal',
    title: 'Flip Game',
    cards: [{ id: 'c1', label: 'Card 1', revealText: 'Reveal 1' }],
  },
  assetRefs: [],
  createdAt: new Date().toISOString(),
};

const sampleMatchGame = {
  id: 'game-2',
  tenantId: 'acme',
  title: 'Match Game',
  engine: 'phaser' as const,
  config: {
    kind: 'match_pairs',
    title: 'Match Game',
    pairs: [
      {
        id: 'p1',
        question: { id: 'q1', label: 'Q1' },
        answer: { id: 'a1', label: 'A1' },
      },
      {
        id: 'p2',
        question: { id: 'q2', label: 'Q2' },
        answer: { id: 'a2', label: 'A2' },
      },
    ],
  },
  assetRefs: [],
  createdAt: new Date().toISOString(),
};

describe('GameEditorComponent — flip_reveal', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameEditorComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        {
          provide: GameRepository,
          useValue: {
            getById: async () => sampleFlipGame,
            set: jest.fn(),
          },
        },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(GameEditorComponent);
    fixture.componentRef.setInput('id', 'game-1');
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the back link to games', async () => {
    const fixture = TestBed.createComponent(GameEditorComponent);
    fixture.componentRef.setInput('id', 'game-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Back to Games');
  });

  it('renders the game title after loading', async () => {
    const fixture = TestBed.createComponent(GameEditorComponent);
    fixture.componentRef.setInput('id', 'game-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Flip Game');
  });

  it('renders the Save Game button', async () => {
    const fixture = TestBed.createComponent(GameEditorComponent);
    fixture.componentRef.setInput('id', 'game-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Save Game');
  });

  it('renders the flip_reveal card editor', async () => {
    const fixture = TestBed.createComponent(GameEditorComponent);
    fixture.componentRef.setInput('id', 'game-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Flip');
  });
});

describe('GameEditorComponent — match_pairs', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameEditorComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        {
          provide: GameRepository,
          useValue: {
            getById: async () => sampleMatchGame,
            set: jest.fn(),
          },
        },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('creates the component for match_pairs', () => {
    const fixture = TestBed.createComponent(GameEditorComponent);
    fixture.componentRef.setInput('id', 'game-2');
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders Match Game title', async () => {
    const fixture = TestBed.createComponent(GameEditorComponent);
    fixture.componentRef.setInput('id', 'game-2');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Match Game');
  });
});

describe('GameEditorComponent — save game', () => {
  let setMock: jest.Mock;

  beforeEach(async () => {
    setMock = jest.fn().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [GameEditorComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        {
          provide: GameRepository,
          useValue: { getById: async () => sampleFlipGame, set: setMock },
        },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('calls GameRepository.set when saving the game', async () => {
    const fixture = TestBed.createComponent(GameEditorComponent);
    fixture.componentRef.setInput('id', 'game-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    await fixture.componentInstance['saveGame']();

    expect(setMock).toHaveBeenCalledWith('acme', expect.objectContaining({ id: 'game-1' }));
  });
});
