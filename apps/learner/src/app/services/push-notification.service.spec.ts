// Mock @angular/fire so importing the service under jsdom doesn't pull Firebase's
// Node entry, and so we can drive token/permission/registration outcomes.
const callableImpl = jest.fn();
jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: (_fns: unknown, name: string) => {
    return (data: unknown) => callableImpl(name, data);
  },
}));

const isSupportedMock = jest.fn<Promise<boolean>, []>();
const getTokenMock = jest.fn();
const deleteTokenMock = jest.fn();
jest.mock('@angular/fire/messaging', () => ({
  Messaging: class Messaging {},
  isSupported: () => isSupportedMock(),
  getToken: (...args: unknown[]) => getTokenMock(...args),
  deleteToken: (...args: unknown[]) => deleteTokenMock(...args),
}));

import { TestBed } from '@angular/core/testing';
import { Functions } from '@angular/fire/functions';
import { Messaging } from '@angular/fire/messaging';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import { PushNotificationService } from './push-notification.service';

const baseEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  firebase: {
    apiKey: 'x',
    authDomain: 'x',
    projectId: 'x',
    storageBucket: 'x',
    messagingSenderId: 'x',
    appId: 'x',
  },
  fcmVapidKey: 'VAPID_PUBLIC_KEY',
};

interface SetupOpts {
  env?: Partial<AssuranceEnvironment>;
  withMessaging?: boolean;
  withFunctions?: boolean;
}

function setup(opts: SetupOpts = {}): PushNotificationService {
  const { env = {}, withMessaging = true, withFunctions = true } = opts;
  const providers: unknown[] = [{ provide: ASSURANCE_ENV, useValue: { ...baseEnv, ...env } }];
  if (withMessaging) providers.push({ provide: Messaging, useValue: {} });
  if (withFunctions) providers.push({ provide: Functions, useValue: {} });
  TestBed.configureTestingModule({ providers: providers as never });
  return TestBed.inject(PushNotificationService);
}

function setNotificationPermission(
  value: NotificationPermission | 'request-resolves-denied',
): void {
  const requestPermission = jest
    .fn()
    .mockResolvedValue(value === 'request-resolves-denied' ? 'denied' : value);
  (globalThis as unknown as { Notification: unknown }).Notification = {
    permission: value === 'request-resolves-denied' ? 'default' : value,
    requestPermission,
  };
}

function removeNotification(): void {
  delete (globalThis as unknown as { Notification?: unknown }).Notification;
}

describe('PushNotificationService (MO-11)', () => {
  beforeEach(() => {
    callableImpl.mockReset();
    isSupportedMock.mockReset();
    getTokenMock.mockReset();
    deleteTokenMock.mockReset();
    isSupportedMock.mockResolvedValue(true);
  });

  afterEach(() => {
    removeNotification();
    TestBed.resetTestingModule();
  });

  describe('canEnable() guards', () => {
    it('is false when the VAPID key is not configured', async () => {
      setNotificationPermission('default');
      const svc = setup({ env: { fcmVapidKey: undefined } });
      expect(await svc.canEnable()).toBe(false);
    });

    it('is false when Messaging is not provided (e.g. server)', async () => {
      setNotificationPermission('default');
      const svc = setup({ withMessaging: false });
      expect(await svc.canEnable()).toBe(false);
    });

    it('is false when Functions is unavailable', async () => {
      setNotificationPermission('default');
      const svc = setup({ withFunctions: false });
      expect(await svc.canEnable()).toBe(false);
    });

    it('is false when Notification is undefined (no browser support)', async () => {
      removeNotification();
      const svc = setup();
      expect(await svc.canEnable()).toBe(false);
    });

    it('is false when messaging isSupported() resolves false', async () => {
      setNotificationPermission('default');
      isSupportedMock.mockResolvedValue(false);
      const svc = setup();
      expect(await svc.canEnable()).toBe(false);
    });

    it('is true when everything is configured and supported', async () => {
      setNotificationPermission('default');
      const svc = setup();
      expect(await svc.canEnable()).toBe(true);
    });
  });

  describe('enableReminders()', () => {
    it('returns "not-configured" and registers nothing when preconditions fail', async () => {
      setNotificationPermission('default');
      const svc = setup({ env: { fcmVapidKey: undefined } });
      expect(await svc.enableReminders()).toBe('not-configured');
      expect(callableImpl).not.toHaveBeenCalled();
    });

    it('returns "permission-denied" when the user blocks the prompt', async () => {
      setNotificationPermission('request-resolves-denied');
      const svc = setup();
      expect(await svc.enableReminders()).toBe('permission-denied');
      expect(getTokenMock).not.toHaveBeenCalled();
      expect(callableImpl).not.toHaveBeenCalled();
    });

    it('registers the FCM token via the callable when permission is granted', async () => {
      setNotificationPermission('granted');
      getTokenMock.mockResolvedValue('tok-123');
      callableImpl.mockResolvedValue({ data: { ok: true } });
      const svc = setup();

      expect(await svc.enableReminders()).toBe('enabled');
      expect(getTokenMock).toHaveBeenCalledWith(expect.anything(), {
        vapidKey: 'VAPID_PUBLIC_KEY',
      });
      expect(callableImpl).toHaveBeenCalledWith('registerFcmToken', { token: 'tok-123' });
    });

    it('returns "error" (no throw) when token retrieval rejects', async () => {
      setNotificationPermission('granted');
      getTokenMock.mockRejectedValue(new Error('messaging/failed'));
      const svc = setup();
      await expect(svc.enableReminders()).resolves.toBe('error');
      expect(callableImpl).not.toHaveBeenCalled();
    });

    it('returns "error" when getToken resolves empty', async () => {
      setNotificationPermission('granted');
      getTokenMock.mockResolvedValue('');
      const svc = setup();
      expect(await svc.enableReminders()).toBe('error');
    });
  });

  describe('disableReminders()', () => {
    it('removes the token server-side and deletes it locally, never throwing', async () => {
      setNotificationPermission('granted');
      getTokenMock.mockResolvedValue('tok-123');
      callableImpl.mockResolvedValue({ data: { ok: true } });
      deleteTokenMock.mockResolvedValue(true);
      const svc = setup();

      await expect(svc.disableReminders()).resolves.toBeUndefined();
      expect(callableImpl).toHaveBeenCalledWith('registerFcmToken', {
        token: 'tok-123',
        remove: true,
      });
      expect(deleteTokenMock).toHaveBeenCalled();
    });

    it('no-ops gracefully when messaging is unavailable', async () => {
      const svc = setup({ withMessaging: false });
      await expect(svc.disableReminders()).resolves.toBeUndefined();
      expect(callableImpl).not.toHaveBeenCalled();
    });
  });
});
