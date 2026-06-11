/**
 * Duration helpers for the two SCORM time formats.
 *
 * - SCORM 1.2 uses CMITimespan: `HHHH:MM:SS[.SS]` with 2–4 hour digits
 *   (e.g. `00:45:30`, `0001:02:03.5`).
 * - SCORM 2004 uses ISO 8601 durations: `P[yY][mM][dD][T[hH][mM][s[.ss]S]]`
 *   (e.g. `PT1H30M5S`). Per common LMS convention, a year counts as 365 days
 *   and a month as 30 days when converting to absolute time.
 *
 * All helpers work in milliseconds and return `null` for strings that do not
 * conform to the format, so callers can map failures onto the proper SCORM
 * "type mismatch" error codes.
 */

const SCORM12_TIMESPAN = /^(\d{2,4}):(\d{2}):(\d{2})(?:\.(\d{1,2}))?$/;

const ISO8601_DURATION =
  /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d{1,2})?)S)?)?$/;

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Parses a SCORM 1.2 CMITimespan (`HH:MM:SS[.SS]`) into milliseconds. */
export function parseScorm12Time(value: string): number | null {
  const match = SCORM12_TIMESPAN.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) return null;
  const hundredths = match[4] ? Number(match[4].padEnd(2, '0')) : 0;
  return hours * MS_PER_HOUR + minutes * MS_PER_MINUTE + seconds * MS_PER_SECOND + hundredths * 10;
}

/** Formats milliseconds as a SCORM 1.2 CMITimespan (`HH:MM:SS[.SS]`). */
export function formatScorm12Time(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 10)); // hundredths
  const hundredths = total % 100;
  const totalSeconds = Math.floor(total / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  // CMITimespan caps at 4 hour digits; clamp rather than overflow the field.
  const hours = Math.min(Math.floor(totalSeconds / 3600), 9999);
  const pad = (n: number) => String(n).padStart(2, '0');
  const base = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return hundredths > 0 ? `${base}.${pad(hundredths)}` : base;
}

/** Parses a SCORM 2004 ISO 8601 duration (`PT1H30M5.5S`) into milliseconds. */
export function parseScorm2004Duration(value: string): number | null {
  const trimmed = value.trim();
  const match = ISO8601_DURATION.exec(trimmed);
  if (!match) return null;
  const [, years, months, days, hours, minutes, seconds] = match;
  // 'P' and 'PT' with no components are not valid durations.
  if (!years && !months && !days && !hours && !minutes && !seconds) return null;
  return (
    (Number(years ?? 0) * 365 + Number(months ?? 0) * 30 + Number(days ?? 0)) * MS_PER_DAY +
    Number(hours ?? 0) * MS_PER_HOUR +
    Number(minutes ?? 0) * MS_PER_MINUTE +
    Number(seconds ?? 0) * MS_PER_SECOND
  );
}

/** Formats milliseconds as a SCORM 2004 ISO 8601 duration (`PT1H30M5.5S`). */
export function formatScorm2004Duration(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 10)) / 100; // seconds, 2dp
  if (total === 0) return 'PT0S';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.round((total % 60) * 100) / 100;
  let out = 'PT';
  if (hours > 0) out += `${hours}H`;
  if (minutes > 0) out += `${minutes}M`;
  if (seconds > 0) out += `${seconds}S`;
  return out;
}
