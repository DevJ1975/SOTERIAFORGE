import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthoringApi } from '@assurance/lms-core';
import { QuizEditorComponent } from './quiz-editor.component';

const sampleQuiz = {
  id: 'quiz-1',
  title: 'Sample Quiz',
  questions: [
    {
      id: 'q1',
      type: 'mcq' as const,
      prompt: 'Which?',
      points: 1,
      options: [{ id: 'o1', text: 'A', isCorrect: true }],
      answerKey: [],
    },
  ],
  passThreshold: 70,
  maxAttempts: 3,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

describe('QuizEditorComponent', () => {
  const api = { quiz: jest.fn(), updateQuiz: jest.fn() };

  async function render() {
    const fixture = TestBed.createComponent(QuizEditorComponent);
    fixture.componentRef.setInput('id', 'quiz-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    api.quiz.mockResolvedValue(sampleQuiz);
    api.updateQuiz.mockImplementation(async (_id: string, patch: object) => ({
      ...sampleQuiz,
      ...patch,
    }));
    await TestBed.configureTestingModule({
      imports: [QuizEditorComponent],
      providers: [provideRouter([]), { provide: AuthoringApi, useValue: api }],
    }).compileComponents();
  });

  it('renders the back link, title, question form and save button', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent;
    expect(api.quiz).toHaveBeenCalledWith('quiz-1');
    expect(text).toContain('Back to Quizzes');
    expect(text).toContain('Sample Quiz');
    expect(text).toContain('Add Question');
    expect(text).toContain('Save Quiz');
    expect(text).toContain('Which?');
  });

  it('saves the questions and settings through the API', async () => {
    const fixture = await render();
    await fixture.componentInstance['saveQuiz']();
    expect(api.updateQuiz).toHaveBeenCalledWith('quiz-1', {
      title: 'Sample Quiz',
      questions: sampleQuiz.questions,
      passThreshold: 70,
      maxAttempts: 3,
    });
  });

  it('saves just the settings from the settings panel', async () => {
    const fixture = await render();
    fixture.componentInstance['editPassThreshold'] = 85;
    fixture.componentInstance['editMaxAttempts'] = null;
    await fixture.componentInstance['saveSettings']();
    expect(api.updateQuiz).toHaveBeenCalledWith('quiz-1', {
      passThreshold: 85,
      maxAttempts: null,
    });
  });

  it('shows the API validation message when saving fails', async () => {
    api.updateQuiz.mockRejectedValue(new Error('nope'));
    const fixture = await render();
    await fixture.componentInstance['saveQuiz']();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Failed to save quiz');
  });
});
