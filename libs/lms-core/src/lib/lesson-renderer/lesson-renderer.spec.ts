import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { LessonDraft } from '@forge/shared';
import { ForgeLessonRenderer } from './lesson-renderer';

const lessonWithEveryKind: LessonDraft = {
  id: 'lesson-1',
  title: 'Pre-Operation Inspection',
  blocks: [
    { id: 'b1', kind: 'heading', text: 'Before you turn the key', level: 2 },
    {
      id: 'b2',
      kind: 'paragraph',
      html: 'Inspect the <strong>forks</strong> before <em>every</em> shift.',
    },
    {
      id: 'b3',
      kind: 'image',
      url: 'https://example.com/forklift.jpg',
      alt: 'Counterbalance forklift',
      caption: 'A 5,000 lb counterbalance truck',
      layout: 'centered',
    },
    {
      id: 'b4',
      kind: 'video',
      url: 'https://www.youtube.com/watch?v=abc123xyz',
      caption: 'Daily walkaround demo',
    },
    { id: 'b5', kind: 'bulletList', items: ['Tires', 'Forks', 'Mast chains'] },
    { id: 'b6', kind: 'numberedList', items: ['Park', 'Lower forks', 'Set the brake'] },
    { id: 'b7', kind: 'quote', text: 'Safety is no accident.', attribution: 'Site manager' },
    {
      id: 'b8',
      kind: 'callout',
      tone: 'warning',
      title: 'Tag it out',
      html: 'Defective trucks must be <b>removed from service</b>.',
    },
    { id: 'b9', kind: 'divider', style: 'line' },
    {
      id: 'b10',
      kind: 'button',
      label: 'Read the OSHA standard',
      url: 'https://www.osha.gov/powered-industrial-trucks',
      style: 'primary',
    },
    { id: 'b11', kind: 'embed', url: 'https://www.osha.gov/etools', height: 400 },
    {
      id: 'b12',
      kind: 'accordion',
      items: [
        { id: 'a1', title: 'Hydraulics', html: 'Check hoses for leaks.' },
        { id: 'a2', title: 'Overhead guard', html: 'Look for cracks or bends.' },
      ],
    },
    {
      id: 'b13',
      kind: 'tabs',
      items: [
        { id: 't1', title: 'Electric trucks', html: 'Check the battery connector.' },
        { id: 't2', title: 'LPG trucks', html: 'Smell for propane leaks.' },
      ],
    },
    {
      id: 'b14',
      kind: 'flashcards',
      cards: [
        { id: 'c1', front: 'Data plate', back: 'States the rated capacity.' },
        { id: 'c2', front: 'Load center', back: 'Usually 24 inches.' },
      ],
    },
    {
      id: 'b15',
      kind: 'knowledgeCheck',
      question: 'When must the daily inspection happen?',
      type: 'mcq',
      options: [
        { id: 'o1', text: 'Before each shift', correct: true },
        { id: 'o2', text: 'Once a month', correct: false },
      ],
      feedbackCorrect: 'Right — before every shift.',
      feedbackIncorrect: 'No — OSHA requires a pre-shift inspection.',
    },
  ],
};

describe('ForgeLessonRenderer', () => {
  let fixture: ComponentFixture<ForgeLessonRenderer>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ForgeLessonRenderer] }).compileComponents();
    fixture = TestBed.createComponent(ForgeLessonRenderer);
    fixture.componentRef.setInput('lesson', lessonWithEveryKind);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  it('renders a lesson containing every block kind without throwing', () => {
    expect(element.querySelector('h2.block-heading')?.textContent).toContain(
      'Before you turn the key',
    );
    expect(element.querySelector('.block-paragraph strong')?.textContent).toBe('forks');
    expect(element.querySelector('.block-image img')?.getAttribute('src')).toContain('forklift');
    expect(element.querySelector('.block-video iframe')).toBeTruthy(); // YouTube embed
    expect(element.querySelectorAll('.block-list')).toHaveLength(2);
    expect(element.querySelector('.block-quote cite')?.textContent).toContain('Site manager');
    expect(element.querySelector('.block-callout.tone-warning')).toBeTruthy();
    expect(element.querySelector('hr.block-divider')).toBeTruthy();
    expect(element.querySelector('.block-button')?.getAttribute('href')).toContain('osha.gov');
    expect(element.querySelector('.block-embed iframe')?.getAttribute('sandbox')).toContain(
      'allow-scripts',
    );
    expect(element.querySelectorAll('.acc-item')).toHaveLength(2);
    expect(element.querySelectorAll('.tab-button')).toHaveLength(2);
    expect(element.querySelectorAll('.flashcard')).toHaveLength(2);
    expect(element.querySelector('.kc-question')?.textContent).toContain('daily inspection');
  });

  it('expands and collapses accordion panels', () => {
    const header = element.querySelector<HTMLButtonElement>('.acc-header');
    expect(element.querySelector('.acc-item.open')).toBeFalsy();
    header?.click();
    fixture.detectChanges();
    expect(element.querySelector('.acc-item.open')).toBeTruthy();
    header?.click();
    fixture.detectChanges();
    expect(element.querySelector('.acc-item.open')).toBeFalsy();
  });

  it('switches tabs', () => {
    expect(element.querySelector('.tab-panel')?.textContent).toContain('battery');
    const tabs = element.querySelectorAll<HTMLButtonElement>('.tab-button');
    tabs[1].click();
    fixture.detectChanges();
    expect(element.querySelector('.tab-panel')?.textContent).toContain('propane');
  });

  it('flips flashcards on click', () => {
    const card = element.querySelector<HTMLButtonElement>('.flashcard');
    card?.click();
    fixture.detectChanges();
    expect(element.querySelector('.flashcard.flipped')).toBeTruthy();
  });

  it('runs the knowledge check flow: select, check, feedback, try again', () => {
    const checkButton = () => element.querySelector<HTMLButtonElement>('.kc-check');
    expect(checkButton()?.disabled).toBe(true);

    // Select the correct option and check.
    const options = element.querySelectorAll<HTMLButtonElement>('.kc-option');
    options[0].click();
    fixture.detectChanges();
    expect(checkButton()?.disabled).toBe(false);

    checkButton()?.click();
    fixture.detectChanges();
    expect(element.querySelector('.kc-feedback.ok')?.textContent).toContain('before every shift');
    expect(element.querySelector('.kc-option.correct')).toBeTruthy();

    // Try again resets the state.
    element.querySelector<HTMLButtonElement>('.kc-retry')?.click();
    fixture.detectChanges();
    expect(element.querySelector('.kc-feedback')).toBeFalsy();
    expect(element.querySelector('.kc-option.selected')).toBeFalsy();
  });

  it('shows incorrect feedback for a wrong answer', () => {
    const options = element.querySelectorAll<HTMLButtonElement>('.kc-option');
    options[1].click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.kc-check')?.click();
    fixture.detectChanges();
    expect(element.querySelector('.kc-feedback.nope')?.textContent).toContain('pre-shift');
    expect(element.querySelector('.kc-option.incorrect')).toBeTruthy();
  });

  it('renders an empty state for a lesson with no blocks', () => {
    fixture.componentRef.setInput('lesson', { id: 'empty', title: 'Empty', blocks: [] });
    fixture.detectChanges();
    expect(element.querySelector('.lesson-empty')?.textContent).toContain('no content');
  });
});
