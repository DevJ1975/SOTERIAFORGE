import { parseManifestXml } from './manifest-node';

const scorm12 = `<?xml version="1.0"?>
<manifest identifier="PKG-1" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1"><title>Fire Safety</title>
      <item identifier="I1" identifierref="R1"><title>Intro</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="R1" type="webcontent" adlcp:scormtype="sco" href="index.html"/>
  </resources>
</manifest>`;

const scorm2004 = `<?xml version="1.0"?>
<manifest identifier="PKG-2">
  <metadata><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1"><title>Compliance</title>
      <item identifier="I1" identifierref="RES-A"><title>Module</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-A" scormtype="sco" href="content/start.html"/>
  </resources>
</manifest>`;

describe('parseManifestXml (Node)', () => {
  it('parses SCORM 1.2 (version + launch href + title)', () => {
    const m = parseManifestXml(scorm12);
    expect(m.scormVersion).toBe('1.2');
    expect(m.launchHref).toBe('index.html');
    expect(m.title).toBe('Fire Safety');
  });

  it('parses SCORM 2004 and resolves item->resource href', () => {
    const m = parseManifestXml(scorm2004);
    expect(m.scormVersion).toBe('2004');
    expect(m.launchHref).toBe('content/start.html');
  });

  it('throws when no launch href can be resolved', () => {
    expect(() =>
      parseManifestXml('<manifest identifier="P"><resources></resources></manifest>'),
    ).toThrow();
  });
});
