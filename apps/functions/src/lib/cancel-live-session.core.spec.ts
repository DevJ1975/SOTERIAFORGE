import { cancelLiveSessionCore } from './cancel-live-session.core';
import { makeFakes } from './fakes';

const instructorToken = { uid: 'inst-1', role: 'instructor', tenantId: 'acme' };
const learnerToken = { uid: 'learner-1', role: 'learner', tenantId: 'acme' };
const otherTenantAdmin = { uid: 'admin-2', role: 'tenant_admin', tenantId: 'other' };

function seedSession(deps: ReturnType<typeof makeFakes>, id = 's-1') {
  deps.db.liveSessions.set(`acme/${id}`, {
    id,
    tenantId: 'acme',
    status: 'scheduled',
    meetingId: 'zoom-1',
  });
}

describe('cancelLiveSessionCore', () => {
  it('cancels: flips status to canceled and deletes the Zoom meeting', async () => {
    const deps = makeFakes();
    seedSession(deps);

    const result = await cancelLiveSessionCore(deps, instructorToken, { sessionId: 's-1' });

    expect(result).toEqual({ sessionId: 's-1', status: 'canceled' });
    expect(deps.db.liveSessions.get('acme/s-1')).toMatchObject({ status: 'canceled' });
    expect(deps.zoom.deleted).toEqual(['zoom-1']);
  });

  it('proceeds even when Zoom deletion fails (best-effort)', async () => {
    const deps = makeFakes();
    seedSession(deps);
    deps.zoom.deleteMeeting = async () => {
      throw new Error('zoom down');
    };
    const result = await cancelLiveSessionCore(deps, instructorToken, { sessionId: 's-1' });
    expect(result.status).toBe('canceled');
    expect(deps.db.liveSessions.get('acme/s-1')).toMatchObject({ status: 'canceled' });
  });

  it('denies a learner with permission-denied', async () => {
    const deps = makeFakes();
    seedSession(deps);
    await expect(
      cancelLiveSessionCore(deps, learnerToken, { sessionId: 's-1' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('denies an admin from another tenant', async () => {
    const deps = makeFakes();
    seedSession(deps);
    await expect(
      cancelLiveSessionCore(deps, otherTenantAdmin, { sessionId: 's-1' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('fails not-found when the session does not exist', async () => {
    const deps = makeFakes();
    await expect(
      cancelLiveSessionCore(deps, instructorToken, { sessionId: 'ghost' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('audits the cancellation', async () => {
    const deps = makeFakes();
    seedSession(deps);
    await cancelLiveSessionCore(deps, instructorToken, { sessionId: 's-1' });
    expect(deps.audit.events.filter((e) => e.action === 'cancelLiveSession')).toHaveLength(1);
  });
});
