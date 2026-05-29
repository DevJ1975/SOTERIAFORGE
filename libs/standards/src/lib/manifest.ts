/**
 * Minimal SCORM imsmanifest.xml parser. Extracts what the runtime needs to
 * launch a package: the launch href (the resource for the first SCO), the SCORM
 * version, and the package title. Uses DOMParser (available in browsers and in
 * the jsdom test environment).
 */
export interface ScormManifest {
  title: string;
  /** '1.2' or '2004' (best-effort from the schemaversion/metadata). */
  scormVersion: '1.2' | '2004';
  /** Relative href of the launch resource, e.g. "index.html". */
  launchHref: string;
}

export class ScormManifestError extends Error {}

export function parseImsManifest(xml: string): ScormManifest {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new ScormManifestError('imsmanifest.xml is not well-formed XML');
  }

  const manifest = doc.getElementsByTagName('manifest')[0];
  if (!manifest) throw new ScormManifestError('No <manifest> element found');

  // SCORM version: SCORM 1.2 uses schemaversion "1.2"; 2004 uses "2004 Nth Edition"
  // or CAM 1.3. Default to 2004 when ambiguous.
  const schemaVersion = doc.getElementsByTagName('schemaversion')[0]?.textContent?.trim() ?? '';
  const scormVersion: '1.2' | '2004' = schemaVersion.includes('1.2') ? '1.2' : '2004';

  const title =
    doc.getElementsByTagName('title')[0]?.textContent?.trim() ||
    manifest.getAttribute('identifier') ||
    'SCORM package';

  // Resolve the launch href: find the first organization's first item's
  // referenced resource, falling back to the first SCO resource.
  const launchHref = resolveLaunchHref(doc);
  if (!launchHref) throw new ScormManifestError('Could not resolve a launch href');

  return { title, scormVersion, launchHref };
}

function resolveLaunchHref(doc: Document): string | null {
  const resources = Array.from(doc.getElementsByTagName('resource'));

  // Prefer the resource referenced by the first <item identifierref=...>.
  const firstItem = doc.querySelector('organizations organization item[identifierref]');
  const ref = firstItem?.getAttribute('identifierref');
  if (ref) {
    const res = resources.find((r) => r.getAttribute('identifier') === ref);
    const href = res?.getAttribute('href');
    if (href) return href;
  }

  // Fallback: first SCO resource (scormtype/adlcp:scormtype === 'sco') with an href.
  const sco = resources.find(
    (r) =>
      (r.getAttribute('adlcp:scormtype') ?? r.getAttribute('scormtype'))?.toLowerCase() === 'sco' &&
      r.getAttribute('href'),
  );
  if (sco) return sco.getAttribute('href');

  // Last resort: first resource with an href.
  return resources.find((r) => r.getAttribute('href'))?.getAttribute('href') ?? null;
}
