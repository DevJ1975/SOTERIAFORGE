import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { GamificationAdminApi } from '@assurance/lms-core';
import { MemberAdminService } from '@assurance/tenant';
import { CohortsComponent } from './cohorts.component';

const spring = { id: 'c1', name: 'Spring 2026', startsOn: '2026-03-01', endsOn: null };
const tree = {
  ...spring,
  sections: [
    {
      id: 's1',
      name: 'Day shift',
      crews: [
        { id: 'k1', name: 'Alpha', members: [{ id: 'm1', displayName: 'Alice', isLead: true }] },
        { id: 'k2', name: 'Bravo', members: [] },
      ],
    },
  ],
};
const members = [
  { id: 'm1', displayName: 'Alice', email: 'a@x.test', role: 'learner', status: 'active' },
  { id: 'm2', displayName: '', email: 'b@x.test', role: 'learner', status: 'active' },
  { id: 'm3', displayName: 'Ivy', email: 'i@x.test', role: 'instructor', status: 'active' },
];

interface Internals {
  newName: string;
  newSection: string;
  createCohort(): Promise<void>;
  open(c: typeof spring): Promise<void>;
  addSection(): Promise<void>;
  setCrewDraft(id: string, v: string): void;
  addCrew(id: string): Promise<void>;
  toggleEdit(crew: (typeof tree.sections)[0]['crews'][0]): void;
  toggleLearner(id: string): void;
  saveRoster(crew: (typeof tree.sections)[0]['crews'][0]): Promise<void>;
  learners(): unknown[];
  actionError(): string | null;
  createError(): string | null;
  editing(): string | null;
}

describe('CohortsComponent', () => {
  const api = {
    cohorts: jest.fn(),
    createCohort: jest.fn(),
    cohort: jest.fn(),
    createSection: jest.fn(),
    createCrew: jest.fn(),
    setCrewMembers: jest.fn(),
  };
  const memberAdmin = { listMembers: jest.fn() };

  async function render() {
    const fixture = TestBed.createComponent(CohortsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, comp: fixture.componentInstance as unknown as Internals };
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    api.cohorts.mockResolvedValue([spring]);
    api.cohort.mockResolvedValue(tree);
    api.createCohort.mockResolvedValue(spring);
    api.createSection.mockResolvedValue({ id: 's2', name: 'Night' });
    api.createCrew.mockResolvedValue({ id: 'k3', name: 'Charlie' });
    api.setCrewMembers.mockResolvedValue({ id: 'k2', name: 'Bravo' });
    memberAdmin.listMembers.mockResolvedValue(members);
    await TestBed.configureTestingModule({
      imports: [CohortsComponent],
      providers: [
        { provide: GamificationAdminApi, useValue: api },
        { provide: MemberAdminService, useValue: memberAdmin },
      ],
    }).compileComponents();
  });

  it('renders the heading, the New Cohort form and the loaded cohorts', async () => {
    const { fixture } = await render();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Cohorts & crews');
    expect(text).toContain('New Cohort');
    expect(text).toContain('Spring 2026');
  });

  it('creates a cohort, reloads and opens it with roster counts', async () => {
    const { fixture, comp } = await render();
    comp.newName = '  Spring 2026 ';
    await comp.createCohort();
    expect(api.createCohort).toHaveBeenCalledWith({
      name: 'Spring 2026',
      startsOn: null,
      endsOn: null,
    });
    expect(api.cohorts).toHaveBeenCalledTimes(2);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1 sections · 2 crews · 1');
    expect(text).toContain('Alpha');
    expect(comp.learners()).toHaveLength(2);
  });

  it('adds a section and a crew then reloads the tree', async () => {
    const { comp } = await render();
    await comp.open(spring);
    comp.newSection = 'Night';
    await comp.addSection();
    expect(api.createSection).toHaveBeenCalledWith('c1', 'Night');
    comp.setCrewDraft('s1', 'Charlie');
    await comp.addCrew('s1');
    expect(api.createCrew).toHaveBeenCalledWith('s1', 'Charlie');
    expect(api.cohort).toHaveBeenCalledTimes(3);
  });

  it('assigns learners with checkboxes and keeps surviving leads', async () => {
    const { fixture, comp } = await render();
    await comp.open(spring);
    const alpha = tree.sections[0].crews[0];
    comp.toggleEdit(alpha);
    comp.toggleLearner('m2');
    fixture.detectChanges();
    const boxes = fixture.nativeElement.querySelectorAll('fieldset input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    await comp.saveRoster(alpha);
    expect(api.setCrewMembers).toHaveBeenCalledWith('k1', ['m1', 'm2'], ['m1']);
    expect(comp.editing()).toBeNull();
  });

  it('shows the API message when a roster save is refused and keeps the editor open', async () => {
    api.setCrewMembers.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { memberIds: ['Every member must be a learner in this organization.'] },
      }),
    );
    const { fixture, comp } = await render();
    await comp.open(spring);
    const bravo = tree.sections[0].crews[1];
    comp.toggleEdit(bravo);
    comp.toggleLearner('m1');
    await comp.saveRoster(bravo);
    fixture.detectChanges();
    expect(comp.actionError()).toContain('Every member must be a learner');
    expect(comp.editing()).toBe('k2');
    expect(fixture.nativeElement.textContent).toContain('Every member must be a learner');
  });

  it('shows the error when cohorts fail to load', async () => {
    api.cohorts.mockRejectedValue(new Error('down'));
    const { fixture } = await render();
    expect(fixture.nativeElement.textContent).toContain('Failed to load cohorts');
  });

  it('shows a duplicate-name error from create', async () => {
    api.createCohort.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { name: ['A cohort with this name already exists.'] },
      }),
    );
    const { fixture, comp } = await render();
    comp.newName = 'Spring 2026';
    await comp.createCohort();
    fixture.detectChanges();
    expect(comp.createError()).toBe('name: A cohort with this name already exists.');
  });
});
