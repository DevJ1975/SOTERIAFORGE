import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthoringApi } from '@assurance/lms-core';
import { GameEditorComponent } from './game-editor.component';

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
  riveAssetRef: '',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
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
  riveAssetRef: '',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

describe('GameEditorComponent', () => {
  const api = { game: jest.fn(), updateGame: jest.fn() };

  async function render(id: string) {
    const fixture = TestBed.createComponent(GameEditorComponent);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    api.game.mockImplementation(async (id: string) =>
      id === 'game-2' ? sampleMatchGame : sampleFlipGame,
    );
    api.updateGame.mockImplementation(async (_id: string, patch: object) => ({
      ...sampleFlipGame,
      ...patch,
    }));
    await TestBed.configureTestingModule({
      imports: [GameEditorComponent],
      providers: [provideRouter([]), { provide: AuthoringApi, useValue: api }],
    }).compileComponents();
  });

  it('loads the game and renders the flip_reveal editor', async () => {
    const fixture = await render('game-1');
    const text = fixture.nativeElement.textContent;
    expect(api.game).toHaveBeenCalledWith('game-1');
    expect(text).toContain('Back to Games');
    expect(text).toContain('Flip Game');
    expect(text).toContain('Save Game');
    expect(text).toContain('Flip');
  });

  it('renders a match_pairs game', async () => {
    const fixture = await render('game-2');
    expect(fixture.nativeElement.textContent).toContain('Match Game');
  });

  it('validates, then saves config and Rive ref through the API', async () => {
    const fixture = await render('game-1');
    fixture.componentInstance['editRiveAssetRef'] = ' asset:abc ';
    await fixture.componentInstance['saveGame']();

    expect(api.updateGame).toHaveBeenCalledWith('game-1', {
      config: expect.objectContaining({ kind: 'flip_reveal' }),
      riveAssetRef: 'asset:abc',
    });
  });

  it('does not save a config that fails validation', async () => {
    const fixture = await render('game-1');
    fixture.componentInstance['flipCards'].set([]);
    await fixture.componentInstance['saveGame']();

    expect(api.updateGame).not.toHaveBeenCalled();
    expect(fixture.componentInstance['validationErrors']().length).toBeGreaterThan(0);
  });

  it('shows the error when the save fails', async () => {
    api.updateGame.mockRejectedValue(new Error('nope'));
    const fixture = await render('game-1');
    await fixture.componentInstance['saveGame']();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Failed to save game');
  });
});
