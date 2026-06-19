/**
 * On-theme, fully self-contained image placeholders for seed course content.
 *
 * Demo venues (an airport) routinely have restricted or captive-portal wifi, so
 * external image hosts (e.g. images.unsplash.com) can fail to load mid-lesson
 * and show a broken image. To stay resilient we render every lesson `image`
 * block (and each course `coverImageUrl`) from an inline `data:image/svg+xml`
 * URI: it needs no network, always renders, and is painted in the ATL aviation
 * brand (navy #0B3D91 / jet-bridge teal #00A3A1, white foreground).
 *
 * The captions/alt text on the blocks stay as the human-readable description;
 * these SVGs simply carry an on-brand label so the player never shows a void.
 */

const NAVY = '#0B3D91';
const NAVY_DEEP = '#072a66';
const TEAL = '#00A3A1';
const FG = '#FFFFFF';

/** XML-escape text destined for an SVG `<text>` node. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build an aviation-navy/teal SVG placeholder as a `data:` URI. `label` is the
 * on-image caption; it validates against both the `image` block (`z.string()`)
 * and `coverImageUrl` (`z.string().url()`) schemas.
 */
export function placeholderImage(label: string): string {
  const safe = escapeXml(label);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="788" viewBox="0 0 1400 788" role="img" aria-label="${safe}">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="${NAVY_DEEP}"/>`,
    `</linearGradient></defs>`,
    `<rect width="1400" height="788" fill="url(#g)"/>`,
    `<rect x="0" y="700" width="1400" height="88" fill="${TEAL}"/>`,
    `<g fill="none" stroke="${TEAL}" stroke-width="6" opacity="0.55">`,
    `<circle cx="700" cy="330" r="120"/><circle cx="700" cy="330" r="60"/>`,
    `<path d="M520 330 H880 M700 150 V510"/>`,
    `</g>`,
    `<text x="700" y="600" fill="${FG}" font-family="Segoe UI, Helvetica, Arial, sans-serif" ` +
      `font-size="44" font-weight="700" text-anchor="middle">${safe}</text>`,
    `<text x="700" y="754" fill="${FG}" font-family="Segoe UI, Helvetica, Arial, sans-serif" ` +
      `font-size="30" font-weight="600" text-anchor="middle" opacity="0.9">ATL Ramp Safety Academy</text>`,
    `</svg>`,
  ].join('');
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
