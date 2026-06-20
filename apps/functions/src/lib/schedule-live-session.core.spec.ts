import { makeFakes } from './fakes';
import { scheduleLiveSessionCore } from './schedule-live-session.core';

const instructorToken = { uid: 'inst-1', role: 'instructor', tenantId: 'acme' };
const adminToken = { uid: 'admin-1', role: 'tenant_admin', tenantId: 'acme' };
const learnerToken = { uid: 'learner-1', role: 'learner', tenantId: 'acme' };

const validInput = {
  title: 'Fire Safety Live',
  scheduledStart: '2026-07-01T15:00:00Z',
  durationMin: 60,
};

describe('scheduleLiveSessionCore', () => {
  it('schedules a session: joinUrl on the public doc, startUrl ONLY in private', async () => {
    const deps = makeFakes();

    const result = await scheduleLiveSessionCore(deps, instructorToken, validInput);

    expect(result.status).toBe('scheduled');
    expect(result.joinUrl).toBe('https://zoom.test/j/zoom-1');
    expect(result.sessionId).toBeTruthy();

    const publicDoc = deps.db.liveSessions.get(`acme/${result.sessionId}`);
    expect(publicDoc).toMatchObject({
      tenantId: 'acme',
      title: 'Fire Safety Live',
      type: 'meeting',
      status: 'scheduled',
      hostUid: 'inst-1',
      meetingId: 'zoom-1',
      joinUrl: 'https://zoom.test/j/zoom-1',
      passcode: 'pass-zoom-1',
    });
    // The sensitive start URL must NOT leak onto the learner-readable doc.
    expect(publicDoc && 'startUrl' in publicDoc).toBe(false);

    const privateDoc = deps.db.liveSessionPrivate.get(`acme/${result.sessionId}`);
    expect(privateDoc).toEqual({ startUrl: 'https://zoom.test/s/zoom-1' });
  });

  it('throws unavailable when the Zoom port is absent', async () => {
    const deps = makeFakes();
    deps.zoom = undefined as never;
    await expect(scheduleLiveSessionCore(deps, instructorToken, validInput)).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('denies a learner with permission-denied (no doc written)', async () => {
    const deps = makeFakes();
    await expect(scheduleLiveSessionCore(deps, learnerToken, validInput)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(deps.db.liveSessions.size).toBe(0);
    expect(deps.zoom.created).toHaveLength(0);
  });

  it('derives tenantId/hostUid from claims, ignoring request data', async () => {
    const deps = makeFakes();
    const result = await scheduleLiveSessionCore(deps, instructorToken, {
      ...validInput,
      // Attacker-supplied fields are ignored — input schema strips unknowns.
      tenantId: 'evil',
      hostUid: 'evil-uid',
    } as never);
    const doc = deps.db.liveSessions.get(`acme/${result.sessionId}`);
    expect(doc).toMatchObject({ tenantId: 'acme', hostUid: 'inst-1' });
    expect(deps.db.liveSessions.get(`evil/${result.sessionId}`)).toBeUndefined();
  });

  it('rejects invalid input with invalid-argument', async () => {
    const deps = makeFakes();
    await expect(
      scheduleLiveSessionCore(deps, instructorToken, { title: '', durationMin: 0 } as never),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('fails not-found when courseId references a missing course', async () => {
    const deps = makeFakes();
    await expect(
      scheduleLiveSessionCore(deps, adminToken, { ...validInput, courseId: 'nope' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('schedules against an existing course', async () => {
    const deps = makeFakes();
    deps.db.seedCourse('acme', 'c-1');
    const result = await scheduleLiveSessionCore(deps, adminToken, {
      ...validInput,
      courseId: 'c-1',
    });
    expect(deps.db.liveSessions.get(`acme/${result.sessionId}`)).toMatchObject({ courseId: 'c-1' });
  });

  it('creates a webinar when type is webinar', async () => {
    const deps = makeFakes();
    await scheduleLiveSessionCore(deps, adminToken, { ...validInput, type: 'webinar' });
    expect(deps.zoom.created[0]).toMatchObject({ type: 'webinar' });
  });

  it('audits the scheduling (best-effort)', async () => {
    const deps = makeFakes();
    const result = await scheduleLiveSessionCore(deps, instructorToken, validInput);
    const events = deps.audit.events.filter((e) => e.action === 'scheduleLiveSession');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorUid: 'inst-1',
      actorRole: 'instructor',
      tenantId: 'acme',
      target: result.sessionId,
    });
  });
});
