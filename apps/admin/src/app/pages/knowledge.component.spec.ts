import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { TenantService } from '@assurance/auth';
import { CoachApi, IngestService } from '@assurance/ai-tutor';
import { KnowledgeComponent } from './knowledge.component';

describe('Course knowledge management', () => {
  let fixture: ComponentFixture<KnowledgeComponent>;
  const tenant = signal('acme');
  const source = {
    id: 's1',
    courseId: 'c1',
    title: 'Gardening guide',
    chunkCount: 2,
    updatedAt: '',
    agent: 'general',
    referenceUrl: '',
    edition: '',
  };
  const api = {
    courses: jest.fn(),
    profiles: jest.fn(),
    sources: jest.fn(),
    remove: jest.fn(),
  };
  const ingest = jest.fn();

  beforeEach(async () => {
    tenant.set('acme');
    api.courses.mockReset().mockResolvedValue([{ id: 'c1', title: 'Gardening' }]);
    api.profiles.mockReset().mockResolvedValue([
      { id: 'general', title: 'Course Tutor', description: '', references: [] },
      {
        id: 'workplace-ai',
        title: 'AI for the Workplace',
        description: '',
        references: [
          {
            id: 'ai-rmf',
            title: 'NIST AI RMF',
            url: 'https://www.nist.gov/itl/ai-risk-management-framework',
            edition: 'AI RMF 1.0 (2023)',
            status: 'pending_instructor_review',
            checkedOn: '2026-10-27',
          },
        ],
      },
      { id: 'cybersecurity-ai', title: 'AI in Cybersecurity', description: '', references: [] },
    ]);
    api.sources.mockReset().mockResolvedValue([source]);
    api.remove.mockReset().mockResolvedValue(undefined);
    ingest.mockReset().mockResolvedValue({ ok: true, chunks: 2 });
    await TestBed.configureTestingModule({
      imports: [KnowledgeComponent],
      providers: [
        provideRouter([]),
        { provide: TenantService, useValue: { tenantId: tenant } },
        { provide: CoachApi, useValue: api },
        { provide: IngestService, useValue: { ingest } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(KnowledgeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function field(selector: string, value: string): void {
    const element = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
    element.value = value;
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input'));
    fixture.detectChanges();
  }

  function approve(): void {
    const checkbox = fixture.nativeElement.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();
  }

  async function submit(): Promise<void> {
    (fixture.nativeElement.querySelector('p-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('lists Django sources with their course names', () => {
    expect(fixture.nativeElement.textContent).toContain('AI Knowledge Base');
    expect(fixture.nativeElement.textContent).toContain('Gardening guide');
    expect(fixture.nativeElement.textContent).toContain('Gardening');
    expect(api.sources).toHaveBeenCalledTimes(1);
  });

  it('requires explicit course and instructor approval before ingestion', async () => {
    field('[aria-label="Source title"]', 'New guide');
    field('[aria-label="Source text"]', 'Learner-facing material');
    await submit();
    expect(ingest).not.toHaveBeenCalled();
    field('[aria-label="Source course"]', 'c1');
    approve();
    await submit();
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: 'c1',
        label: 'New guide',
        text: 'Learner-facing material',
        approved: true,
      }),
    );
    expect(fixture.nativeElement.textContent).toContain('2 chunks created');
  });

  it('surfaces inference errors without reporting success', async () => {
    ingest.mockRejectedValue(new Error('Local inference unavailable'));
    field('[aria-label="Source title"]', 'Guide');
    field('[aria-label="Source text"]', 'Material');
    field('[aria-label="Source course"]', 'c1');
    approve();
    await submit();
    expect(fixture.nativeElement.textContent).toContain('Local inference unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('Ingested successfully');
  });

  it('replaces a source under the same ID and requires renewed approval', async () => {
    const replace = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => (button as HTMLButtonElement).textContent?.trim() === 'Replace',
    ) as HTMLButtonElement;
    replace.click();
    fixture.detectChanges();
    field('[aria-label="Source text"]', 'Updated guide');
    approve();
    await submit();
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 's1', text: 'Updated guide' }),
    );
  });

  it('deletes through Django and reloads the source list', async () => {
    const remove = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => (button as HTMLButtonElement).textContent?.trim() === 'Delete',
    ) as HTMLButtonElement;
    remove.click();
    await fixture.whenStable();
    expect(api.remove).toHaveBeenCalledWith('s1');
    expect(api.sources).toHaveBeenCalledTimes(2);
  });

  it('clears sources when the acting tenant changes', async () => {
    api.sources.mockResolvedValue([]);
    tenant.set('other');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Gardening guide');
  });

  it('keeps public references pending and prepares, but never auto-ingests, a candidate', async () => {
    expect(fixture.nativeElement.textContent).toContain('pending instructor review');
    expect(ingest).not.toHaveBeenCalled();
    const prepare = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => (button as HTMLButtonElement).textContent?.trim() === 'Prepare for review',
    ) as HTMLButtonElement;
    prepare.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement.querySelector('[aria-label="Source agent"]') as HTMLSelectElement)
        .value,
    ).toBe('workplace-ai');
    expect(
      (
        fixture.nativeElement.querySelector(
          '[aria-label="Source reference URL"]',
        ) as HTMLInputElement
      ).value,
    ).toBe('https://www.nist.gov/itl/ai-risk-management-framework');
    expect(
      (fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement).checked,
    ).toBe(false);
    await submit();
    expect(ingest).not.toHaveBeenCalled();
    field('[aria-label="Source course"]', 'c1');
    field('[aria-label="Source text"]', 'Reviewed learner-facing excerpt');
    approve();
    await submit();
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'workplace-ai',
        referenceUrl: 'https://www.nist.gov/itl/ai-risk-management-framework',
        edition: 'AI RMF 1.0 (2023)',
        approved: true,
        courseId: 'c1',
      }),
    );
  });
});
