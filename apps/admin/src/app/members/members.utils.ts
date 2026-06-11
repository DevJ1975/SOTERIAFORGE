import type { Member, MemberStatus, Role } from '@forge/shared';
import { AUTHORING_ROLES } from '@forge/shared';

/** Display name with email fallback — what the list sorts and renders by. */
export function memberLabel(member: Pick<Member, 'displayName' | 'email'>): string {
  return member.displayName?.trim() || member.email;
}

/** Single uppercase initial for the avatar disc. */
export function memberInitial(member: Pick<Member, 'displayName' | 'email'>): string {
  return memberLabel(member).charAt(0).toUpperCase() || '?';
}

/** Stable alphabetical order by display name (email fallback), then email. */
export function sortMembers(members: readonly Member[]): Member[] {
  return [...members].sort(
    (a, b) =>
      memberLabel(a).localeCompare(memberLabel(b), undefined, { sensitivity: 'base' }) ||
      a.email.localeCompare(b.email),
  );
}

/**
 * Client-side search-as-you-type filter over name, email, and role.
 * A blank query returns the input list unchanged.
 */
export function filterMembers(members: readonly Member[], query: string): Member[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...members];
  return members.filter(
    (m) =>
      (m.displayName ?? '').toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.role.toLowerCase().includes(q),
  );
}

/** Role chip flavor: ember for authoring roles, steel for everyone else. */
export function roleChipKind(role: Role): 'ember' | 'steel' {
  return AUTHORING_ROLES.includes(role) ? 'ember' : 'steel';
}

/** Status chip flavor: invited=notice, active=positive, deactivated=muted. */
export function statusChipKind(status: MemberStatus): 'notice' | 'positive' | 'muted' {
  switch (status) {
    case 'invited':
      return 'notice';
    case 'active':
      return 'positive';
    case 'deactivated':
      return 'muted';
  }
}

/** Upserts `member` into `members` by uid (used for optimistic inserts/updates). */
export function upsertMember(members: readonly Member[], member: Member): Member[] {
  const index = members.findIndex((m) => m.uid === member.uid);
  if (index === -1) return sortMembers([...members, member]);
  const next = [...members];
  next[index] = member;
  return sortMembers(next);
}
