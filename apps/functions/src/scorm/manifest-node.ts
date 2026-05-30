import { XMLParser } from 'fast-xml-parser';

/**
 * Node-side SCORM imsmanifest.xml parser (the @forge/standards `parseImsManifest`
 * uses the browser DOMParser, unavailable in Cloud Functions). Extracts the
 * launch href, SCORM version, and title using fast-xml-parser.
 */
export interface ScormManifestInfo {
  title: string;
  scormVersion: '1.2' | '2004';
  launchHref: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- parsed XML is dynamically shaped */
const asArray = (v: any): any[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

export function parseManifestXml(xml: string): ScormManifestInfo {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc: any = parser.parse(xml);
  const manifest: any = doc?.manifest;
  if (!manifest) throw new Error('No <manifest> element');

  const schemaVersion = String(manifest?.metadata?.schemaversion ?? '');
  const scormVersion: '1.2' | '2004' = schemaVersion.includes('1.2') ? '1.2' : '2004';

  const organization: any = asArray(manifest?.organizations?.organization)[0];
  const title =
    String(organization?.title ?? manifest['@_identifier'] ?? 'SCORM package') || 'SCORM package';

  const resources: any[] = asArray(manifest?.resources?.resource);

  // Prefer the resource referenced by the first item; else first SCO; else first href.
  const firstItem: any = asArray(organization?.item)[0];
  const ref: string | undefined = firstItem?.['@_identifierref'];
  let href: string | undefined;
  if (ref) href = resources.find((r) => r['@_identifier'] === ref)?.['@_href'];
  if (!href) {
    href = resources.find(
      (r) =>
        String(r['@_adlcp:scormtype'] ?? r['@_scormtype'] ?? '').toLowerCase() === 'sco' &&
        r['@_href'],
    )?.['@_href'];
  }
  if (!href) href = resources.find((r) => r['@_href'])?.['@_href'];
  if (!href) throw new Error('Could not resolve a launch href');

  return { title, scormVersion, launchHref: href };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
