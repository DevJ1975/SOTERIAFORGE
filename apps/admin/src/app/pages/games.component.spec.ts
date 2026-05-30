import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment, TenantService } from '@assurance/auth';
import { GameRepository } from '@assurance/data-access';
import { GamesComponent } from './games.component';

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

const sampleGame = {
  id: 'game-1',
  tenantId: 'acme',
  title: 'Sample Game',
  engine: 'phaser' as const,
  config: {
    kind: 'flip_reveal',
    title: 'Sample Game',
    cards: [{ id: 'c1', label: 'Card 1', revealText: 'Reveal' }],
  },
  assetRefs: [],
  createdAt: new Date().toISOString(),
};

describe('GamesComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GamesComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        { provide: GameRepository, useValue: { list: async () => [sampleGame], set: jest.fn() } },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(GamesComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the Games heading', () => {
    const fixture = TestBed.createComponent(GamesComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Games');
  });

  it('renders the New Game form', async () => {
    const fixture = TestBed.createComponent(GamesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('New Game');
  });

  it('renders the Create Game button', async () => {
    const fixture = TestBed.createComponent(GamesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Create Game');
  });

  it('loads and displays games from the repository', async () => {
    const fixture = TestBed.createComponent(GamesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sample Game');
  });
});

describe('GamesComponent — create game', () => {
  let setMock: jest.Mock;

  beforeEach(async () => {
    // jsdom does not expose crypto.randomUUID — polyfill for this test suite
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => 'test-uuid-game' },
      configurable: true,
    });
    setMock = jest.fn().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [GamesComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        { provide: GameRepository, useValue: { list: async () => [], set: setMock } },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('calls GameRepository.set when creating a new game', async () => {
    const fixture = TestBed.createComponent(GamesComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const ci = fixture.componentInstance as unknown as Record<string, unknown>;
    ci['newTitle'] = 'My Test Game';
    ci['newKind'] = 'flip_reveal';
    await (ci['createGame'] as () => Promise<void>).call(fixture.componentInstance);

    expect(setMock).toHaveBeenCalledWith(
      'acme',
      expect.objectContaining({ title: 'My Test Game', tenantId: 'acme', engine: 'phaser' }),
    );
  });
});
