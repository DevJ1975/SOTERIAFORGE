import { TestBed } from '@angular/core/testing';
import type { Statement } from '@forge/standards';
import { ForgeXapiEmitter } from './xapi-emitter';

function fakeStatement(): Statement {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    actor: {
      objectType: 'Agent',
      account: { homePage: 'https://soteriaforge.com', name: 'user-1' },
    },
    verb: { id: 'http://adlnet.gov/expapi/verbs/progressed', display: { 'en-US': 'progressed' } },
    object: {
      objectType: 'Activity',
      id: 'https://soteriaforge.com/xapi/activities/lesson/acme/c1/l1',
    },
    context: {
      extensions: { 'https://soteriaforge.com/xapi/extensions/tenantId': 'acme' },
    },
    timestamp: '2026-06-11T12:00:00.000Z',
    version: '1.0.3',
  };
}

describe('ForgeXapiEmitter', () => {
  it('constructs without Firebase providers and silently no-ops on emit', () => {
    TestBed.configureTestingModule({});
    const emitter = TestBed.inject(ForgeXapiEmitter);
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    try {
      expect(() => emitter.emit([fakeStatement()])).not.toThrow();
      expect(debugSpy).toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });

  it('does nothing at all for an empty batch', () => {
    TestBed.configureTestingModule({});
    const emitter = TestBed.inject(ForgeXapiEmitter);
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    try {
      expect(() => emitter.emit([])).not.toThrow();
      expect(debugSpy).not.toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });
});
