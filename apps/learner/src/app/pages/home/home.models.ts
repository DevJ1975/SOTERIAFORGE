import type { SfBadgeState, SfIconName } from '@assurance/ui';

/** Continue card: the learner's current course and next module. */
export interface ContinueLearning {
  readonly courseTitle: string;
  /** e.g. "Week 5 · Secure I: the AI attack surface" */
  readonly subtitle: string;
  /** Course progress, 0–100. */
  readonly percent: number;
  /** Caption under the ring percentage, e.g. "Week 5". */
  readonly ringCaption: string;
  /** Primary action label, e.g. "Resume Module 5.1". */
  readonly resumeLabel: string;
  readonly resumeLink: string;
  /** e.g. "14 min left" */
  readonly timeLeft: string;
}

/** Pulse card extras (the streak itself comes from the member doc). */
export interface PulseToday {
  /** e.g. "10-minute micro-lesson ready" */
  readonly message: string;
}

/** Next live (Forge Engage) session. */
export interface LiveSession {
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly instructor: string;
  readonly crewName: string;
  readonly crewCheckedIn: number;
  readonly link: string;
}

export type WeekItemState = 'done' | 'today' | 'upcoming';

/** One row of the "This week" plan. */
export interface WeekItem {
  readonly day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  /** "Live" (instructor-led) or "Forge" (self-paced). */
  readonly mode: 'Live' | 'Forge';
  readonly title: string;
  /** Muted trailing detail, e.g. "2 of 3 lessons". */
  readonly detail?: string;
  readonly state: WeekItemState;
}

/** A badge in the mission catalog. */
export interface MissionBadge {
  readonly id: string;
  readonly name: string;
  readonly icon: SfIconName;
  /** `credential` badges are SFG-issued credentials (gold); others are missions. */
  readonly kind: 'mission' | 'credential';
  /** State to show when no member data is available (design placeholder). */
  readonly placeholderState: SfBadgeState;
}

/** AI coach nudge. The coach never grades and always shows its sources. */
export interface CoachNudge {
  readonly message: string;
  /** Where the coach's suggestion comes from (shown verbatim). */
  readonly sources: readonly string[];
  readonly acceptLabel: string;
  readonly acceptLink: string;
  readonly acceptQueryParams?: Record<string, string>;
  readonly dismissLabel: string;
}

/**
 * Resolve badge states from the member's server-authoritative earned list.
 * Without member data the catalog's placeholder states are used as-is.
 */
export function resolveBadgeStates(
  catalog: readonly MissionBadge[],
  earnedIds: readonly string[] | null,
): { badge: MissionBadge; state: SfBadgeState }[] {
  return catalog.map((badge) => {
    if (earnedIds === null) return { badge, state: badge.placeholderState };
    if (earnedIds.includes(badge.id)) {
      return { badge, state: badge.kind === 'credential' ? 'credential' : 'earned' };
    }
    const fallback = badge.placeholderState === 'progress' ? 'progress' : 'locked';
    return { badge, state: fallback };
  });
}

/** "Good morning" / "Good afternoon" / "Good evening" for the learner's local time. */
export function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const timeZoneFmt = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

/** "6:00 PM" */
export const formatTime = (d: Date): string => timeFmt.format(d);
/** "6:00 PM PDT" */
export const formatTimeWithZone = (d: Date): string => timeZoneFmt.format(d);

/** "6:00–8:00 PM" when both ends share AM/PM, else "11:00 AM–1:00 PM". */
export function formatTimeRange(start: Date, end: Date): string {
  const s = formatTime(start);
  const e = formatTime(end);
  const sameMeridiem = s.slice(-2) === e.slice(-2);
  return `${sameMeridiem ? s.slice(0, -3) : s}–${e}`;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
