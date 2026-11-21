import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { SessionHuddle } from './engage-session.model';
import { HUDDLE_SAVE_DELAY_MS, SessionHuddleComponent } from './session-huddle.component';

const huddle = (over: Partial<SessionHuddle> = {}): SessionHuddle => ({
  text: '',
  updatedAt: null,
  updatedByName: null,
  canEdit: true,
  ...over,
});

describe('SessionHuddleComponent', () => {
  let fixture: ComponentFixture<SessionHuddleComponent>;
  const saved: string[] = [];
  const box = () => fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

  function show(value: SessionHuddle): void {
    fixture.componentRef.setInput('huddle', value);
    fixture.detectChanges();
  }

  function type(text: string): void {
    box().value = text;
    box().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    jest.useFakeTimers();
    saved.length = 0;
    TestBed.configureTestingModule({ imports: [SessionHuddleComponent] });
    fixture = TestBed.createComponent(SessionHuddleComponent);
    fixture.componentInstance.save.subscribe((text) => saved.push(text));
  });

  afterEach(() => jest.useRealTimers());

  it('saves once after the typing pause, not on every key', () => {
    show(huddle());
    type('The');
    jest.advanceTimersByTime(HUDDLE_SAVE_DELAY_MS - 1);
    type('The sender');
    jest.advanceTimersByTime(HUDDLE_SAVE_DELAY_MS - 1);
    expect(saved).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(saved).toEqual(['The sender']);
    jest.advanceTimersByTime(HUDDLE_SAVE_DELAY_MS * 3);
    expect(saved).toHaveLength(1);
  });

  it('saves at once when focus leaves the box', () => {
    show(huddle());
    type('Ticket 4474');
    box().dispatchEvent(new Event('blur'));
    expect(saved).toEqual(['Ticket 4474']);
    jest.advanceTimersByTime(HUDDLE_SAVE_DELAY_MS);
    expect(saved).toHaveLength(1);
  });

  it("does not overwrite unsaved typing with a crewmate's update", () => {
    show(huddle({ text: 'Start' }));
    expect(box().value).toBe('Start');
    type('Start, my idea');
    show(huddle({ text: 'Start, their idea', updatedAt: '2026-11-21T18:10:00Z' }));
    expect(box().value).toBe('Start, my idea');
    jest.advanceTimersByTime(HUDDLE_SAVE_DELAY_MS);
    show(huddle({ text: 'Merged on the server', updatedAt: '2026-11-21T18:10:02Z' }));
    expect(box().value).toBe('Merged on the server');
  });

  it('is read-only for crew members who cannot edit, and says why', () => {
    show(huddle({ text: 'Lead notes', canEdit: false, updatedAt: '2026-11-21T18:10:00Z' }));
    expect(box().readOnly).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('crew lead is taking the notes');
  });

  it('labels the box and says who saved last', () => {
    show(huddle({ text: 'x', updatedAt: '2026-11-21T18:10:00Z', updatedByName: 'Elena Ruiz' }));
    const label = fixture.nativeElement.querySelector('label') as HTMLLabelElement;
    expect(label.htmlFor).toBe(box().id);
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'Saved · last edit by Elena Ruiz',
    );
  });

  it('saves pending typing when the stage changes and the box goes away', () => {
    show(huddle());
    type('Unsaved');
    fixture.destroy();
    expect(saved).toEqual(['Unsaved']);
  });
});
