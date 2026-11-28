import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthoringApi } from '@assurance/lms-core';
import { QuizzesComponent } from './quizzes.component';

const sampleQuiz = {
  id: 'quiz-1',
  title: 'Sample Quiz',
  questions: [],
  passThreshold: 70,
  maxAttempts: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

describe('QuizzesComponent', () => {
  const api = { quizzes: jest.fn(), createQuiz: jest.fn() };

  async function render() {
    const fixture = TestBed.createComponent(QuizzesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    api.quizzes.mockResolvedValue([sampleQuiz]);
    api.createQuiz.mockResolvedValue(sampleQuiz);
    await TestBed.configureTestingModule({
      imports: [QuizzesComponent],
      providers: [provideRouter([]), { provide: AuthoringApi, useValue: api }],
    }).compileComponents();
  });

  it('renders the heading, the New Quiz form and the loaded quizzes', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Quizzes');
    expect(text).toContain('New Quiz');
    expect(text).toContain('Create Quiz');
    expect(text).toContain('Sample Quiz');
  });

  it('creates a quiz through the API and reloads', async () => {
    const fixture = await render();
    const ci = fixture.componentInstance as unknown as Record<string, unknown>;
    ci['newTitle'] = 'My Test Quiz';
    ci['newPassThreshold'] = 80;
    await (ci['createQuiz'] as () => Promise<void>).call(fixture.componentInstance);

    expect(api.createQuiz).toHaveBeenCalledWith({
      title: 'My Test Quiz',
      questions: [],
      passThreshold: 80,
    });
    expect(api.quizzes).toHaveBeenCalledTimes(2);
  });

  it('shows the error when quizzes fail to load', async () => {
    api.quizzes.mockRejectedValue(new Error('down'));
    const fixture = await render();
    expect(fixture.nativeElement.textContent).toContain('Failed to load quizzes');
  });
});
