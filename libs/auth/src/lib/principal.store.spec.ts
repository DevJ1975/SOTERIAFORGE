import { TestBed } from '@angular/core/testing';
import { Auth } from '@angular/fire/auth';
import { PrincipalStore } from './principal.store';

// Mock the Firebase Auth functional SDK so no network/providers are needed.
const signInMock = jest.fn();
const createUserMock = jest.fn();
jest.mock('@angular/fire/auth', () => ({
  Auth: new (jest.requireActual('@angular/core').InjectionToken)('forge.test.auth'),
  signInWithEmailAndPassword: (...args: unknown[]) => signInMock(...args),
  createUserWithEmailAndPassword: (...args: unknown[]) => createUserMock(...args),
  signOut: jest.fn(async () => undefined),
  onIdTokenChanged: jest.fn(),
}));

function makeStore() {
  TestBed.configureTestingModule({
    providers: [{ provide: Auth, useValue: { currentUser: null } }],
  });
  return TestBed.inject(PrincipalStore);
}

describe('PrincipalStore.signIn staggering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    signInMock.mockResolvedValue({ user: { uid: 'u1' } });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('awaits the stagger delay before calling Firebase, then signs in', async () => {
    const store = makeStore();
    const done = store.signIn('a@b.com', 'pw');

    // Stagger sleep is pending — Firebase must NOT have been called yet.
    await Promise.resolve();
    expect(signInMock).not.toHaveBeenCalled();

    // Drain the staggered timer; the sign-in then fires exactly once.
    await jest.runOnlyPendingTimersAsync();
    await done;

    expect(signInMock).toHaveBeenCalledTimes(1);
    expect(signInMock).toHaveBeenCalledWith(expect.anything(), 'a@b.com', 'pw');
  });

  it('retries a transient (retryable) failure and still resolves', async () => {
    const store = makeStore();
    signInMock
      .mockRejectedValueOnce({ code: 'too-many-requests' })
      .mockResolvedValueOnce({ user: { uid: 'u1' } });

    const done = store.signIn('a@b.com', 'pw');
    await jest.runAllTimersAsync();
    await done;

    expect(signInMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable failure', async () => {
    const store = makeStore();
    signInMock.mockRejectedValue({ code: 'auth/wrong-password' });

    const done = store.signIn('a@b.com', 'pw').catch((e) => e);
    await jest.runAllTimersAsync();
    const err = await done;

    expect(signInMock).toHaveBeenCalledTimes(1);
    expect(err).toEqual({ code: 'auth/wrong-password' });
  });

  it('signUp is not staggered (calls Firebase immediately)', async () => {
    const store = makeStore();
    createUserMock.mockResolvedValue({ user: { uid: 'u2' } });

    await store.signUp('new@b.com', 'pw');
    expect(createUserMock).toHaveBeenCalledTimes(1);
  });
});
