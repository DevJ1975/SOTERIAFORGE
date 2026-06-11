import {
  getInstalledScormApi,
  installScormApi,
  removeScormApi,
  SCORM_GLOBAL_NAMES,
} from './api-discovery';
import { createScorm12Api, createScorm2004Api, type ScormStatusChange } from './scorm-api';

describe('createScorm12Api', () => {
  it('enforces the initialize/finish state machine', () => {
    const api = createScorm12Api();
    expect(api.LMSGetValue('cmi.core.lesson_status')).toBe('');
    expect(api.LMSGetLastError()).toBe('301'); // get before init
    expect(api.LMSSetValue('cmi.core.lesson_status', 'completed')).toBe('false');
    expect(api.LMSGetLastError()).toBe('301'); // set before init
    expect(api.LMSCommit('')).toBe('false'); // commit before init
    expect(api.LMSFinish('')).toBe('false'); // finish before init

    expect(api.LMSInitialize('')).toBe('true');
    expect(api.LMSGetLastError()).toBe('0');
    expect(api.LMSInitialize('')).toBe('false'); // re-init
    expect(api.LMSGetLastError()).toBe('101');

    expect(api.LMSFinish('')).toBe('true');
    expect(api.LMSFinish('')).toBe('false'); // double finish
    expect(api.LMSSetValue('cmi.suspend_data', 'x')).toBe('false'); // set after finish
    expect(api.LMSGetLastError()).toBe('301');
  });

  it('rejects non-empty parameters with 201', () => {
    const api = createScorm12Api();
    expect(api.LMSInitialize('nope')).toBe('false');
    expect(api.LMSGetLastError()).toBe('201');
  });

  it('serves defaults, learner passthrough and rejects read-only writes', () => {
    const api = createScorm12Api({ learnerId: 'u-42', learnerName: 'Jamil Rahman' });
    api.LMSInitialize('');
    expect(api.LMSGetValue('cmi.core.student_id')).toBe('u-42');
    expect(api.LMSGetValue('cmi.core.student_name')).toBe('Jamil Rahman');
    expect(api.LMSGetValue('cmi.core.lesson_status')).toBe('not attempted');
    expect(api.LMSGetValue('cmi.core.entry')).toBe('ab-initio');
    expect(api.LMSGetValue('cmi.core.score._children')).toBe('raw,min,max');

    expect(api.LMSSetValue('cmi.core.student_id', 'hax')).toBe('false');
    expect(api.LMSGetLastError()).toBe('403'); // read only
    expect(api.LMSSetValue('cmi.core._children', 'x')).toBe('false');
    expect(api.LMSGetLastError()).toBe('402'); // keyword
    expect(api.LMSGetValue('cmi.core.session_time')).toBe('');
    expect(api.LMSGetLastError()).toBe('404'); // write only
    expect(api.LMSGetValue('cmi.nonsense')).toBe('');
    expect(api.LMSGetLastError()).toBe('401'); // not implemented
    expect(api.LMSGetErrorString('403')).toBe('Element is read only');
    expect(api.LMSGetDiagnostic('')).toContain('cmi.nonsense');
  });

  it('round-trips read/write elements and validates values', () => {
    const api = createScorm12Api();
    api.LMSInitialize('');
    expect(api.LMSSetValue('cmi.core.lesson_location', 'page-7')).toBe('true');
    expect(api.LMSGetValue('cmi.core.lesson_location')).toBe('page-7');

    expect(api.LMSSetValue('cmi.core.lesson_status', 'finished')).toBe('false');
    expect(api.LMSGetLastError()).toBe('405'); // bad vocab
    expect(api.LMSSetValue('cmi.core.score.raw', 'ninety')).toBe('false');
    expect(api.LMSGetLastError()).toBe('405'); // not a decimal
    expect(api.LMSSetValue('cmi.core.score.raw', '150')).toBe('false');
    expect(api.LMSGetLastError()).toBe('405'); // out of 0..100
    expect(api.LMSSetValue('cmi.core.score.raw', '87.5')).toBe('true');
    expect(api.LMSGetValue('cmi.core.score.raw')).toBe('87.5');
  });

  it('enforces the 4k suspend_data limit', () => {
    const api = createScorm12Api();
    api.LMSInitialize('');
    expect(api.LMSSetValue('cmi.suspend_data', 'x'.repeat(4096))).toBe('true');
    expect(api.LMSSetValue('cmi.suspend_data', 'x'.repeat(4097))).toBe('false');
    expect(api.LMSGetLastError()).toBe('405');
  });

  it('accumulates session_time into total_time on finish', () => {
    const commits: Record<string, string>[] = [];
    const api = createScorm12Api({
      initialCmi: { 'cmi.core.total_time': '00:30:00' },
      onCommit: (cmi) => commits.push(cmi),
    });
    api.LMSInitialize('');
    api.LMSSetValue('cmi.core.session_time', '00:45:30');
    api.LMSFinish('');
    expect(commits).toHaveLength(1);
    expect(commits[0]['cmi.core.total_time']).toBe('01:15:30');
  });

  it('fires onCommit with the flat CMI map on every commit', () => {
    const commits: Record<string, string>[] = [];
    const api = createScorm12Api({ onCommit: (cmi) => commits.push(cmi) });
    api.LMSInitialize('');
    api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
    expect(api.LMSCommit('')).toBe('true');
    api.LMSSetValue('cmi.core.lesson_status', 'completed');
    api.LMSFinish('');
    expect(commits).toHaveLength(2);
    expect(commits[0]['cmi.core.lesson_status']).toBe('incomplete');
    expect(commits[1]['cmi.core.lesson_status']).toBe('completed');
  });

  it('emits status transitions through onStatusChange', () => {
    const changes: ScormStatusChange[] = [];
    const api = createScorm12Api({ onStatusChange: (change) => changes.push(change) });
    api.LMSInitialize('');
    api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
    api.LMSSetValue('cmi.core.lesson_status', 'incomplete'); // no change, no emit
    api.LMSSetValue('cmi.core.score.raw', '87');
    api.LMSSetValue('cmi.core.lesson_status', 'passed');
    expect(changes).toEqual([
      { completed: false, passed: undefined, scoreRaw: undefined },
      { completed: false, passed: undefined, scoreRaw: 87 },
      { completed: true, passed: true, scoreRaw: 87 },
    ]);
  });

  it('reports entry=resume when seeded with suspend or location state', () => {
    const api = createScorm12Api({
      initialCmi: { cmi: { suspend_data: 'slide=9', core: { lesson_location: 'page-9' } } },
    });
    api.LMSInitialize('');
    expect(api.LMSGetValue('cmi.core.entry')).toBe('resume');
    expect(api.LMSGetValue('cmi.suspend_data')).toBe('slide=9');
  });
});

