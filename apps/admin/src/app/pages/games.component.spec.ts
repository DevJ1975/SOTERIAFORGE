import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthoringApi } from '@assurance/lms-core';
import { GamesComponent } from './games.component';

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
  riveAssetRef: '',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

describe('GamesComponent', () => {
  const api = { games: jest.fn(), createGame: jest.fn() };

  async function render() {
    const fixture = TestBed.createComponent(GamesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    api.games.mockResolvedValue([sampleGame]);
    api.createGame.mockResolvedValue(sampleGame);
    await TestBed.configureTestingModule({
      imports: [GamesComponent],
      providers: [provideRouter([]), { provide: AuthoringApi, useValue: api }],
    }).compileComponents();
  });

  it('renders the heading, the New Game form and the loaded games', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Games');
    expect(text).toContain('New Game');
    expect(text).toContain('Create Game');
    expect(text).toContain('Sample Game');
  });

  it('creates a game with a default template config through the API', async () => {
    const fixture = await render();
    const ci = fixture.componentInstance as unknown as Record<string, unknown>;
    ci['newTitle'] = 'My Test Game';
    ci['newKind'] = 'flip_reveal';
    await (ci['createGame'] as () => Promise<void>).call(fixture.componentInstance);

    expect(api.createGame).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'My Test Game',
        engine: 'phaser',
        config: expect.objectContaining({ kind: 'flip_reveal', title: 'My Test Game' }),
      }),
    );
    expect(api.games).toHaveBeenCalledTimes(2);
  });

  it('shows the error when games fail to load', async () => {
    api.games.mockRejectedValue(new Error('down'));
    const fixture = await render();
    expect(fixture.nativeElement.textContent).toContain('Failed to load games');
  });
});
