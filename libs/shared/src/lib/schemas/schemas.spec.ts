import { customClaims } from './identity';
import { tenant, member } from './tenant';
import { course, module as moduleSchema, enrollment } from './course';
import { catalogProduct } from './commerce';
import { badge, leaderboard } from './gamification';
import { tenantId } from './primitives';

const audit = { createdAt: '2026-01-01T00:00:00Z' };

describe('primitives', () => {
  it('accepts DNS-safe tenant ids', () => {
    expect(tenantId.safeParse('acme-corp').success).toBe(true);
    expect(tenantId.safeParse('a1').success).toBe(true);
  });

  it.each(['-leading', 'trailing-', 'UPPER', 'has_underscore', 'a', 'a'.repeat(64)])(
    'rejects invalid tenant id %p',
    (id) => {
      expect(tenantId.safeParse(id).success).toBe(false);
    },
  );
});

describe('customClaims', () => {
  it('requires tenantId for tenant-scoped roles', () => {
    expect(customClaims.safeParse({ role: 'learner' }).success).toBe(false);
    expect(customClaims.safeParse({ role: 'learner', tenantId: 'acme' }).success).toBe(true);
  });

  it('allows superadmin without tenantId', () => {
    const parsed = customClaims.parse({ role: 'superadmin' });
    expect(parsed.entitlements).toEqual([]);
  });
});

describe('tenant', () => {
  it('parses a minimal tenant and applies defaults', () => {
    const parsed = tenant.parse({ ...audit, id: 'acme', name: 'Acme', status: 'active' });
    expect(parsed.plan).toBe('starter');
    expect(parsed.branding.colors).toEqual({});
  });

  it('rejects unknown statuses', () => {
    expect(tenant.safeParse({ ...audit, id: 'acme', name: 'Acme', status: 'nope' }).success).toBe(
      false,
    );
  });
});

describe('member', () => {
  it('defaults gamification counters', () => {
    const parsed = member.parse({
      ...audit,
      uid: 'u1',
      tenantId: 'acme',
      role: 'learner',
      status: 'active',
      email: 'learner@example.com',
    });
    expect(parsed.xp).toBe(0);
    expect(parsed.level).toBe(1);
  });

  it('rejects invalid emails', () => {
    expect(
      member.safeParse({
        ...audit,
        uid: 'u1',
        tenantId: 'acme',
        role: 'learner',
        status: 'active',
        email: 'not-an-email',
      }).success,
    ).toBe(false);
  });
});

describe('course content', () => {
  it('parses a course with defaults', () => {
    const parsed = course.parse({ ...audit, id: 'c1', tenantId: 'acme', title: 'Safety 101' });
    expect(parsed.status).toBe('draft');
    expect(parsed.xpReward).toBe(0);
  });

  it('parses a module with completion criteria', () => {
    const parsed = moduleSchema.parse({
      ...audit,
      id: 'm1',
      courseId: 'c1',
      tenantId: 'acme',
      title: 'Intro',
      order: 0,
      contentType: 'video',
      completion: { minProgressPct: 80 },
    });
    expect(parsed.completion.minProgressPct).toBe(80);
  });

  it('rejects out-of-range progress on enrollments', () => {
    expect(
      enrollment.safeParse({
        ...audit,
        uid: 'u1',
        courseId: 'c1',
        tenantId: 'acme',
        progressPct: 120,
      }).success,
    ).toBe(false);
  });
});

describe('commerce', () => {
  it('parses a catalog product', () => {
    const parsed = catalogProduct.parse({
      ...audit,
      id: 'p1',
      title: 'All Access',
      grants: { kind: 'all_access' },
      stripePriceId: 'price_123',
      mode: 'subscription',
    });
    expect(parsed.published).toBe(false);
  });

  it('rejects an unknown grant kind', () => {
    expect(
      catalogProduct.safeParse({
        ...audit,
        id: 'p1',
        title: 'X',
        grants: { kind: 'bundle' },
        stripePriceId: 'price_123',
        mode: 'payment',
      }).success,
    ).toBe(false);
  });
});

describe('gamification', () => {
  it('parses a badge with defaults', () => {
    const parsed = badge.parse({ ...audit, id: 'b1', tenantId: 'acme', name: 'First Steps' });
    expect(parsed.criteria).toBe('');
  });

  it('parses a leaderboard and rejects bad periods', () => {
    expect(leaderboard.safeParse({ ...audit, tenantId: 'acme', period: 'weekly' }).success).toBe(
      true,
    );
    expect(leaderboard.safeParse({ ...audit, tenantId: 'acme', period: 'monthly' }).success).toBe(
      false,
    );
  });
});
