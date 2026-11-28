import { activity, sessionState, T0 } from './engage-session.fixtures';
import {
  activityRemainingMs,
  clock,
  countdownAnnouncement,
  crewFirst,
  debriefStage,
  huddleStage,
  longClock,
  ordinal,
  pageCount,
  pageOf,
  parsePing,
  percent,
  stageRemainingMs,
} from './engage-session.model';

const tile = (participantId: string, staff = false) => ({ participantId, staff, local: false });

describe('engage session model', () => {
  it('counts the stage and the activity down from server times', () => {
    // The 3-minute hunt stage started a minute before T0.
    expect(stageRemainingMs(sessionState(), T0)).toBe(120_000);
    expect(stageRemainingMs(sessionState(), T0 + 10 * 60_000)).toBe(0);
    expect(activityRemainingMs(activity(), T0 + 31_000)).toBe(149_000);
    expect(activityRemainingMs(activity({ status: 'closed' }), T0)).toBe(0);
  });

  it('formats clocks, ordinals and percentages', () => {
    expect(clock(149_000)).toBe('2:29');
    expect(clock(400)).toBe('0:01');
    expect(clock(-5)).toBe('0:00');
    expect(longClock(842_000)).toBe('14:02');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '103rd',
    ]);
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });

  it('announces a countdown at the start, 30 s, 10 s and the end only', () => {
    expect(countdownAnnouncement(null, 180_000, 'Threat Hunt')).toBe(
      'Threat Hunt is open. 3 minutes to answer.',
    );
    expect(countdownAnnouncement(null, 45_000, 'The poll')).toBe(
      'The poll is open. 45 seconds to answer.',
    );
    expect(countdownAnnouncement(120_000, 119_000, 'Threat Hunt')).toBe('');
    expect(countdownAnnouncement(31_000, 30_000, 'Threat Hunt')).toBe('30 seconds left.');
    expect(countdownAnnouncement(30_000, 29_000, 'Threat Hunt')).toBe('');
    expect(countdownAnnouncement(11_000, 10_000, 'Threat Hunt')).toBe('10 seconds left.');
    expect(countdownAnnouncement(1_000, 0, 'Threat Hunt')).toBe('Threat Hunt is closed.');
    expect(countdownAnnouncement(0, 0, 'Threat Hunt')).toBe('');
  });

  it('orders hosts first, then my crew, then the rest, keeping join order inside each', () => {
    const tiles = [tile('z'), tile('crew-2'), tile('host', true), tile('a'), tile('crew-1')];
    expect(crewFirst(tiles, ['crew-1', 'crew-2']).map((t) => t.participantId)).toEqual([
      'host',
      'crew-2',
      'crew-1',
      'z',
      'a',
    ]);
    // With no crew, nothing moves except hosts.
    expect(crewFirst(tiles, []).map((t) => t.participantId)).toEqual([
      'host',
      'z',
      'crew-2',
      'a',
      'crew-1',
    ]);
  });

  it('pages six tiles at a time and clamps the page', () => {
    const items = Array.from({ length: 14 }, (_, i) => i);
    expect(pageCount(14)).toBe(3);
    expect(pageCount(0)).toBe(1);
    expect(pageOf(items, 1)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(pageOf(items, 3)).toEqual([12, 13]);
    expect(pageOf(items, 9)).toEqual([12, 13]);
    expect(pageOf(items, 0)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('reads the server ping and ignores anything else', () => {
    const bytes = (text: string) => new TextEncoder().encode(text);
    expect(parsePing(bytes('{"sessionId":"s1","version":7}'))).toEqual({
      sessionId: 's1',
      version: 7,
    });
    expect(parsePing(bytes('{"sessionId":"s1"}'))).toEqual({ sessionId: 's1', version: 0 });
    expect(parsePing(bytes('{"version":7}'))).toBeNull();
    expect(parsePing(bytes('not json'))).toBeNull();
    expect(parsePing(bytes('[1]'))).toBeNull();
  });

  it('knows which stages show notes and the debrief', () => {
    const at = (stageIndex: number) =>
      sessionState({ block: { ...sessionState().block, stageIndex } });
    expect([0, 1, 2, 3, 4].map((i) => huddleStage(at(i)))).toEqual([
      false,
      false,
      true,
      true,
      false,
    ]);
    expect(debriefStage(at(4))).toBe(true);
    expect(debriefStage(at(1))).toBe(false);
  });
});
