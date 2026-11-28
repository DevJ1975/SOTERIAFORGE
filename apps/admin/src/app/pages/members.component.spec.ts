import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import { MembersComponent } from './members.component';

const testEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  apiBaseUrl: 'http://api.test',
};

const alice = {
  id: 'm1',
  uid: 'm1',
  tenantId: 'acme',
  email: 'alice@example.com',
  displayName: 'Alice',
  role: 'learner',
  status: 'active',
};

interface Internals {
  inviteEmail: string;
  inviteRole: string | null;
  invite(): Promise<void>;
  changeRole(m: typeof alice, role: string): Promise<void>;
  deactivate(m: typeof alice): Promise<void>;
  reactivate(m: typeof alice): Promise<void>;
  exportData(m: typeof alice): Promise<void>;
  inviteLink(): string | null;
  actionError(): string | null;
}

describe('MembersComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MembersComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: testEnv },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function load(members: unknown[] = []) {
    const fixture = TestBed.createComponent(MembersComponent);
    fixture.detectChanges();
    http.expectOne('http://api.test/api/members').flush(members);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, comp: fixture.componentInstance as unknown as Internals };
  }

  it('lists members from the API and renders the invite form', async () => {
    const { fixture } = await load([alice]);
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Members');
    expect(text).toContain('Invite Member');
    expect(text).toContain('alice@example.com');
  });

  it('invites a member and shows the returned invite link', async () => {
    const { comp } = await load();
    comp.inviteEmail = 'bob@example.com';
    comp.inviteRole = 'learner';
    const done = comp.invite();
    const req = http.expectOne('http://api.test/api/members/invite');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      email: 'bob@example.com',
      role: 'learner',
      displayName: undefined,
    });
    req.flush({ member: alice, inviteLink: 'https://acme.test/accept-invite?token=t' });
    await Promise.resolve();
    http.expectOne('http://api.test/api/members').flush([alice]);
    await done;
    expect(comp.inviteLink()).toBe('https://acme.test/accept-invite?token=t');
  });

  it('changes a role with PATCH members/{id}/role', async () => {
    const { comp } = await load([alice]);
    const done = comp.changeRole(alice, 'instructor');
    const req = http.expectOne('http://api.test/api/members/m1/role');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ role: 'instructor' });
    req.flush({ ...alice, role: 'instructor' });
    await Promise.resolve();
    http.expectOne('http://api.test/api/members').flush([]);
    await done;
  });

  it('deactivates and reactivates through the status endpoint', async () => {
    const { comp } = await load([alice]);
    for (const [fn, status] of [
      [() => comp.deactivate(alice), 'deactivated'],
      [() => comp.reactivate(alice), 'active'],
    ] as const) {
      const done = fn();
      const req = http.expectOne('http://api.test/api/members/m1/status');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ status });
      req.flush({ ...alice, status });
      await Promise.resolve();
      http.expectOne('http://api.test/api/members').flush([alice]);
      await done;
    }
  });

  it('exports a member as a JSON download', async () => {
    const create = jest.fn(() => 'blob:x');
    const revoke = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true });
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const { comp } = await load([alice]);
    const done = comp.exportData(alice);
    http.expectOne('http://api.test/api/members/m1/export').flush({ member: alice });
    await done;
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('keeps the table and shows the API message when a role change is refused', async () => {
    const { fixture, comp } = await load([alice]);
    const done = comp.changeRole(alice, 'instructor');
    http
      .expectOne('http://api.test/api/members/m1/role')
      .flush(
        { detail: "You can't change your own role." },
        { status: 403, statusText: 'Forbidden' },
      );
    await Promise.resolve();
    http.expectOne('http://api.test/api/members').flush([alice]);
    await done;
    fixture.detectChanges();
    expect(comp.actionError()).toBe("You can't change your own role.");
    expect(fixture.nativeElement.textContent).toContain('alice@example.com');
  });
});
