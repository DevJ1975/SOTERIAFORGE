import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LearningApi } from '@assurance/lms-core';
import { StandardsApi } from '@assurance/standards';
import { StandardsComponent } from './standards.component';

describe('SCORM administration', () => {
  let fixture: ComponentFixture<StandardsComponent>;
  const api = {
    packages: jest.fn(),
    deliveries: jest.fn(),
    upload: jest.fn(),
    attach: jest.fn(),
    archive: jest.fn(),
    configuration: jest.fn(),
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
    learning.courses.mockResolvedValue([]);
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
});
