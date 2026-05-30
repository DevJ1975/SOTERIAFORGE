import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions/v2';
import AdmZip from 'adm-zip';
import { getStorage } from 'firebase-admin/storage';
import { db } from '../lib/admin';
import { parseManifestXml } from './manifest-node';

/**
 * Unzip-on-upload for SCORM packages. When a `.zip` lands under
 * `tenants/{tenantId}/scorm/uploads/{packageId}.zip`, extract it to
 * `tenants/{tenantId}/scorm/packages/{packageId}/`, parse `imsmanifest.xml`, and
 * record the launch info in `tenants/{tenantId}/scormPackages/{packageId}`.
 *
 * The author then points a `scorm` module at the recorded launch URL. Serving
 * the extracted package (signed URL / hosting path so relative assets resolve)
 * is wired at deployment.
 *
 * NOTE: requires live Cloud Storage; exercised in deployed environments.
 */
export const onScormUpload = onObjectFinalized({ memory: '512MiB' }, async (event) => {
  const name = event.data.name ?? '';
  const match = /^tenants\/([^/]+)\/scorm\/uploads\/([^/]+)\.zip$/.exec(name);
  if (!match) return; // not a SCORM upload

  const [, tenantId, packageId] = match;
  const bucket = getStorage().bucket(event.data.bucket);
  const recordRef = db.doc(`tenants/${tenantId}/scormPackages/${packageId}`);
  await recordRef.set(
    { tenantId, packageId, status: 'extracting', updatedAt: new Date().toISOString() },
    { merge: true },
  );

  try {
    const [buf] = await bucket.file(name).download();
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();

    const manifestEntry = entries.find((e) => /(^|\/)imsmanifest\.xml$/i.test(e.entryName));
    if (!manifestEntry) throw new Error('imsmanifest.xml not found in package');
    const baseDir = manifestEntry.entryName.replace(/imsmanifest\.xml$/i, '');
    const manifest = parseManifestXml(manifestEntry.getData().toString('utf8'));

    const destPrefix = `tenants/${tenantId}/scorm/packages/${packageId}/`;
    await Promise.all(
      entries
        .filter((e) => !e.isDirectory && e.entryName.startsWith(baseDir))
        .map((e) =>
          bucket.file(`${destPrefix}${e.entryName.slice(baseDir.length)}`).save(e.getData()),
        ),
    );

    const launchPath = `${destPrefix}${manifest.launchHref}`;
    await recordRef.set(
      {
        status: 'ready',
        title: manifest.title,
        scormVersion: manifest.scormVersion,
        launchHref: manifest.launchHref,
        launchPath, // storage path; resolve to a served URL at deploy time
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    logger.info('SCORM package extracted', { tenantId, packageId, launchPath });
  } catch (err) {
    await recordRef.set(
      { status: 'failed', error: (err as Error).message, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    logger.error('SCORM extraction failed', { tenantId, packageId, error: (err as Error).message });
  }
});
