import { TestBed } from '@angular/core/testing';
import { AuthoringApi, type ApiLesson } from '@assurance/lms-core';
import { LessonFormComponent } from './lesson-form.component';

function lesson(extra: Partial<ApiLesson> = {}): ApiLesson {
  return {
    id: 'l1',
    courseId: 'c1',
    moduleId: 'm1',
    moduleTitle: 'M',
    moduleLabel: '',
    title: 'Intro',
    order: 0,
    contentType: 'video',
    assetRef: '',
    externalUrl: 'https://youtu.be/a',
    scormVersion: '',
    estimatedMinutes: 4,
    xpReward: 10,
    frameworkTags: ['nist'],
    keyPoints: [{ title: 'Why', body: 'Because' }],
    quiz: null,
    progress: null,
    ...extra,
  };
}

describe('LessonFormComponent', () => {
  const api = { uploadAsset: jest.fn() };

  function setup(existing: ApiLesson | null = null) {
    TestBed.configureTestingModule({
      imports: [LessonFormComponent],
      providers: [{ provide: AuthoringApi, useValue: api }],
    });
    const fixture = TestBed.createComponent(LessonFormComponent);
    fixture.componentRef.setInput('lesson', existing);
    fixture.componentRef.setInput('quizOptions', [{ label: 'Quiz one', value: 'q1' }]);
    fixture.componentRef.setInput('gameOptions', [{ label: 'Game one', value: 'g1' }]);
    const saved: unknown[] = [];
    fixture.componentInstance.saved.subscribe((v) => saved.push(v));
    fixture.detectChanges();
    // Protected members are reached by name; `any` keeps the calls terse.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmp = fixture.componentInstance as unknown as Record<string, any>;
    return { fixture, saved, cmp };
  }

  beforeEach(() => jest.resetAllMocks());

  it('emits a trimmed video lesson with tags and key points', () => {
    const { saved, cmp } = setup();
    cmp['title'] = ' Welcome ';
    cmp['externalUrl'] = ' https://youtu.be/x ';
    cmp['estimatedMinutes'] = 3.9;
    cmp['frameworkTags'] = 'nist, , csf';
    cmp['addKeyPoint']();
    cmp['setKeyPoint'](0, 'title', 'Remember');
    cmp['addKeyPoint']();
    cmp['save']();
    expect(saved).toEqual([
      {
        title: 'Welcome',
        contentType: 'video',
        estimatedMinutes: 3,
        xpReward: 0,
        frameworkTags: ['nist', 'csf'],
        keyPoints: [{ title: 'Remember', body: '' }],
        quizId: null,
        assetRef: '',
        externalUrl: 'https://youtu.be/x',
      },
    ]);
  });

  it('needs a quiz for quiz lessons and a game for game lessons', () => {
    const { saved, cmp } = setup();
    cmp['title'] = 'T';
    cmp['contentType'] = 'quiz';
    expect(cmp['canSave']()).toBe(false);
    cmp['quizId'] = 'q1';
    expect(cmp['canSave']()).toBe(true);
    cmp['save']();
    expect(saved[0]).toMatchObject({ contentType: 'quiz', quizId: 'q1', assetRef: '' });

    cmp['contentType'] = 'game';
    cmp['quizId'] = null;
    expect(cmp['canSave']()).toBe(false);
    cmp['gameId'] = 'g1';
    cmp['save']();
    expect(saved[1]).toMatchObject({ contentType: 'game', assetRef: 'g1', quizId: null });
  });

  it('loads an existing lesson into the form', () => {
    const { cmp } = setup(lesson());
    expect(cmp['title']).toBe('Intro');
    expect(cmp['frameworkTags']).toBe('nist');
    expect(cmp['keyPoints']()).toEqual([{ title: 'Why', body: 'Because' }]);
  });

  it('sends metadata only for package-managed lessons', () => {
    const { saved, cmp } = setup(lesson({ contentType: 'scorm', standardsManaged: true }));
    cmp['title'] = 'Renamed';
    cmp['save']();
    const payload = saved[0] as Record<string, unknown>;
    expect(payload['title']).toBe('Renamed');
    expect(payload).not.toHaveProperty('contentType');
    expect(payload).not.toHaveProperty('assetRef');
    expect(payload).not.toHaveProperty('quizId');
  });

  it('uploads a video and uses the returned asset ref instead of the external URL', async () => {
    api.uploadAsset.mockResolvedValue({ assetRef: 'asset:a1' });
    const { cmp } = setup(lesson());
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    await cmp['upload']({ target: { files: [file] } } as unknown as Event);
    expect(api.uploadAsset).toHaveBeenCalledWith(file, 'clip.mp4');
    expect(cmp['assetRef']).toBe('asset:a1');
    expect(cmp['externalUrl']).toBe('');
  });

  it('shows an upload failure', async () => {
    api.uploadAsset.mockRejectedValue(new Error('too big'));
    const { fixture, cmp } = setup();
    await cmp['upload']({ target: { files: [new File(['x'], 'a.mp4')] } } as unknown as Event);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Upload failed');
  });
});
