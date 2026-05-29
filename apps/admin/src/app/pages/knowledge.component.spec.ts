import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment, TenantService } from '@forge/auth';
import { KnowledgeRepository } from '@forge/data-access';
import { IngestService } from '@forge/ai-tutor';
import { KnowledgeComponent } from './knowledge.component';
import type { KnowledgeSource } from '@forge/shared';

// Polyfill crypto.randomUUID for jsdom
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'test-uuid-knowledge' },
  configurable: true,
});

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

const sampleSource: KnowledgeSource = {
  id: 'src-1',
  tenantId: 'acme',
  title: 'Biology 101',
  kind: 'upload',
  status: 'ready',
  chunkCount: 8,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('KnowledgeComponent — list', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KnowledgeComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        {
          provide: KnowledgeRepository,
          useValue: { list: async () => [sampleSource], set: jest.fn() },
        },
        {
          provide: IngestService,
          useValue: { ingest: jest.fn().mockResolvedValue({ ok: true, chunks: 8 }) },
        },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(KnowledgeComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the AI Knowledge Base heading', () => {
    const fixture = TestBed.createComponent(KnowledgeComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('AI Knowledge Base');
  });

  it('renders the Add Source form', async () => {
    const fixture = TestBed.createComponent(KnowledgeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Add Source');
  });

  it('loads and displays knowledge sources from the repository', async () => {
    const fixture = TestBed.createComponent(KnowledgeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Biology 101');
  });
});

describe('KnowledgeComponent — create and ingest', () => {
  let setMock: jest.Mock;
  let ingestMock: jest.Mock;

  beforeEach(async () => {
    setMock = jest.fn().mockResolvedValue(undefined);
    ingestMock = jest.fn().mockResolvedValue({ ok: true, chunks: 5 });

    await TestBed.configureTestingModule({
      imports: [KnowledgeComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        {
          provide: KnowledgeRepository,
          useValue: { list: async () => [], set: setMock },
        },
        { provide: IngestService, useValue: { ingest: ingestMock } },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('calls KnowledgeRepository.set and IngestService.ingest when adding a source', async () => {
    const fixture = TestBed.createComponent(KnowledgeComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const ci = fixture.componentInstance as unknown as Record<string, unknown>;
    ci['newTitle'] = 'Safety Procedures';
    ci['newKind'] = 'upload';
    ci['newText'] = 'This document covers safety procedures.';

    await (ci['addSource'] as () => Promise<void>).call(fixture.componentInstance);

    expect(setMock).toHaveBeenCalledWith(
      'acme',
      expect.objectContaining({
        title: 'Safety Procedures',
        tenantId: 'acme',
        kind: 'upload',
        status: 'pending',
      }),
    );

    expect(ingestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'acme',
        sourceId: 'test-uuid-knowledge',
        text: 'This document covers safety procedures.',
        label: 'Safety Procedures',
      }),
    );
  });

  it('shows ingest result after successful submission', async () => {
    const fixture = TestBed.createComponent(KnowledgeComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const ci = fixture.componentInstance as unknown as Record<string, unknown>;
    ci['newTitle'] = 'Test Doc';
    ci['newText'] = 'Some text content here.';

    await (ci['addSource'] as () => Promise<void>).call(fixture.componentInstance);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('5 chunks created');
  });
});
