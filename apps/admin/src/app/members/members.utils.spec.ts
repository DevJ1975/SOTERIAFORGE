import type { Member } from '@forge/shared';
import {
  filterMembers,
  memberInitial,
  memberLabel,
  roleChipKind,
  sortMembers,
  statusChipKind,
  upsertMember,
} from './members.utils';

function makeMember(overrides: Partial<Member> & Pick<Member, 'uid' | 'email'>): Member {
  return {
    tenantId: 'acme',
    role: 'learner',
    status: 'active',
    xp: 0,
    level: 1,
    streakDays: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const ada = makeMember({ uid: 'u1', email: 'ada@acme.io', displayName: 'Ada Lovelace' });
const grace = makeMember({
  uid: 'u2',
  email: 'grace@acme.io',
  displayName: 'Grace Hopper',
  role: 'instructor',
});
const noName = makeMember({ uid: 'u3', email: 'zoe@acme.io', status: 'invited' });

describe('memberLabel / memberInitial', () => {
  it('prefers the display name and falls back to email', () => {
    expect(memberLabel(ada)).toBe('Ada Lovelace');
    expect(memberLabel(noName)).toBe('zoe@acme.io');
    expect(memberLabel({ displayName: '   ', email: 'x@y.z' })).toBe('x@y.z');
  });

  it('derives a single uppercase initial', () => {
    expect(memberInitial(ada)).toBe('A');
    expect(memberInitial(noName)).toBe('Z');
    expect(memberInitial({ displayName: '', email: '' })).toBe('?');
  });
});

describe('sortMembers', () => {
  it('orders by display name (email fallback), case-insensitively', () => {
    const sorted = sortMembers([noName, grace, ada]);
    expect(sorted.map((m) => m.uid)).toEqual(['u1', 'u2', 'u3']);
  });

  it('does not mutate the input', () => {
    const input = [noName, ada];
    sortMembers(input);
    expect(input[0]).toBe(noName);
  });
});

describe('filterMembers', () => {
  const all = [ada, grace, noName];

  it('returns everyone for a blank query', () => {
    expect(filterMembers(all, '')).toEqual(all);
    expect(filterMembers(all, '   ')).toEqual(all);
  });

  it('matches display name fragments, case-insensitively', () => {
    expect(filterMembers(all, 'LOVE').map((m) => m.uid)).toEqual(['u1']);
  });

  it('matches email fragments', () => {
    expect(filterMembers(all, 'zoe@').map((m) => m.uid)).toEqual(['u3']);
    expect(filterMembers(all, 'acme.io')).toHaveLength(3);
  });

  it('matches roles', () => {
    expect(filterMembers(all, 'instructor').map((m) => m.uid)).toEqual(['u2']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterMembers(all, 'nobody-here')).toEqual([]);
  });
});

describe('chip kinds', () => {
  it('marks authoring roles as ember and the rest as steel', () => {
    expect(roleChipKind('superadmin')).toBe('ember');
    expect(roleChipKind('tenant_admin')).toBe('ember');
    expect(roleChipKind('instructor')).toBe('ember');
    expect(roleChipKind('learner')).toBe('steel');
    expect(roleChipKind('b2c_customer')).toBe('steel');
  });

  it('maps member statuses onto chip flavors', () => {
    expect(statusChipKind('invited')).toBe('notice');
    expect(statusChipKind('active')).toBe('positive');
    expect(statusChipKind('deactivated')).toBe('muted');
  });
});

describe('upsertMember', () => {
  it('inserts new members in sorted position', () => {
    const next = upsertMember([grace, noName], ada);
    expect(next.map((m) => m.uid)).toEqual(['u1', 'u2', 'u3']);
  });

  it('replaces an existing member by uid (optimistic role change)', () => {
    const promoted = { ...ada, role: 'tenant_admin' as const };
    const next = upsertMember([ada, grace], promoted);
    expect(next).toHaveLength(2);
    expect(next.find((m) => m.uid === 'u1')?.role).toBe('tenant_admin');
  });

  it('does not mutate the input list', () => {
    const input = [ada];
    upsertMember(input, grace);
    expect(input).toHaveLength(1);
  });
});
