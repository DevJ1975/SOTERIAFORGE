import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type ApiBadgeDefinition, GamificationAdminApi } from '@assurance/lms-core';
import { MemberAdminService } from '@assurance/tenant';
import { BadgesComponent } from './badges.component';

const mission: ApiBadgeDefinition = {
  id: 'b1',
  key: 'first-lesson',
  name: 'First Lesson',
  description: '',
  icon: 'badge-recruit',
  kind: 'mission',
  rule: 'lessons_completed',
  target: 1,
  order: 0,
  active: true,
};
const credential: ApiBadgeDefinition = {
  ...mission,
  id: 'b2',
  key: 'cert',
  name: 'Forklift Certified',
  kind: 'credential',
  rule: 'manual',
  icon: 'badge-shield-check',
};

interface Internals {
  form: ApiBadgeDefinition;
  signOffMemberId: string | null;
  setKind(k: 'mission' | 'credential'): void;
  edit(b: ApiBadgeDefinition): void;
  save(): Promise<void>;
  setActive(b: ApiBadgeDefinition, a: boolean): Promise<void>;
  remove(b: ApiBadgeDefinition): Promise<void>;
  openSignOff(b: ApiBadgeDefinition): Promise<void>;
  award(): Promise<void>;
  formError(): string | null;
  actionError(): string | null;
  retireOffer(): ApiBadgeDefinition | null;
  signOffDone(): string | null;
  learners(): { id: string }[];
}

describe('BadgesComponent', () => {
  const api = {
    badges: jest.fn(),
    createBadge: jest.fn(),
    updateBadge: jest.fn(),
    deleteBadge: jest.fn(),
    awardBadge: jest.fn(),
  };
  const memberAdmin = { listMembers: jest.fn() };

  async function render() {
    const fixture = TestBed.createComponent(BadgesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, comp: fixture.componentInstance as unknown as Internals };
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    api.badges.mockResolvedValue([mission, { ...credential, active: false }]);
    api.createBadge.mockResolvedValue(mission);
    api.updateBadge.mockResolvedValue(mission);
    api.deleteBadge.mockResolvedValue(undefined);
    api.awardBadge.mockResolvedValue(undefined);
    memberAdmin.listMembers.mockResolvedValue([
      { id: 'm1', displayName: 'Alice', email: 'a@x.test', role: 'learner', status: 'active' },
      { id: 'm2', displayName: '', email: 'i@x.test', role: 'instructor', status: 'active' },
      { id: 'm3', displayName: 'Gone', email: 'g@x.test', role: 'learner', status: 'deactivated' },
    ]);
    await TestBed.configureTestingModule({
      imports: [BadgesComponent],
      providers: [
        { provide: GamificationAdminApi, useValue: api },
        { provide: MemberAdminService, useValue: memberAdmin },
      ],
    }).compileComponents();
  });

  it('renders the table with active and retired states', async () => {
    const { fixture } = await render();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('First Lesson');
    expect(text).toContain('Forklift Certified');
    expect(text).toContain('Active');
    expect(text).toContain('Retired');
    expect(text).toContain('New Badge');
  });

  it('hides the target for manual rules and locks credentials to manual', async () => {
    const { fixture, comp } = await render();
    expect(fixture.nativeElement.textContent).toContain('Target');
    comp.setKind('credential');
    expect(comp.form.rule).toBe('manual');
    // Template events mark the view dirty in the browser; do it by hand here.
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.badges__form').textContent).not.toContain(
      'Target',
    );
  });

  it('creates a badge through the API and reloads', async () => {
    const { comp } = await render();
    comp.form.key = ' first-lesson ';
    comp.form.name = 'First Lesson';
    comp.form.target = 3;
    await comp.save();
    expect(api.createBadge).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'first-lesson', name: 'First Lesson', target: 3 }),
    );
    expect(api.badges).toHaveBeenCalledTimes(2);
  });

  it('edits through PATCH and sends target 1 for a manual badge', async () => {
    const { comp } = await render();
    comp.edit({ ...credential, active: true, target: 9 });
    await comp.save();
    expect(api.updateBadge).toHaveBeenCalledWith(
      'b2',
      expect.objectContaining({ rule: 'manual', target: 1 }),
    );
    expect(api.createBadge).not.toHaveBeenCalled();
  });

  it('shows the API message when a credential is rejected', async () => {
    api.createBadge.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { rule: ['Credentials are signed off by an instructor (rule: manual).'] },
      }),
    );
    const { fixture, comp } = await render();
    comp.form.key = 'k';
    comp.form.name = 'N';
    await comp.save();
    fixture.detectChanges();
    expect(comp.formError()).toContain('Credentials are signed off by an instructor');
    expect(fixture.nativeElement.textContent).toContain('Credentials are signed off');
  });

  it('offers Retire when a delete is refused because members hold the badge', async () => {
    api.deleteBadge.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: ['Members have earned this badge. Retire it instead.'],
      }),
    );
    const { fixture, comp } = await render();
    await comp.remove(mission);
    fixture.detectChanges();
    expect(comp.actionError()).toBe('Members have earned this badge. Retire it instead.');
    expect(comp.retireOffer()?.id).toBe('b1');
    await comp.setActive(mission, false);
    expect(api.updateBadge).toHaveBeenCalledWith('b1', { active: false });
    expect(comp.retireOffer()).toBeNull();
  });

  it('signs off a manual badge for a chosen active learner', async () => {
    const { fixture, comp } = await render();
    await comp.openSignOff({ ...credential, active: true });
    fixture.detectChanges();
    expect(comp.learners().map((m) => m.id)).toEqual(['m1']);
    expect(fixture.nativeElement.textContent).toContain('Sign off: Forklift Certified');
    comp.signOffMemberId = 'm1';
    await comp.award();
    expect(api.awardBadge).toHaveBeenCalledWith('b2', 'm1');
    expect(comp.signOffDone()).toBe('Forklift Certified signed off for Alice.');
  });

  it('shows the error when badges fail to load', async () => {
    api.badges.mockRejectedValue(new Error('down'));
    const { fixture } = await render();
    expect(fixture.nativeElement.textContent).toContain('Failed to load badges');
  });
});
