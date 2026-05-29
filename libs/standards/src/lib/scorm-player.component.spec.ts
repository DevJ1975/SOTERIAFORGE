import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ScormPlayerComponent } from './scorm-player.component';
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
});
