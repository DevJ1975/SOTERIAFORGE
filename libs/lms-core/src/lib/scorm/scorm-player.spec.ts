import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Scorm12Api, Scorm2004Api, ScormStatusChange } from '@forge/standards';
import { ForgeScormPlayer } from './scorm-player';

type ScormWindow = Window & { API?: Scorm12Api; API_1484_11?: Scorm2004Api };

const LAUNCH_URL = 'data:text/html,<h1>SCO</h1>';

describe('ForgeScormPlayer', () => {
  let fixture: ComponentFixture<ForgeScormPlayer>;
  let component: ForgeScormPlayer;
  const scormWindow = window as ScormWindow;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ForgeScormPlayer] }).compileComponents();
    fixture = TestBed.createComponent(ForgeScormPlayer);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    expect(scormWindow.API).toBeUndefined();
    expect(scormWindow.API_1484_11).toBeUndefined();
  });

  it('installs the SCORM 1.2 API on window before rendering the iframe', () => {
    fixture.componentRef.setInput('src', LAUNCH_URL);
    fixture.detectChanges();

    expect(scormWindow.API).toBeDefined();
    expect(scormWindow.API_1484_11).toBeUndefined();
    const iframe: HTMLIFrameElement | null = fixture.nativeElement.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms');
  });

  it('emits cmiChanged and statusChanged when content drives the installed API', () => {
    fixture.componentRef.setInput('src', LAUNCH_URL);
    fixture.componentRef.setInput('learnerId', 'learner-9');
    fixture.detectChanges();

    const commits: Record<string, unknown>[] = [];
    const statuses: ScormStatusChange[] = [];
    component.cmiChanged.subscribe((cmi) => commits.push(cmi));
    component.statusChanged.subscribe((status) => statuses.push(status));

    const api = scormWindow.API as Scorm12Api;
    expect(api.LMSInitialize('')).toBe('true');
    expect(api.LMSGetValue('cmi.core.student_id')).toBe('learner-9');
    expect(api.LMSSetValue('cmi.core.score.raw', '87')).toBe('true');
    expect(api.LMSSetValue('cmi.core.lesson_status', 'passed')).toBe('true');
    expect(api.LMSCommit('')).toBe('true');

    expect(statuses).toEqual([
      { completed: false, passed: undefined, scoreRaw: 87 },
      { completed: true, passed: true, scoreRaw: 87 },
    ]);
    expect(commits).toHaveLength(1);
    expect(commits[0]['cmi.core.lesson_status']).toBe('passed');
    expect(commits[0]['cmi.core.score.raw']).toBe('87');

    fixture.detectChanges();
    const footer: HTMLElement = fixture.nativeElement.querySelector('.status-bar');
    expect(footer.textContent).toContain('SCORM 1.2');
    expect(footer.textContent).toContain('Passed ✓ (87%)');
  });

  it('installs API_1484_11 for version 2004 and swaps APIs on version change', () => {
    fixture.componentRef.setInput('src', LAUNCH_URL);
    fixture.componentRef.setInput('version', '2004');
    fixture.detectChanges();

    expect(scormWindow.API).toBeUndefined();
    const api = scormWindow.API_1484_11 as Scorm2004Api;
    expect(api.Initialize('')).toBe('true');
    expect(api.GetValue('cmi.completion_status')).toBe('unknown');

    fixture.componentRef.setInput('version', '1.2');
    fixture.detectChanges();
    expect(scormWindow.API_1484_11).toBeUndefined();
    expect(scormWindow.API).toBeDefined();
  });

  it('seeds the runtime from initialCmi', () => {
    fixture.componentRef.setInput('src', LAUNCH_URL);
    fixture.componentRef.setInput('initialCmi', { 'cmi.suspend_data': 'slide=4' });
    fixture.detectChanges();

    const api = scormWindow.API as Scorm12Api;
    api.LMSInitialize('');
    expect(api.LMSGetValue('cmi.suspend_data')).toBe('slide=4');
    expect(api.LMSGetValue('cmi.core.entry')).toBe('resume');
  });

  it('renders an error state instead of an iframe when src is empty', () => {
    fixture.componentRef.setInput('src', '');
    fixture.detectChanges();

    expect(scormWindow.API).toBeUndefined();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    const error: HTMLElement = fixture.nativeElement.querySelector('.scorm-error');
    expect(error.textContent).toContain('No SCORM launch URL');
  });
});
