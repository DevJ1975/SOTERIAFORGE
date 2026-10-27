import { TestBed } from '@angular/core/testing';
import { CoachApi } from './coach-api';
import { TutorChatComponent } from './tutor-chat.component';

describe('Course-scoped tutor chat', () => {
  const api = { courses: jest.fn(), profiles: jest.fn(), ask: jest.fn() };
  beforeEach(() => {
    api.courses.mockReset().mockResolvedValue([{ id: 'c1', title: 'Gardening' }]);
    api.profiles.mockReset().mockResolvedValue([
      { id: 'general', title: 'Course Tutor', description: '', references: [] },
      { id: 'workplace-ai', title: 'AI for the Workplace', description: '', references: [] },
      { id: 'cybersecurity-ai', title: 'AI in Cybersecurity', description: '', references: [] },
    ]);
    api.ask
      .mockReset()
      .mockResolvedValue({ answer: '<script>unsafe</script>', citations: [], abstained: true });
    TestBed.configureTestingModule({
      imports: [TutorChatComponent],
      providers: [{ provide: CoachApi, useValue: api }],
    });
  });

  async function render(courseId = '') {
    const fixture = TestBed.createComponent(TutorChatComponent);
    fixture.componentRef.setInput('tenantId', 'acme');
    fixture.componentRef.setInput('uid', 'learner');
    fixture.componentRef.setInput('courseId', courseId);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('requires a permitted course on the standalone page', async () => {
    const fixture = await render();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Gardening');
  });

  it('uses the supplied course context and renders answers as plain text', async () => {
    const fixture = await render('c1');
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'Question';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.ask).toHaveBeenCalledWith('Question', 'c1', expect.any(AbortSignal), 'general');
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('<script>unsafe</script>');
    fixture.componentRef.setInput('courseId', 'c2');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('<script>unsafe</script>');
  });

  it('switches specialist profiles, clears history, and sends the selected agent', async () => {
    const fixture = await render('c1');
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const send = async () => {
      input.value = 'Question';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await send();
    expect(fixture.nativeElement.textContent).toContain('<script>unsafe</script>');
    const agent = fixture.nativeElement.querySelector(
      '[aria-label="Tutor agent"]',
    ) as HTMLSelectElement;
    agent.value = 'workplace-ai';
    agent.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('<script>unsafe</script>');
    await send();
    expect(api.ask).toHaveBeenLastCalledWith(
      'Question',
      'c1',
      expect.any(AbortSignal),
      'workplace-ai',
    );
    agent.value = 'cybersecurity-ai';
    agent.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await send();
    expect(api.ask).toHaveBeenLastCalledWith(
      'Question',
      'c1',
      expect.any(AbortSignal),
      'cybersecurity-ai',
    );
  });
});
