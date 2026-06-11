import {
  formatScorm12Time,
  formatScorm2004Duration,
  parseScorm12Time,
  parseScorm2004Duration,
} from './scorm-time';

describe('scorm-time', () => {
  describe('SCORM 1.2 CMITimespan', () => {
    it('parses HH:MM:SS', () => {
      expect(parseScorm12Time('00:45:30')).toBe((45 * 60 + 30) * 1000);
      expect(parseScorm12Time('01:00:00')).toBe(3600_000);
    });

    it('parses 3-4 digit hours and hundredths', () => {
      expect(parseScorm12Time('0001:02:03.5')).toBe(3600_000 + 123_000 + 500);
      expect(parseScorm12Time('100:00:00')).toBe(100 * 3600_000);
    });

    it('rejects malformed timespans', () => {
      expect(parseScorm12Time('1:00:00')).toBeNull();
      expect(parseScorm12Time('00:65:00')).toBeNull();
      expect(parseScorm12Time('00:00:61')).toBeNull();
      expect(parseScorm12Time('PT1H')).toBeNull();
      expect(parseScorm12Time('abc')).toBeNull();
    });

    it('formats milliseconds back to HH:MM:SS', () => {
      expect(formatScorm12Time(0)).toBe('00:00:00');
      expect(formatScorm12Time(3600_000 + 15 * 60_000 + 30_000)).toBe('01:15:30');
      expect(formatScorm12Time(500)).toBe('00:00:00.50');
    });

    it('round-trips through parse/format', () => {
      const ms = parseScorm12Time('02:30:45');
      expect(formatScorm12Time(ms as number)).toBe('02:30:45');
    });
  });

  describe('SCORM 2004 ISO 8601 duration', () => {
    it('parses time-only durations', () => {
      expect(parseScorm2004Duration('PT1H30M5S')).toBe(3600_000 + 30 * 60_000 + 5000);
      expect(parseScorm2004Duration('PT0.5S')).toBe(500);
      expect(parseScorm2004Duration('PT90M')).toBe(90 * 60_000);
    });

    it('parses date components (Y=365d, M=30d)', () => {
      expect(parseScorm2004Duration('P1DT1H')).toBe(25 * 3600_000);
      expect(parseScorm2004Duration('P1M')).toBe(30 * 24 * 3600_000);
    });

    it('rejects malformed durations', () => {
      expect(parseScorm2004Duration('P')).toBeNull();
      expect(parseScorm2004Duration('PT')).toBeNull();
      expect(parseScorm2004Duration('1H')).toBeNull();
      expect(parseScorm2004Duration('00:30:00')).toBeNull();
    });

    it('formats milliseconds back to durations', () => {
      expect(formatScorm2004Duration(0)).toBe('PT0S');
      expect(formatScorm2004Duration(3600_000 + 30 * 60_000 + 5000)).toBe('PT1H30M5S');
      expect(formatScorm2004Duration(5500)).toBe('PT5.5S');
    });
  });
});
