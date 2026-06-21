import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ScormPlayerComponent, safeScormUrl } from './scorm-player.component';
import { ScormRuntimeService } from './scorm-runtime.service';

const mockScormRuntime: Partial<ScormRuntimeService> = {
  initialize: jest.fn().mockResolvedValue(undefined),
  terminate: jest.fn(),
  completed: { asReadonly: () => ({ asReadonly: jest.fn() }) } as never,
  score: { asReadonly: () => ({ asReadonly: jest.fn() }) } as never,
};

// Provide a signal-like mock for completed / score
const completedSignal = jest.fn().mockReturnValue(false);
const scoreSignal = jest.fn().mockReturnValue(null);
(mockScormRuntime as Record<string, unknown>)['completed'] = completedSignal;
(mockScormRuntime as Record<string, unknown>)['score'] = scoreSignal;

describe('ScormPlayerComponent', () => {
  let fixture: ComponentFixture<ScormPlayerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScormPlayerComponent],
      providers: [{ provide: ScormRuntimeService, useValue: mockScormRuntime }],
    }).compileComponents();

    fixture = TestBed.createComponent(ScormPlayerComponent);
    fixture.componentRef.setInput('launchUrl', 'https://content.example.com/scorm/index.html');
  });

  it('creates the component', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders an iframe element in the template', () => {
    fixture.detectChanges();
    const iframe: HTMLIFrameElement | null = (fixture.nativeElement as HTMLElement).querySelector(
      'iframe',
    );
    expect(iframe).toBeTruthy();
  });

  it('applies scormVersion input (default 2004)', () => {
    expect(fixture.componentInstance.scormVersion()).toBe('2004');
  });

  it('accepts a 1.2 scormVersion input', () => {
    fixture.componentRef.setInput('scormVersion', '1.2');
    fixture.detectChanges();
    expect(fixture.componentInstance.scormVersion()).toBe('1.2');
  });

  it('accepts an initialCmi input', () => {
    const cmi = { 'cmi.core.lesson_status': 'incomplete' };
    fixture.componentRef.setInput('initialCmi', cmi);
    fixture.detectChanges();
    expect(fixture.componentInstance.initialCmi()).toEqual(cmi);
  });

  it('sets the error state and leaves iframe src empty for an unsafe launch URL (FIX-5)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fixture.componentRef.setInput('launchUrl', 'javascript:alert(1)');
    fixture.detectChanges();
    // Let afterNextRender + the (mocked) async initialize settle.
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe(true);
    const iframe: HTMLIFrameElement | null = (fixture.nativeElement as HTMLElement).querySelector(
      'iframe',
    );
    // Unsafe URL must never reach iframe.src.
    expect(iframe?.getAttribute('src')).toBeFalsy();
    errSpy.mockRestore();
  });

  it('loads a safe https launch URL into the iframe (FIX-5)', async () => {
    fixture.componentRef.setInput('launchUrl', 'https://cdn.example.com/scorm/index.html');
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe(false);
    const iframe: HTMLIFrameElement | null = (fixture.nativeElement as HTMLElement).querySelector(
      'iframe',
    );
    expect(iframe?.src).toBe('https://cdn.example.com/scorm/index.html');
  });
});

// ---------------------------------------------------------------------------
// FIX-5 — launch URL validation (sanitizer-bypass sink)
// ---------------------------------------------------------------------------

describe('safeScormUrl', () => {
  const base = 'https://app.example.com';

  it('allows absolute https and http URLs', () => {
    expect(safeScormUrl('https://cdn.example.com/scorm/index.html', base)).toBe(
      'https://cdn.example.com/scorm/index.html',
    );
    expect(safeScormUrl('http://cdn.example.com/a.html', base)).toBe(
      'http://cdn.example.com/a.html',
    );
  });

  it('allows same-origin relative URLs (resolved against the origin)', () => {
    expect(safeScormUrl('/content/sco/index.html', base)).toBe(
      'https://app.example.com/content/sco/index.html',
    );
  });

  it('rejects javascript: URLs', () => {
    expect(safeScormUrl('javascript:alert(document.cookie)', base)).toBeNull();
  });

  it('rejects data: URLs', () => {
    expect(safeScormUrl('data:text/html,<script>alert(1)</script>', base)).toBeNull();
  });

  it('rejects blob: and file: URLs', () => {
    expect(safeScormUrl('blob:https://app.example.com/abc', base)).toBeNull();
    expect(safeScormUrl('file:///etc/passwd', base)).toBeNull();
  });

  it('rejects empty / unparseable input', () => {
    expect(safeScormUrl('', base)).toBeNull();
    expect(safeScormUrl('http://', base)).toBeNull();
  });
});
