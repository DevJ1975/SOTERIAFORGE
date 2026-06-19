import { auditEvent, buildAuditEvent, recordAuditEvent, type AuditLogPort } from './audit-log';
import { FakeAuditLogPort } from './fakes';

const NOW = new Date('2026-01-02T03:04:05.678Z');

describe('buildAuditEvent', () => {
  it('stamps a server ISO timestamp and validates against the schema', () => {
    const event = buildAuditEvent(
      { actorUid: 'u1', actorRole: 'superadmin', action: 'provisionTenant', target: 'acme' },
      NOW,
    );
    expect(event).not.toBeNull();
    expect(event?.timestamp).toBe(NOW.toISOString());
    // The persisted shape must round-trip through the schema.
    expect(() => auditEvent.parse(event)).not.toThrow();
  });

  it("normalizes a missing actor uid to 'unknown'", () => {
    expect(buildAuditEvent({ action: 'setUserRole' }, NOW)?.actorUid).toBe('unknown');
    expect(buildAuditEvent({ actorUid: '', action: 'setUserRole' }, NOW)?.actorUid).toBe('unknown');
  });

  it('drops undefined optional fields (Firestore rejects undefined values)', () => {
    const event = buildAuditEvent({ actorUid: 'u1', action: 'setUserRole' }, NOW);
    expect(event).not.toBeNull();
    expect('tenantId' in (event as object)).toBe(false);
    expect('target' in (event as object)).toBe(false);
    expect('actorRole' in (event as object)).toBe(false);
  });

  it('retains tenantId, target and metadata when supplied', () => {
    const event = buildAuditEvent(
      {
        actorUid: 'u1',
        actorRole: 'tenant_admin',
        tenantId: 'acme',
        action: 'inviteMember',
        target: 'u2',
        metadata: { role: 'learner', email: 'x@acme.test' },
      },
      NOW,
    );
    expect(event).toMatchObject({
      actorUid: 'u1',
      actorRole: 'tenant_admin',
      tenantId: 'acme',
      action: 'inviteMember',
      target: 'u2',
      metadata: { role: 'learner', email: 'x@acme.test' },
    });
  });

  it('returns null for a malformed event (empty action)', () => {
    expect(buildAuditEvent({ actorUid: 'u1', action: '' }, NOW)).toBeNull();
  });
});

describe('recordAuditEvent', () => {
  it('appends a validated event to the sink and returns true', async () => {
    const audit = new FakeAuditLogPort();
    const ok = await recordAuditEvent(
      audit,
      { actorUid: 'u1', actorRole: 'superadmin', action: 'provisionTenant', target: 'acme' },
      NOW,
    );
    expect(ok).toBe(true);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({ action: 'provisionTenant', target: 'acme' });
  });

  it('is a no-op when no port is configured (returns false, never throws)', async () => {
    await expect(
      recordAuditEvent(undefined, { actorUid: 'u1', action: 'setUserRole' }, NOW),
    ).resolves.toBe(false);
  });

  it('never throws when the underlying write fails (best-effort)', async () => {
    const audit = new FakeAuditLogPort();
    audit.failNext = true;
    const ok = await recordAuditEvent(audit, { actorUid: 'u1', action: 'setUserRole' }, NOW);
    expect(ok).toBe(false);
    expect(audit.events).toHaveLength(0);
  });

  it('does not write (returns false) when the event is malformed', async () => {
    const calls: unknown[] = [];
    const port: AuditLogPort = {
      async append(e) {
        calls.push(e);
      },
    };
    const ok = await recordAuditEvent(port, { actorUid: 'u1', action: '' }, NOW);
    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
