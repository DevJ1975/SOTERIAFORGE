import { TestBed } from '@angular/core/testing';
import { ForgeAdminApi, toFriendlyFunctionsError } from './admin-api.service';

// Pure error-mapping tests: no Firebase instances, no network. The shapes
// mimic firebase/functions HttpsError ({ code: 'functions/<code>', message }).
describe('toFriendlyFunctionsError', () => {
  function httpsError(code: string, message = 'server detail'): unknown {
    const err = new Error(message);
    (err as Error & { code: string }).code = code;
    return err;
  }

  it.each([
    ['functions/permission-denied', 'You do not have permission to perform this action.'],
    [
      'functions/unauthenticated',
      'You must be signed in to do that — please sign in and try again.',
    ],
    [
      'functions/invalid-argument',
      'Some of the submitted values were invalid. Check the form and try again.',
    ],
    ['functions/not-found', 'The requested record could not be found.'],
    ['functions/already-exists', 'A record with that identifier already exists.'],
    ['functions/deadline-exceeded', 'The request timed out. Please try again.'],
    ['functions/resource-exhausted', 'Too many requests — wait a moment and try again.'],
    ['functions/internal', 'Something went wrong on the server. Please try again.'],
    ['functions/unknown', 'Something went wrong. Please try again.'],
  ])('maps %s to friendly copy', (code, expected) => {
    expect(toFriendlyFunctionsError(httpsError(code)).message).toBe(expected);
  });

  it('mentions the emulators for unavailable (local dev hint)', () => {
    expect(toFriendlyFunctionsError(httpsError('functions/unavailable')).message).toContain(
      'emulators',
    );
  });

  it('accepts bare codes without the functions/ prefix', () => {
    expect(toFriendlyFunctionsError(httpsError('permission-denied')).message).toBe(
      'You do not have permission to perform this action.',
    );
  });

  it('falls back to the original Error message for unmapped codes', () => {
    expect(toFriendlyFunctionsError(httpsError('functions/no-such-code', 'kaboom')).message).toBe(
      'kaboom',
    );
  });

  it('falls back to generic copy for non-Error values', () => {
    expect(toFriendlyFunctionsError('strings happen').message).toBe(
      'Something went wrong. Please try again.',
    );
    expect(toFriendlyFunctionsError(null).message).toBe('Something went wrong. Please try again.');
    expect(toFriendlyFunctionsError({ code: 42 }).message).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('always returns a plain Error (never rethrows the original)', () => {
    const original = httpsError('functions/internal');
    const mapped = toFriendlyFunctionsError(original);
    expect(mapped).toBeInstanceOf(Error);
    expect(mapped).not.toBe(original);
  });
});

describe('ForgeAdminApi', () => {
  it('constructs without Firebase providers and rejects calls descriptively', async () => {
    TestBed.configureTestingModule({});
    const api = TestBed.inject(ForgeAdminApi);

    await expect(api.setUserRole({ uid: 'u1', role: 'learner', tenantId: 't1' })).rejects.toThrow(
      /Cloud Functions are not available/,
    );
    await expect(
      api.inviteMember({ email: 'a@b.co', role: 'learner', tenantId: 't1' }),
    ).rejects.toThrow(/Cloud Functions are not available/);
    await expect(api.provisionTenant({ id: 't2', name: 'Tenant Two' })).rejects.toThrow(
      /Cloud Functions are not available/,
    );
  });
});
