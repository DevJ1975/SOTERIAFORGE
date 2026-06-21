/**
 * Unit tests for ConnectivityService (MO-04).
 *
 * jsdom provides `window` + `navigator` and supports dispatching `online` /
 * `offline` events, so the signal-update path is fully exercisable. We toggle
 * `navigator.onLine` via Object.defineProperty before construction to assert the
 * initial value, and dispatch events to assert reactive updates.
 */
import { TestBed } from '@angular/core/testing';
import { ConnectivityService } from './connectivity.service';

function setNavigatorOnLine(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

describe('ConnectivityService', () => {
  afterEach(() => {
    setNavigatorOnLine(true);
    TestBed.resetTestingModule();
  });

  it('initialises online from navigator.onLine (true)', () => {
    setNavigatorOnLine(true);
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(ConnectivityService);
    expect(svc.online()).toBe(true);
    expect(svc.offline()).toBe(false);
  });

  it('initialises online from navigator.onLine (false)', () => {
    setNavigatorOnLine(false);
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(ConnectivityService);
    expect(svc.online()).toBe(false);
    expect(svc.offline()).toBe(true);
  });

  it('updates to offline when the window fires an offline event', () => {
    setNavigatorOnLine(true);
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(ConnectivityService);
    expect(svc.online()).toBe(true);

    window.dispatchEvent(new Event('offline'));
    expect(svc.online()).toBe(false);
  });

  it('updates back to online when the window fires an online event', () => {
    setNavigatorOnLine(false);
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(ConnectivityService);
    expect(svc.online()).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(svc.online()).toBe(true);
  });
});
