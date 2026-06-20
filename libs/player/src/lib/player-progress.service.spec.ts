import { TestBed } from '@angular/core/testing';
import { ModuleCompletionService } from '@assurance/lms-core';
import { XapiClient } from '@assurance/standards';
import { PlayerProgressService, type PlayerContext } from './player-progress.service';
import type { Module } from '@assurance/shared';

const testModule: Module = {
  id: 'mod-1',
  courseId: 'course-1',
  tenantId: 'tenant-1',
  title: 'Intro',
  order: 1,
  contentType: 'video',
  externalUrl: 'https://example.com/v.mp4',
  xpReward: 0,
  badgeRefs: [],
  completion: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const ctx: PlayerContext = {
  tenantId: 'tenant-1',
  courseId: 'course-1',
  module: testModule,
  uid: 'user-1',
};

describe('PlayerProgressService — recordCompletion (MO-10)', () => {
  const completeWithOutbox = jest.fn();
  const send = jest.fn().mockResolvedValue(undefined);
  const buildStatement = jest.fn().mockReturnValue({ context: {} });

  beforeEach(() => {
    completeWithOutbox.mockReset();
    send.mockClear();
    buildStatement.mockClear();
    TestBed.configureTestingModule({
      providers: [
        PlayerProgressService,
        { provide: ModuleCompletionService, useValue: { completeWithOutbox } },
        { provide: XapiClient, useValue: { buildStatement, send } },
      ],
    });
  });

  it('emits the xAPI completed statement when the completion is confirmed', async () => {
    completeWithOutbox.mockResolvedValue({ confirmed: true, durable: true });
    const svc = TestBed.inject(PlayerProgressService);

    await svc.recordCompletion(ctx, 90);

    expect(completeWithOutbox).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      courseId: 'course-1',
      moduleId: 'mod-1',
      score: 90,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('emits the xAPI completed statement when the completion is durably queued offline', async () => {
    completeWithOutbox.mockResolvedValue({ confirmed: false, durable: true });
    const svc = TestBed.inject(PlayerProgressService);

    await svc.recordCompletion(ctx);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does NOT emit the xAPI completed statement when the completion is not durable (no divergence)', async () => {
    completeWithOutbox.mockResolvedValue({ confirmed: false, durable: false });
    const svc = TestBed.inject(PlayerProgressService);

    await svc.recordCompletion(ctx);

    expect(send).not.toHaveBeenCalled();
  });
});
