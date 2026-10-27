import { TestBed } from '@angular/core/testing';
import { SFX_AUDIO_FACTORY, SFX_BASE_URL, SfxService } from './sfx.service';

function fakeAudio(url: string) {
  return { url, currentTime: 5, volume: 1, preload: '', play: jest.fn(() => Promise.resolve()) };
}

describe('SfxService', () => {
  let created: ReturnType<typeof fakeAudio>[];

  function setup(reducedMotion = false): SfxService {
    created = [];
    window.matchMedia = jest.fn().mockReturnValue({ matches: reducedMotion }) as never;
    TestBed.configureTestingModule({
      providers: [
        { provide: SFX_BASE_URL, useValue: '/s/' },
        {
          provide: SFX_AUDIO_FACTORY,
          useValue: (url: string) => {
            const a = fakeAudio(url);
            created.push(a);
            return a as unknown as HTMLAudioElement;
          },
        },
      ],
    });
    return TestBed.inject(SfxService);
  }

  beforeEach(() => localStorage.clear());

  it('plays a sound from the start at the configured volume', () => {
    const sfx = setup();
    sfx.play('correct');
    expect(created).toHaveLength(1);
    expect(created[0].url).toBe('/s/correct.mp3');
    expect(created[0].currentTime).toBe(0);
    expect(created[0].volume).toBeLessThan(1);
    expect(created[0].play).toHaveBeenCalledTimes(1);
  });

  it('reuses the audio element for repeat plays', () => {
    const sfx = setup();
    sfx.play('select');
    sfx.play('select');
    expect(created).toHaveLength(1);
    expect(created[0].play).toHaveBeenCalledTimes(2);
  });

  it('does not play while muted, and persists the choice', () => {
    const sfx = setup();
    sfx.setMuted(true);
    sfx.play('correct');
    expect(created).toHaveLength(0);
    expect(localStorage.getItem('assurance.sfx.muted')).toBe('1');
    sfx.toggle();
    expect(sfx.muted()).toBe(false);
    expect(localStorage.getItem('assurance.sfx.muted')).toBe('0');
  });

  it('starts muted for reduced-motion learners with no saved choice', () => {
    expect(setup(true).muted()).toBe(true);
  });

  it('lets a saved choice override reduced motion', () => {
    localStorage.setItem('assurance.sfx.muted', '0');
    expect(setup(true).muted()).toBe(false);
  });

  it('swallows playback rejection (autoplay blocked)', async () => {
    const sfx = setup();
    sfx.preload(['fail']);
    created[0].play.mockReturnValueOnce(Promise.reject(new Error('NotAllowedError')));
    expect(() => sfx.play('fail')).not.toThrow();
    await Promise.resolve();
  });

  it('preload creates elements without playing', () => {
    const sfx = setup();
    sfx.preload(['match', 'incorrect']);
    expect(created.map((a) => a.url)).toEqual(['/s/match.mp3', '/s/incorrect.mp3']);
    expect(created.every((a) => a.play.mock.calls.length === 0)).toBe(true);
  });
});
