/**
 * DESIGN PLACEHOLDERS for the learner Home screen (forge_home.jpg).
 *
 * The data sources for these cards do not exist yet (see
 * docs/forge-platform-plan.md §5: Home is Phase 2–3; Engage is Phase 5). They
 * are static, typed values — no network calls — passed to the Home cards as
 * inputs, so swapping in real data later only changes DashboardComponent.
 *
 * Wired to real data today: learner name, streak count, 14-day strip
 * (member.streakDays + lastActiveAt) and earned badges (member.earnedBadgeIds).
 */
import type {
  CoachNudge,
  ContinueLearning,
  LiveSession,
  MissionBadge,
  PulseToday,
  WeekItem,
} from './home.models';

export const HOME_PLACEHOLDER_CONTINUE: ContinueLearning = {
  courseTitle: 'AI Cyber Defender',
  subtitle: 'Week 5 · Secure I: the AI attack surface',
  percent: 56,
  ringCaption: 'Week 5',
  resumeLabel: 'Resume Module 5.1',
  resumeLink: '/courses',
  timeLeft: '14 min left',
};

export const HOME_PLACEHOLDER_PULSE: PulseToday = {
  message: '10-minute micro-lesson ready',
};

/** Today, 6:00–8:00 PM local, so the card and greeting stay consistent. */
export function homePlaceholderLiveSession(now: Date): LiveSession {
  const at = (h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0);
  return {
    title: 'Lab Day · Forge Engage',
    startsAt: at(18),
    endsAt: at(20),
    instructor: 'Jamil Jones',
    crewName: 'Crew Alpha',
    crewCheckedIn: 5,
    link: '/engage',
  };
}

export const HOME_PLACEHOLDER_DAY_THEME = 'Lab Day';

export const HOME_PLACEHOLDER_WEEK: readonly WeekItem[] = [
  { day: 'Mon', mode: 'Live', title: 'The OWASP LLM Top 10', state: 'done' },
  {
    day: 'Tue',
    mode: 'Forge',
    title: 'Module 5.1 Prompt injection',
    detail: '2 of 3 lessons',
    state: 'done',
  },
  { day: 'Wed', mode: 'Live', title: 'Lab · Prompt-Injection CTF', state: 'today' },
  { day: 'Thu', mode: 'Forge', title: 'Knowledge check 5 · finding report', state: 'upcoming' },
  { day: 'Fri', mode: 'Live', title: 'Game Day · Red vs Blue', state: 'upcoming' },
];

export const HOME_PLACEHOLDER_BADGES: readonly MissionBadge[] = [
  { id: 'recruit', name: 'Recruit', icon: 'badge-recruit', kind: 'mission', placeholderState: 'earned' },
  { id: 'operator', name: 'Operator', icon: 'badge-operator', kind: 'mission', placeholderState: 'earned' },
  { id: 'analyst', name: 'Analyst', icon: 'badge-analyst', kind: 'mission', placeholderState: 'earned' },
  {
    id: 'ai-ready-professional',
    name: 'AI-Ready Professional',
    icon: 'badge-shield-check',
    kind: 'credential',
    placeholderState: 'credential',
  },
  { id: 'red-cell', name: 'Red Cell', icon: 'badge-shield', kind: 'mission', placeholderState: 'progress' },
  { id: 'blue-cell', name: 'Blue Cell', icon: 'badge-shield', kind: 'mission', placeholderState: 'locked' },
  { id: 'field-ready', name: 'Field Ready', icon: 'badge-shield', kind: 'mission', placeholderState: 'locked' },
  { id: 'crew-lead', name: 'Crew Lead', icon: 'users-crew', kind: 'mission', placeholderState: 'locked' },
];

export const HOME_PLACEHOLDER_COACH: CoachNudge = {
  message:
    "You missed one item on Knowledge check 4 (false-positive tuning). Want a 3-question review before tonight's lab?",
  sources: ['Knowledge check 4', 'Module 4.3 · Alert tuning'],
  acceptLabel: 'Yes, quiz me',
  acceptLink: '/tutor',
  acceptQueryParams: { topic: 'false-positive tuning' },
  dismissLabel: 'Later',
};
