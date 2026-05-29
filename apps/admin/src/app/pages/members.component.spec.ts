import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment, TenantService } from '@forge/auth';
import { MemberRepository } from '@forge/data-access';
import { MemberAdminService } from '@forge/tenant';
import { MembersComponent } from './members.component';

const testEnv: ForgeEnvironment = {
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
};

describe('MembersComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MembersComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        { provide: MemberRepository, useValue: { listActive: async () => [] } },
        {
          provide: MemberAdminService,
          useValue: {
            inviteMember: jest.fn(),
            setMemberRole: jest.fn(),
            deactivateMember: jest.fn(),
          },
        },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(MembersComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the Members heading', () => {
    const fixture = TestBed.createComponent(MembersComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Members');
  });

  it('renders the invite form', () => {
    const fixture = TestBed.createComponent(MembersComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Invite Member');
  });
});