describe('createScorm2004Api', () => {
  it('uses the 2004 state-machine error codes', () => {
    const api = createScorm2004Api();
    api.GetValue('cmi.completion_status');
    expect(api.GetLastError()).toBe('122');
    api.SetValue('cmi.completion_status', 'completed');
    expect(api.GetLastError()).toBe('132');
    api.Commit('');
    expect(api.GetLastError()).toBe('142');
    api.Terminate('');
    expect(api.GetLastError()).toBe('112');

    expect(api.Initialize('')).toBe('true');
    expect(api.Initialize('')).toBe('false');
    expect(api.GetLastError()).toBe('103');
    expect(api.Terminate('')).toBe('true');
    expect(api.Terminate('')).toBe('false');
    expect(api.GetLastError()).toBe('113');
    api.GetValue('cmi.completion_status');
    expect(api.GetLastError()).toBe('123');
    api.SetValue('cmi.location', 'x');
    expect(api.GetLastError()).toBe('133');
    api.Commit('');
    expect(api.GetLastError()).toBe('143');
    expect(api.Initialize('')).toBe('false');
    expect(api.GetLastError()).toBe('104');
  });

  it('validates scaled score in −1..1 and statuses against vocab', () => {
    const api = createScorm2004Api();
    api.Initialize('');
    expect(api.SetValue('cmi.score.scaled', '1.5')).toBe('false');
    expect(api.GetLastError()).toBe('407'); // out of range
    expect(api.SetValue('cmi.score.scaled', 'high')).toBe('false');
    expect(api.GetLastError()).toBe('406'); // type mismatch
    expect(api.SetValue('cmi.score.scaled', '-0.25')).toBe('true');
    expect(api.SetValue('cmi.completion_status', 'done')).toBe('false');
    expect(api.GetLastError()).toBe('406');
    expect(api.SetValue('cmi.completion_status', 'completed')).toBe('true');
    expect(api.SetValue('cmi.learner_id', 'x')).toBe('false');
    expect(api.GetLastError()).toBe('404'); // read only
    expect(api.GetValue('cmi.session_time')).toBe('');
    expect(api.GetLastError()).toBe('405'); // write only
  });

  it('returns 403 for supported-but-unset elements and defaults otherwise', () => {
    const api = createScorm2004Api({ learnerName: 'Jamil Rahman' });
    api.Initialize('');
    expect(api.GetValue('cmi._version')).toBe('1.0');
    expect(api.GetValue('cmi.completion_status')).toBe('unknown');
    expect(api.GetValue('cmi.learner_name')).toBe('Jamil Rahman');
    expect(api.GetValue('cmi.score.raw')).toBe('');
    expect(api.GetLastError()).toBe('403');
    expect(api.GetErrorString('404')).toBe('Data Model Element Is Read Only');
  });

  it('enforces the 64k suspend_data limit with 351', () => {
    const api = createScorm2004Api();
    api.Initialize('');
    expect(api.SetValue('cmi.suspend_data', 'x'.repeat(64000))).toBe('true');
    expect(api.SetValue('cmi.suspend_data', 'x'.repeat(64001))).toBe('false');
    expect(api.GetLastError()).toBe('351');
  });

  it('accumulates ISO 8601 session_time into total_time on terminate', () => {
    const commits: Record<string, string>[] = [];
    const api = createScorm2004Api({
      initialCmi: { 'cmi.total_time': 'PT1H' },
      onCommit: (cmi) => commits.push(cmi),
    });
    api.Initialize('');
    api.SetValue('cmi.session_time', 'PT30M5S');
    api.Terminate('');
    expect(commits[0]['cmi.total_time']).toBe('PT1H30M5S');
  });

  it('emits status changes from completion, success and score', () => {
    const changes: ScormStatusChange[] = [];
    const api = createScorm2004Api({ onStatusChange: (change) => changes.push(change) });
    api.Initialize('');
    api.SetValue('cmi.score.raw', '87');
    api.SetValue('cmi.success_status', 'passed');
    api.SetValue('cmi.completion_status', 'completed');
    expect(changes).toEqual([
      { completed: false, passed: undefined, scoreRaw: 87 },
      { completed: false, passed: true, scoreRaw: 87 },
      { completed: true, passed: true, scoreRaw: 87 },
    ]);
  });
});

describe('api discovery install/remove', () => {
  it('installs and removes API / API_1484_11 on the target window', () => {
    const target = {} as Window;
    const api12 = createScorm12Api();
    const api2004 = createScorm2004Api();

    installScormApi(target, api12, '1.2');
    expect(getInstalledScormApi(target, '1.2')).toBe(api12);
    expect((target as Window & { API?: unknown }).API).toBe(api12);

    installScormApi(target, api2004, '2004');
    expect((target as Window & { API_1484_11?: unknown }).API_1484_11).toBe(api2004);

    removeScormApi(target, '1.2');
    expect(getInstalledScormApi(target, '1.2')).toBeUndefined();
    removeScormApi(target, '2004');
    expect(getInstalledScormApi(target, '2004')).toBeUndefined();
    expect(SCORM_GLOBAL_NAMES['1.2']).toBe('API');
    expect(SCORM_GLOBAL_NAMES['2004']).toBe('API_1484_11');
  });
});
