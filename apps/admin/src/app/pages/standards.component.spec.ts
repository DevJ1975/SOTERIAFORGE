import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LearningApi } from '@assurance/lms-core';
import { StandardsApi } from '@assurance/standards';
import { StandardsComponent, parseOrigins } from './standards.component';

describe('SCORM administration', () => {
  let fixture: ComponentFixture<StandardsComponent>;
  const api = {
    packages: jest.fn(),
    deliveries: jest.fn(),
    upload: jest.fn(),
    attach: jest.fn(),
    archive: jest.fn(),
    configuration: jest.fn(),
    dispatches: jest.fn(),
    createDispatch: jest.fn(),
    updateDispatch: jest.fn(),
    dispatchPackage: jest.fn(),
  };
  const dispatch = {
    id: 'd1',
    courseId: 'c1',
    courseTitle: 'Lockout Tagout',
    format: 'scorm12' as const,
    lmsOrigins: ['https://lms.example'],
    revoked: false,
    createdAt: '2026-11-21T15:00:00Z',
    launchUrl: 'https://lakewood.soteriaforge.com/dispatch/d1',
  };
  const learning = { courses: jest.fn(), course: jest.fn() };
  const packageVersion = {
    id: 'package-1',
    title: 'Demo',
    status: 'ready',
    sha256: 'abc123',
    scorm_version: '1.2',
    error: '',
    created_at: '',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    api.packages.mockResolvedValue([packageVersion]);
    api.deliveries.mockResolvedValue([]);
    api.configuration.mockResolvedValue({
      enabled: false,
      storageConfigured: false,
      contentOriginConfigured: false,
      xapiRecordingEnabled: false,
      lrsConfigured: false,
    });
    api.dispatches.mockResolvedValue([dispatch]);
    learning.courses.mockResolvedValue([
      { id: 'c1', title: 'Lockout Tagout', status: 'published' },
      { id: 'c2', title: 'Draft course', status: 'draft' },
    ]);
    learning.course.mockResolvedValue({ modules: [] });
    await TestBed.configureTestingModule({
      imports: [StandardsComponent],
      providers: [
        provideRouter([]),
        { provide: StandardsApi, useValue: api },
        { provide: LearningApi, useValue: learning },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StandardsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  });

  it('shows immutable version status and pending delivery', () => {
    expect(fixture.nativeElement.textContent).toContain('Demo');
    expect(fixture.nativeElement.textContent).toContain('abc123');
    expect(fixture.nativeElement.textContent).toContain('No recorded events');
  });

  it('surfaces upload and refresh failures', async () => {
    fixture.componentInstance.file = new File(['zip'], 'demo.zip');
    fixture.componentInstance.title = 'Demo';
    api.upload.mockRejectedValueOnce(new Error('unavailable'));
    await fixture.componentInstance.upload();
    expect(fixture.componentInstance.error()).toBeTruthy();
    api.packages.mockRejectedValueOnce(new Error('unavailable'));
    await fixture.componentInstance.refresh();
    expect(fixture.componentInstance.error()).toBeTruthy();
  });

  it('attaches a package to the selected Django module', async () => {
    fixture.componentInstance.moduleId = 'module-1';
    fixture.componentInstance.lessonTitle = 'Lesson';
    api.attach.mockResolvedValueOnce({ lessonId: 'lesson-1' });
    await fixture.componentInstance.attach({
      ...packageVersion,
      status: 'ready',
      scorm_version: '1.2',
    });
    expect(api.attach).toHaveBeenCalledWith('package-1', 'module-1', 'Lesson');
    expect(fixture.componentInstance.notice()).toContain('SCORM lesson added');
  });

  describe('export for an LMS', () => {
    const el = () => fixture.nativeElement as HTMLElement;
    const component = () => fixture.componentInstance;

    it('lists exports and offers only published courses', () => {
      expect(el().textContent).toContain('https://lakewood.soteriaforge.com/dispatch/d1');
      expect(el().textContent).toContain('https://lms.example');
      const options = Array.from(
        el().querySelectorAll<HTMLOptionElement>('select[name="exportCourse"] option'),
      ).map((o) => o.textContent?.trim());
      expect(options).toEqual(['Select course', 'Lockout Tagout']);
    });

    it('normalises origins and rejects anything that is not https', () => {
      expect(
        parseOrigins('https://lms.example/path\nhttps://lms.example, https://b.example'),
      ).toEqual({
        origins: ['https://lms.example', 'https://b.example'],
        invalid: [],
      });
      expect(parseOrigins('http://lms.example lms.example').invalid).toEqual([
        'http://lms.example',
        'lms.example',
      ]);
    });

    it('requires an origin for SCORM but not for cmi5', async () => {
      component().exportCourseId = 'c1';
      await component().createExport();
      expect(api.createDispatch).not.toHaveBeenCalled();
      expect(component().error()).toContain('at least one LMS origin');

      component().exportFormat = 'cmi5';
      api.createDispatch.mockResolvedValueOnce({ ...dispatch, id: 'd2', format: 'cmi5' });
      await component().createExport();
      expect(api.createDispatch).toHaveBeenCalledWith({
        courseId: 'c1',
        format: 'cmi5',
        lmsOrigins: [],
      });
      expect(
        component()
          .dispatches()
          .map((d) => d.id),
      ).toEqual(['d2', 'd1']);
    });

    it('refuses a bad origin before calling the API and shows server field errors', async () => {
      component().exportCourseId = 'c1';
      component().exportOrigins = 'lms.example';
      await component().createExport();
      expect(api.createDispatch).not.toHaveBeenCalled();
      expect(component().error()).toContain('lms.example');

      component().exportOrigins = 'https://lms.example';
      api.createDispatch.mockImplementationOnce(async () => {
        throw new HttpErrorResponse({
          status: 400,
          error: { lmsOrigins: ['Use an https origin.'] },
        });
      });
      await component().createExport();
      expect(component().error()).toBe('Use an https origin.');
    });

    it('downloads the package under the server filename', async () => {
      const create = jest.spyOn(document, 'createElement');
      const urls = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
      urls.createObjectURL = jest.fn(() => 'blob:x');
      urls.revokeObjectURL = jest.fn();
      api.dispatchPackage.mockResolvedValueOnce({ blob: new Blob(['PK']), filename: 'loto.zip' });
      await component().download(dispatch);
      const link = create.mock.results
        .map((r) => r.value as HTMLElement)
        .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);
      expect(link?.download).toBe('loto.zip');
      expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:x');
      create.mockRestore();
    });

    it('edits origins and revokes after confirmation', async () => {
      component().editExport(dispatch);
      expect(component().editOrigins).toBe('https://lms.example');
      component().editOrigins = 'https://files.lms.example';
      api.updateDispatch.mockResolvedValueOnce({
        ...dispatch,
        lmsOrigins: ['https://files.lms.example'],
      });
      await component().saveOrigins(dispatch);
      expect(api.updateDispatch).toHaveBeenCalledWith('d1', {
        lmsOrigins: ['https://files.lms.example'],
      });
      expect(component().editingId()).toBe('');

      const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false);
      await component().revoke(dispatch);
      expect(api.updateDispatch).toHaveBeenCalledTimes(1);
      confirm.mockReturnValueOnce(true);
      api.updateDispatch.mockResolvedValueOnce({ ...dispatch, revoked: true });
      await component().revoke(dispatch);
      expect(api.updateDispatch).toHaveBeenLastCalledWith('d1', { revoked: true });
      fixture.detectChanges();
      expect(el().textContent).toContain('(revoked)');
      confirm.mockRestore();
    });

    it('keeps the import tools working when exports fail to load', async () => {
      api.dispatches.mockImplementationOnce(async () => {
        throw new Error('offline');
      });
      await component().refresh();
      expect(component().error()).toBe('Could not load LMS exports.');
      expect(component().packages()).toHaveLength(1);
    });
  });
});
